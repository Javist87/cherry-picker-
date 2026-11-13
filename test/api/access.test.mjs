// Negative tilgangstester N-01 til N-22 fra docs/access-matrix.md, kjørt mot API-et over HTTP
// med testbrukere per rolle. Lagring og identitet er utviklingsadaptere. Bare fiktive data.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, USERS, createCase, caseBody, randomId, createTestClock } from './helpers.mjs';

const U = USERS;
let t, egenSak, kollegasSak, annetTeam, annenAvdeling;

before(async () => {
  t = await startServer();
  egenSak = await createCase(t, U.selgerA);
  kollegasSak = await createCase(t, U.selgerB);
  annetTeam = await createCase(t, U.selgerC);
  annenAvdeling = await createCase(t, U.selgerV, { municipality: 'Bergen' });
});
after(() => t.close());

const ids = response => response.body.items.map(c => c.id).sort();
const comparable = response => ({
  status: response.status,
  body: { ...response.body, requestId: null },
  headers: Object.fromEntries([...response.headers].filter(([k]) => !['date', 'x-request-id'].includes(k))),
});
// Sak med avtale og ventende overlevering fra selger A til selger B.
async function ventendeOverlevering() {
  const sak = await createCase(t, U.selgerA, { agreementDate: t.today() });
  const res = await t.as(U.selgerA).post(`/cases/${sak.id}/handoffs`, { toUserId: U.selgerB.id }, { ifMatch: sak.etag });
  assert.equal(res.status, 201);
  return { sak: res.body, etag: res.etag, handoffId: res.body.pendingHandoff.id };
}

test('N-01 direkte oppslag: selger får 404 på kollegas sak, sak i annet team og sak i annen avdeling', async () => {
  const a = t.as(U.selgerA);
  assert.equal((await a.get('/cases/' + egenSak.id)).status, 200);
  for (const sak of [kollegasSak, annetTeam, annenAvdeling]) {
    const res = await a.get('/cases/' + sak.id);
    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'not_found');
  }
});

test('N-02 svar utenfor innsyn er identisk med svar for sak som ikke finnes (status, innhold og headere)', async () => {
  const a = t.as(U.selgerA);
  assert.deepEqual(comparable(await a.get('/cases/' + annenAvdeling.id)), comparable(await a.get('/cases/' + randomId())));
  assert.deepEqual(comparable(await a.get(`/cases/${kollegasSak.id}/events`)), comparable(await a.get(`/cases/${randomId()}/events`)));
  const tl = t.as(U.teamlederT1);
  const patch = id => tl.patch('/cases/' + id, { name: 'Endret' }, { ifMatch: '"1"' });
  assert.deepEqual(comparable(await patch(annetTeam.id)), comparable(await patch(randomId())));
  // Uten If-Match skal svaret fortsatt være 404, ikke 428, slik at eksistens ikke kan utledes.
  assert.deepEqual(comparable(await tl.patch('/cases/' + annetTeam.id, { name: 'Endret' })), comparable(await tl.patch('/cases/' + randomId(), { name: 'Endret' })));
  assert.equal((await a.get('/cases/ikke-en-uuid')).status, 404);
});

test('N-03 teamleder får 404 utenfor team, avdelingsleder får 404 utenfor avdeling', async () => {
  const tl = t.as(U.teamlederT1), al = t.as(U.avdelingslederT);
  assert.equal((await tl.get('/cases/' + kollegasSak.id)).status, 200);
  assert.equal((await tl.get('/cases/' + annetTeam.id)).status, 404);
  assert.equal((await tl.get('/cases/' + annenAvdeling.id)).status, 404);
  assert.equal((await al.get('/cases/' + annetTeam.id)).status, 200);
  assert.equal((await al.get('/cases/' + annenAvdeling.id)).status, 404);
});

test('N-04 søk: treff og totalantall inneholder bare saker i omfanget, også ved søk på eksakt navn', async () => {
  const s = await startServer();
  try {
    const egen = await createCase(s, U.selgerA), kollega = await createCase(s, U.selgerB), t2 = await createCase(s, U.selgerC), vest = await createCase(s, U.selgerV);
    const alle = await s.as(U.selgerA).get('/cases');
    assert.deepEqual(ids(alle), [egen.id]);
    assert.equal(alle.body.total, 1);
    const eksakt = await s.as(U.selgerA).get('/cases?q=' + encodeURIComponent(vest.name));
    assert.deepEqual([eksakt.body.total, eksakt.body.items.length], [0, 0]);
    assert.equal((await s.as(U.selgerA).get('/cases?ownerId=' + U.selgerB.id)).body.total, 0);
    assert.deepEqual(ids(await s.as(U.teamlederT1).get('/cases')), [egen.id, kollega.id].sort());
    assert.deepEqual(ids(await s.as(U.avdelingslederT).get('/cases')), [egen.id, kollega.id, t2.id].sort());
    const v = await s.as(U.avdelingslederV).get('/cases');
    assert.deepEqual([ids(v), v.body.total], [[vest.id], 1]);
  } finally { await s.close(); }
});

test('N-05 søk: teknisk administrator, leder, revisor og inntakstjeneste får 403', async () => {
  for (const u of [U.admin, U.leder, U.revisor, U.inntak]) {
    const res = await t.as(u).get('/cases');
    assert.equal(res.status, 403, u.displayName);
    assert.equal(res.body.code, 'forbidden_operation');
    assert.equal(res.body.items, undefined);
  }
});

test('N-06 endring: selger får 404 ved endring av sak selgeren ikke eier, og saken er uendret', async () => {
  const res = await t.as(U.selgerB).patch('/cases/' + egenSak.id, { name: 'Overtatt' }, { ifMatch: egenSak.etag });
  assert.equal(res.status, 404);
  const etter = await t.as(U.selgerA).get('/cases/' + egenSak.id);
  assert.equal(etter.body.name, egenSak.name);
  assert.equal(etter.body.revision, egenSak.revision);
});

test('N-07 endring: ventende mottaker kan lese, men får 403 ved endring før bekreftelse', async () => {
  const { sak, etag } = await ventendeOverlevering();
  const b = t.as(U.selgerB);
  assert.equal((await b.get('/cases/' + sak.id)).status, 200);
  const res = await b.patch('/cases/' + sak.id, { name: 'Endret av mottaker' }, { ifMatch: etag });
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'forbidden_scope');
  assert.equal((await t.as(U.selgerA).get('/cases/' + sak.id)).body.name, sak.name);
});

test('N-08 endring: bare ansvarlig kan fullføre åpen handling, bare mottaker kan bekrefte overlevering', async () => {
  const sak = await createCase(t, U.selgerA);
  const fullfor = u => t.as(u).post(`/cases/${sak.id}/actions/${sak.openAction.id}/complete`, { next: { description: 'Neste steg', dueDate: t.today() } }, { ifMatch: sak.etag });
  assert.equal((await fullfor(U.teamlederT1)).status, 403);
  assert.equal((await fullfor(U.avdelingslederT)).status, 403);
  assert.equal((await fullfor(U.selgerB)).status, 404);
  assert.equal((await fullfor(U.selgerA)).status, 200);

  const { sak: overlevert, etag, handoffId } = await ventendeOverlevering();
  const bekreft = u => t.as(u).post(`/cases/${overlevert.id}/handoffs/${handoffId}/confirm`, {}, { ifMatch: etag });
  assert.equal((await bekreft(U.selgerA)).status, 403);
  assert.equal((await bekreft(U.teamlederT1)).status, 403);
  assert.equal((await bekreft(U.selgerC)).status, 404);
  const ok = await bekreft(U.selgerB);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.ownerId, U.selgerB.id);
});

test('N-09 endring: selger kan ikke gjennomføre eierskifte, heller ikke via PATCH', async () => {
  const sak = await createCase(t, U.selgerA);
  const res = await t.as(U.selgerA).post(`/cases/${sak.id}/reassign`, { toUserId: U.selgerB.id, reason: 'Test' }, { ifMatch: sak.etag });
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'forbidden_operation');
  const viaPatch = await t.as(U.selgerA).patch('/cases/' + sak.id, { ownerId: U.selgerB.id }, { ifMatch: sak.etag });
  assert.equal(viaPatch.status, 422);
  assert.equal(viaPatch.body.errors[0].code, 'read_only');
  assert.equal((await t.as(U.selgerA).get('/cases/' + sak.id)).body.ownerId, U.selgerA.id);
  const leder = await t.as(U.teamlederT1).post(`/cases/${sak.id}/reassign`, { toUserId: U.selgerB.id, reason: 'Fravær (test)' }, { ifMatch: sak.etag });
  assert.equal(leder.status, 200);
  assert.equal(leder.body.ownerId, U.selgerB.id);
});

test('N-10 endring: opprettelse i annet team eller annen avdeling gir 403, og ingenting opprettes', async () => {
  const before = (await t.as(U.avdelingslederT).get('/cases')).body.total;
  const annetTeamRes = await t.as(U.selgerA).post('/cases', caseBody(t, U.selgerA, { team: 'trondelag-2', ownerId: U.selgerC.id }));
  assert.equal(annetTeamRes.status, 403);
  assert.equal(annetTeamRes.body.code, 'forbidden_scope');
  const annenAvd = await t.as(U.avdelingslederT).post('/cases', caseBody(t, U.selgerV));
  assert.equal(annenAvd.status, 403);
  // Flytting av egen sak til annet team via PATCH følger samme regel.
  const flytt = await t.as(U.selgerA).patch('/cases/' + egenSak.id, { team: 'trondelag-2' }, { ifMatch: egenSak.etag });
  assert.equal(flytt.status, 403);
  assert.equal((await t.as(U.avdelingslederT).get('/cases')).body.total, before);
});

test('N-11 endring: tidligere eier mister tilgang etter bekreftet overlevering', async () => {
  const { sak, etag, handoffId } = await ventendeOverlevering();
  assert.equal((await t.as(U.selgerB).post(`/cases/${sak.id}/handoffs/${handoffId}/confirm`, {}, { ifMatch: etag })).status, 200);
  const a = t.as(U.selgerA);
  assert.equal((await a.get('/cases/' + sak.id)).status, 404);
  assert.equal((await a.patch('/cases/' + sak.id, { name: 'X' }, { ifMatch: '"3"' })).status, 404);
  assert.ok(!ids(await a.get('/cases')).includes(sak.id));
  assert.ok(ids(await t.as(U.selgerB).get('/cases')).includes(sak.id));
});

test('N-12 eksport: selger og teamleder får 403, avdelingsleder får bare egen avdeling', async () => {
  for (const u of [U.selgerA, U.teamlederT1]) assert.equal((await t.as(u).post('/exports', { purpose: 'Test' })).status, 403);
  const tr = await t.as(U.avdelingslederT).post('/exports', { purpose: 'Avstemming (test)' });
  assert.equal(tr.status, 200);
  assert.ok(tr.body.items.length >= 3);
  assert.ok(tr.body.items.every(c => c.department === 'trondelag'));
  const ve = await t.as(U.avdelingslederV).post('/exports', { purpose: 'Avstemming (test)' });
  assert.ok(ve.body.items.length >= 1 && ve.body.items.every(c => c.department === 'vestland'));
  assert.ok(!JSON.stringify(tr.body).includes(annenAvdeling.id));
});

test('N-13 eksport uten formål avvises med 422', async () => {
  for (const body of [{}, { purpose: '   ' }]) {
    const res = await t.as(U.avdelingslederT).post('/exports', body);
    assert.equal(res.status, 422);
    assert.deepEqual(res.body.errors.map(e => [e.field, e.code]), [['purpose', 'required']]);
    assert.equal(res.body.items, undefined);
  }
});

test('N-14 teknisk administrator: 403 på oppslag, søk, endring, eksport, aggregater og revisjonslogg', async () => {
  const adm = t.as(U.admin);
  const svar = [
    await adm.get('/cases/' + egenSak.id), await adm.get('/cases'), await adm.get(`/cases/${egenSak.id}/events`),
    await adm.patch('/cases/' + egenSak.id, { name: 'X' }, { ifMatch: egenSak.etag }),
    await adm.post('/cases', caseBody(t, U.selgerA)),
    await adm.post(`/cases/${egenSak.id}/reassign`, { toUserId: U.selgerB.id, reason: 'X' }, { ifMatch: egenSak.etag }),
    await adm.post(`/cases/${egenSak.id}/handoffs`, { toUserId: U.selgerB.id }, { ifMatch: egenSak.etag }),
    await adm.post('/exports', { purpose: 'Feilsøking' }), await adm.get('/reports/aggregate?groupBy=status'), await adm.get('/audit-events'), await adm.get('/users'),
  ];
  for (const res of svar) { assert.equal(res.status, 403); assert.equal(res.body.code, 'forbidden_operation'); }
  const config = await adm.get('/admin/config');
  assert.equal(config.status, 200);
  assert.doesNotMatch(config.text, /Eksempelsak|Eksempelkontakt|example\.invalid/);
});

test('N-15 leder: 403 på enkeltsaker, søk og eksport. Aggregatsvar inneholder ingen identiteter', async () => {
  const l = t.as(U.leder);
  for (const res of [await l.get('/cases/' + egenSak.id), await l.get('/cases'), await l.post('/exports', { purpose: 'X' }), await l.get(`/cases/${egenSak.id}/events`), await l.get('/audit-events')]) assert.equal(res.status, 403);
  const agg = await l.get('/reports/aggregate?groupBy=department');
  assert.equal(agg.status, 200);
  assert.deepEqual(Object.keys(agg.body).sort(), ['from', 'groupBy', 'groups', 'minCell', 'to']);
  for (const g of agg.body.groups) assert.deepEqual(Object.keys(g).sort(), ['count', 'key', 'suppressed']);
  assert.doesNotMatch(agg.text, /Eksempelsak|Eksempelkontakt|example\.invalid|10000000-0000-4000/);
  assert.ok(!agg.text.includes(egenSak.id));
});

test('N-16 aggregater: små grupper undertrykkes, og gruppering på navn eller ansvarlig avvises', async () => {
  const s = await startServer();
  try {
    for (let i = 0; i < 5; i++) await createCase(s, U.selgerA);
    await createCase(s, U.selgerV);
    const agg = await s.as(U.leder).get('/reports/aggregate?groupBy=department');
    assert.deepEqual(agg.body.groups, [{ key: 'trondelag', count: 5, suppressed: false }, { key: 'vestland', count: null, suppressed: true }]);
    assert.equal(agg.body.total, undefined);
    for (const groupBy of ['name', 'ownerId', 'openActionAssigneeId', 'personId', '']) assert.equal((await s.as(U.leder).get('/reports/aggregate?groupBy=' + groupBy)).status, 422, groupBy);
    // Teamleder teller bare eget team, avdelingsleder bare egen avdeling.
    assert.deepEqual((await s.as(U.teamlederT1).get('/reports/aggregate?groupBy=team')).body.groups.map(g => g.key), ['trondelag-1']);
    assert.deepEqual((await s.as(U.avdelingslederV).get('/reports/aggregate?groupBy=department')).body.groups, [{ key: 'vestland', count: null, suppressed: true }]);
  } finally { await s.close(); }
});

const ALLE_KALL = sakId => [
  ['GET', '/cases'], ['GET', '/cases/' + sakId], ['GET', `/cases/${sakId}/events`], ['GET', '/users'],
  ['POST', '/cases', {}], ['PATCH', '/cases/' + sakId, { name: 'X' }],
  ['POST', `/cases/${sakId}/actions/${randomId()}/complete`, {}], ['POST', `/cases/${sakId}/handoffs`, {}],
  ['POST', `/cases/${sakId}/handoffs/${randomId()}/confirm`, {}], ['POST', `/cases/${sakId}/reassign`, {}],
  ['GET', '/reports/aggregate?groupBy=status'], ['POST', '/exports', { purpose: 'X' }], ['GET', '/audit-events'], ['GET', '/admin/config'],
  ['POST', '/intake/web-form', { name: 'Eksempel', email: 'a@example.invalid' }],
];

test('N-17 bruker uten rolle får 403 på alle operasjoner, og uten sesjon gir 401', async () => {
  for (const [method, path, body] of ALLE_KALL(egenSak.id)) {
    const utenRolle = await t.as(U.utenRolle).request(method, path, { body, ifMatch: '"1"' });
    assert.equal(utenRolle.status, 403, method + ' ' + path);
    assert.equal(utenRolle.body.code, 'forbidden_operation');
    const utenSesjon = await t.anonymous.request(method, path, { body, ifMatch: '"1"' });
    assert.equal(utenSesjon.status, 401, method + ' ' + path);
    assert.equal(utenSesjon.body.code, 'unauthenticated');
  }
  assert.equal((await t.anonymous.get('/me')).status, 401);
  assert.equal((await t.anonymous.get('/finnes-ikke')).status, 401);
});

test('N-18 flere roller gir summen av rollene, ikke mer', async () => {
  const k = t.as(U.kombinert);
  assert.equal((await k.get('/cases/' + kollegasSak.id)).status, 404);
  assert.equal((await k.get('/cases/' + annenAvdeling.id)).status, 404);
  assert.equal((await k.get('/cases')).body.total, 0);
  assert.equal((await k.get('/reports/aggregate?groupBy=status')).status, 200);
  assert.equal((await k.post('/exports', { purpose: 'X' })).status, 403);
  assert.equal((await k.get('/audit-events')).status, 403);
});

test('N-19 underressurser kan ikke hentes via egen ID uten innsyn i tilhørende sak', async () => {
  const eier = t.as(U.selgerA), andre = t.as(U.selgerB);
  const sak = (await eier.get('/cases/' + egenSak.id)).body;
  const direkte = { persons: sak.person.id, contacts: sak.contacts[0].id, relationships: sak.contacts[0].relationshipId, actions: sak.openAction.id, handoffs: randomId() };
  // Det finnes ingen egen vei til underressurser. Kjent ID og tilfeldig ID gir samme 404, også for eier.
  for (const [samling, id] of Object.entries(direkte)) {
    for (const klient of [eier, andre]) assert.deepEqual(comparable(await klient.get(`/${samling}/${id}`)), comparable(await klient.get(`/${samling}/${randomId()}`)), samling);
    assert.equal((await andre.get(`/${samling}/${id}`)).status, 404);
  }
  // Via en annens sak: 404. Via egen sak med en annens handling: 404, og handlingen er urørt.
  const next = { next: { description: 'Neste', dueDate: t.today() } };
  assert.equal((await andre.post(`/cases/${sak.id}/actions/${sak.openAction.id}/complete`, next, { ifMatch: egenSak.etag })).status, 404);
  const fremmed = await andre.post(`/cases/${kollegasSak.id}/actions/${sak.openAction.id}/complete`, next, { ifMatch: kollegasSak.etag });
  assert.equal(fremmed.status, 404);
  assert.equal((await eier.get('/cases/' + sak.id)).body.openAction.id, sak.openAction.id);
  // Svar for sak i omfanget inneholder ikke data fra andre saker.
  assert.ok(!JSON.stringify(sak).includes(kollegasSak.id));
});

test('N-20 revisjonslogg: hvert avslag og hver eksport gir AuditEvent, og loggen kan ikke endres eller slettes', async () => {
  const count = async filter => (await t.auditEvents(filter)).length;
  // 404 utenfor innsyn, 403 uten operasjon, 403 utenfor omfang og 401 uten sesjon.
  let n = await count({ outcome: 'denied' });
  await t.as(U.selgerA).get('/cases/' + annenAvdeling.id);
  await t.as(U.admin).get('/cases');
  await t.as(U.teamlederT1).post(`/cases/${egenSak.id}/actions/${egenSak.openAction.id}/complete`, {}, { ifMatch: egenSak.etag });
  await t.anonymous.get('/cases');
  const denied = (await t.auditEvents({ outcome: 'denied' })).slice(n);
  assert.deepEqual(denied.map(e => [e.operation, e.reason, e.actorId]), [
    ['case.read', 'not_found', U.selgerA.id], ['case.search', 'forbidden_operation', U.admin.id],
    ['action.complete', 'forbidden_scope', U.teamlederT1.id], ['case.search', 'unauthenticated', null],
  ]);
  assert.equal(denied[0].entityId, annenAvdeling.id);
  assert.deepEqual(denied[1].actorRoles, ['teknisk_admin']);
  assert.ok(denied.every(e => e.requestId && e.at));

  n = await count({ operation: 'case.export' });
  await t.as(U.avdelingslederT).post('/exports', { purpose: 'Avstemming (test)' });
  await t.as(U.selgerA).post('/exports', { purpose: 'Forsøk' });
  const exports = (await t.auditEvents({ operation: 'case.export' })).slice(n);
  assert.deepEqual(exports.map(e => [e.outcome, e.actorId]), [['allowed', U.avdelingslederT.id], ['denied', U.selgerA.id]]);
  assert.equal(exports[0].purpose, 'Avstemming (test)');
  assert.ok(exports[0].details.count >= 3);

  // Revisor kan lese. Ingen rute kan endre eller slette, heller ikke for revisor eller teknisk administrator.
  const rev = t.as(U.revisor);
  const lest = await rev.get('/audit-events?outcome=denied');
  assert.equal(lest.status, 200);
  const event = lest.body.items[0];
  const total = await count({});
  for (const u of [U.revisor, U.admin, U.avdelingslederT]) {
    for (const method of ['PUT', 'PATCH', 'DELETE', 'POST']) {
      for (const path of ['/audit-events', '/audit-events/' + event.id]) {
        const res = await t.as(u).request(method, path, { body: { outcome: 'allowed' } });
        assert.ok([404, 405].includes(res.status), `${method} ${path} ga ${res.status}`);
      }
    }
  }
  const etter = await t.auditEvents({});
  assert.deepEqual(etter.find(e => e.id === event.id), event);
  assert.ok(etter.length >= total);
  // Lagringsporten har ingen metode for endring eller sletting av logg, og leste hendelser er kopier.
  await t.repository.transaction(async tx => {
    assert.deepEqual(Object.keys(tx).filter(k => /audit/i.test(k)).sort(), ['appendAudit', 'listAudit']);
    assert.ok(!Object.keys(tx).some(k => /delete|remove|clear/i.test(k)));
    const [first] = await tx.listAudit({});
    first.outcome = 'manipulert';
  });
  assert.ok((await t.auditEvents({})).every(e => e.outcome !== 'manipulert'));
  // Loggen inneholder feltnavn, ikke feltverdier eller søketekst (B-10).
  await t.as(U.selgerA).get('/cases?q=hemmeligsoketekst');
  await t.as(U.selgerA).patch('/cases/' + egenSak.id, { reason: 'unikverdi-i-felt' }, { ifMatch: egenSak.etag });
  const logg = JSON.stringify(await t.auditEvents({}));
  assert.doesNotMatch(logg, /hemmeligsoketekst|unikverdi-i-felt|example\.invalid|Eksempelkontakt/);
  assert.match(logg, /"changedFields":\["reason"\]/);
});

test('N-21 sesjon: endret rolle eller tilhørighet virker uten ny innlogging, og utløpt sesjon gir 401', async () => {
  const clock = createTestClock();
  const s = await startServer({ clock, env: { SESSION_TTL_SECONDS: '600' } });
  try {
    const sak = await createCase(s, U.selgerA);
    const tl = s.as(U.teamlederT1);
    assert.equal((await tl.get('/cases/' + sak.id)).status, 200);
    // Tilhørighet endres i katalogen. Samme sesjon mister innsyn fra neste forespørsel.
    s.identity.dev.setUser({ ...U.teamlederT1, teams: ['trondelag-2'] });
    assert.equal((await tl.get('/cases/' + sak.id)).status, 404);
    assert.equal((await tl.get('/cases')).body.total, 0);
    // Rollen fjernes.
    s.identity.dev.setUser({ ...U.teamlederT1, roles: [] });
    assert.equal((await tl.get('/cases')).status, 403);
    s.identity.dev.setUser(U.teamlederT1);
    assert.equal((await tl.get('/cases/' + sak.id)).status, 200);
    // Utløp: like før er sesjonen gyldig, etter utløp gir den 401.
    clock.advance(599_000);
    assert.equal((await tl.get('/cases')).status, 200);
    clock.advance(2_000);
    const utlopt = await tl.get('/cases');
    assert.equal(utlopt.status, 401);
    assert.equal(utlopt.body.code, 'unauthenticated');
    // Ukjent eller utlogget sesjon gir 401.
    assert.equal((await s.client('ukjent-token').get('/cases')).status, 401);
    const inn = await s.anonymous.post('/dev/login', { userId: U.selgerA.id });
    const k = s.client(inn.body.token);
    assert.equal((await k.get('/me')).status, 200);
    await k.post('/dev/logout');
    assert.equal((await k.get('/me')).status, 401);
  } finally { await s.close(); }
});

test('N-22 dublett: svaret avslører ikke opplysninger om saker utenfor omfanget', async () => {
  const a = t.as(U.selgerA);
  const fremmed = (await t.as(U.selgerV).get('/cases/' + annenAvdeling.id)).body;
  // Samme e-post som en sak i en annen avdeling.
  const res = await a.post('/cases', caseBody(t, U.selgerA, { contact: { displayName: 'Eksempelkontakt ny', email: fremmed.contacts[0].email.toUpperCase() } }));
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'possible_duplicate');
  assert.deepEqual(res.body.matches, []);
  assert.equal(res.body.outsideScope, true);
  for (const verdi of [fremmed.id, fremmed.name, fremmed.municipality, fremmed.ownerId, fremmed.contacts[0].displayName, 'vestland']) assert.ok(!res.text.includes(verdi), verdi);
  // Samme navn og kommune som kollegas sak: selger ser ingen detaljer, teamleder ser saken i eget team.
  const likt = { name: kollegasSak.name, municipality: kollegasSak.municipality };
  const selger = await a.post('/cases', caseBody(t, U.selgerA, likt));
  assert.deepEqual([selger.status, selger.body.matches, selger.body.outsideScope], [409, [], true]);
  const tl = await t.as(U.teamlederT1).post('/cases', caseBody(t, U.selgerA, likt));
  assert.deepEqual([tl.status, tl.body.matches, tl.body.outsideScope], [409, [{ caseId: kollegasSak.id, name: kollegasSak.name }], false]);
  // Egen sak vises for selger.
  const egen = await a.post('/cases', caseBody(t, U.selgerA, { name: egenSak.name.toUpperCase() }));
  assert.deepEqual(egen.body.matches, [{ caseId: egenSak.id, name: egenSak.name }]);
  // Selger kan ikke selv bekrefte at det ikke er en dublett. Teamleder kan.
  assert.equal((await a.post('/cases', caseBody(t, U.selgerA, { ...likt, confirmNotDuplicate: true }))).status, 409);
  assert.equal((await t.as(U.teamlederT1).post('/cases', caseBody(t, U.selgerA, { ...likt, confirmNotDuplicate: true }))).status, 201);
});
