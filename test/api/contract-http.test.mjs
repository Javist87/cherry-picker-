// Kontraktens øvrige krav mot API-et: feilformat, revisjonskontroll, idempotent inntak,
// ratebegrensning, katalogoppslag, porter og sperre mot utviklingsadaptere i produksjon.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, USERS, createCase, caseBody, createTestClock } from './helpers.mjs';
import { loadConfig } from '../../server/config.mjs';
import { createAdapters, createApplication } from '../../server/bootstrap.mjs';
import { createDevMemoryRepository } from '../../server/adapters/dev-memory-repository.mjs';
import { createDevIdentity, DEV_USERS } from '../../server/adapters/dev-identity.mjs';
import { decide, OPERATIONS } from '../../server/access.mjs';
import { authorize, ROLES } from '../../contract/reference-model.mjs';

const U = USERS;
let t;
before(async () => { t = await startServer(); });
after(() => t.close());
const key = n => 'key-' + String(n).padStart(16, '0');
const intake = (payload, k, user = U.inntak) => t.as(user).post('/intake/web-form', payload, { headers: k ? { 'Idempotency-Key': k } : {} });

test('feil returneres som problem+json med stabil kode og requestId, uten interne detaljer', async () => {
  const res = await t.as(U.selgerA).post('/cases', caseBody(t, U.selgerA, { startDate: t.today() }));
  assert.equal(res.status, 422);
  assert.match(res.headers.get('content-type'), /^application\/problem\+json/);
  assert.deepEqual(Object.keys(res.body).sort(), ['code', 'errors', 'requestId', 'status', 'title', 'type']);
  assert.equal(res.body.type, 'https://medvind.example/problems/validation_failed');
  assert.equal(res.body.requestId, res.headers.get('x-request-id'));
  assert.deepEqual(Object.keys(res.body.errors[0]).sort(), ['code', 'field', 'message']);
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('ugyldig JSON, feil innholdstype, ukjent rute og feil metode gir 400, 415, 404 og 405', async () => {
  const a = t.as(U.selgerA);
  const raw = (body, type) => fetch(t.url + '/api/v1/cases', { method: 'POST', headers: { Authorization: 'Bearer ' + t.identity.dev.login(U.selgerA.id), 'Content-Type': type }, body });
  assert.equal((await raw('{ikke json', 'application/json')).status, 400);
  assert.equal((await raw('name=x', 'application/x-www-form-urlencoded')).status, 415);
  assert.equal((await raw(JSON.stringify({ name: 'x'.repeat(70000) }), 'application/json')).status, 413);
  assert.equal((await a.get('/finnes-ikke')).status, 404);
  const feilMetode = await a.request('DELETE', '/cases/' + crypto.randomUUID());
  assert.equal(feilMetode.status, 405);
  assert.equal((await a.post('/cases', [1, 2])).status, 422);
});

test('forespørsel fra annen opprinnelse avvises for skrivende kall', async () => {
  const res = await t.as(U.selgerA).post('/cases', caseBody(t, U.selgerA), { headers: { Origin: 'https://annet-nettsted.example' } });
  assert.deepEqual([res.status, res.body.code], [403, 'forbidden_origin']);
  assert.equal((await t.as(U.selgerA).post('/cases', caseBody(t, U.selgerA), { headers: { Origin: 'null' } })).status, 403);
  assert.equal((await t.as(U.selgerA).post('/cases', caseBody(t, U.selgerA), { headers: { Origin: t.url } })).status, 201);
  assert.equal((await t.as(U.selgerA).get('/cases/%E0%A4%A')).status, 404);
});

test('samtidige endringer: If-Match er påkrevd, * godtas ikke, og utdatert revisjon gir 412 uten endring', async () => {
  const sak = await createCase(t, U.selgerA);
  const a = t.as(U.selgerA), tl = t.as(U.teamlederT1);
  const lest = await a.get('/cases/' + sak.id);
  assert.equal(lest.etag, '"1"');
  assert.deepEqual([(await a.patch('/cases/' + sak.id, { bpa: 'application' })).status, (await a.patch('/cases/' + sak.id, { bpa: 'application' })).body.code], [428, 'precondition_required']);
  assert.equal((await a.patch('/cases/' + sak.id, { bpa: 'application' }, { ifMatch: '*' })).status, 412);
  // To brukere har lest revisjon 1. Den første lagrer, den andre får 412 med gjeldende ETag.
  const forste = await a.patch('/cases/' + sak.id, { action: { description: 'Send oppsummering' } }, { ifMatch: lest.etag });
  assert.deepEqual([forste.status, forste.body.revision, forste.etag], [200, 2, '"2"']);
  const andre = await tl.patch('/cases/' + sak.id, { action: { description: 'Overskriv' } }, { ifMatch: lest.etag });
  assert.deepEqual([andre.status, andre.body.code, andre.etag], [412, 'precondition_failed', '"2"']);
  assert.equal((await a.get('/cases/' + sak.id)).body.openAction.description, 'Send oppsummering');
  // Gjelder også fullføring, overlevering og eierskifte.
  const stale = { ifMatch: '"1"' };
  assert.equal((await a.post(`/cases/${sak.id}/actions/${sak.openAction.id}/complete`, { next: { description: 'X', dueDate: t.today() } }, stale)).status, 412);
  assert.equal((await a.post(`/cases/${sak.id}/handoffs`, { toUserId: U.selgerB.id }, stale)).status, 412);
  assert.equal((await tl.post(`/cases/${sak.id}/reassign`, { toUserId: U.selgerB.id, reason: 'X' }, stale)).status, 412);
  assert.equal((await tl.post(`/cases/${sak.id}/reassign`, { toUserId: U.selgerB.id, reason: 'X' })).status, 428);
  assert.equal((await a.get('/cases/' + sak.id)).body.revision, 2);
});

test('inntak er idempotent: samme nøkkel og innhold gir samme svar og én innsending', async () => {
  const payload = { name: 'Eksempelperson', email: 'inntak1@example.invalid', municipality: 'Trondheim' };
  const forste = await intake(payload, key(1));
  const gjentatt = await intake({ municipality: 'Trondheim', email: 'inntak1@example.invalid', name: 'Eksempelperson' }, key(1));
  assert.equal(forste.status, 202);
  assert.equal(forste.headers.get('idempotent-replayed'), null);
  assert.equal(gjentatt.status, 202);
  assert.equal(gjentatt.headers.get('idempotent-replayed'), 'true');
  assert.deepEqual(gjentatt.body, forste.body);
  const lagret = await t.repository.transaction(tx => tx.list('intakeSubmissions', { emailNormalized: 'inntak1@example.invalid' }));
  assert.equal(lagret.length, 1);
  const annet = await intake({ ...payload, name: 'Annet navn' }, key(1));
  assert.deepEqual([annet.status, annet.body.code], [422, 'idempotency_key_reused']);
});

test('inntak avviser manglende nøkkel, manglende kontaktpunkt og ukjente felt som fritekst', async () => {
  const antall = async () => (await t.repository.transaction(tx => tx.list('intakeSubmissions'))).length;
  const before = await antall();
  const utenNokkel = await intake({ name: 'Eksempel', email: 'a@example.invalid' });
  assert.deepEqual([utenNokkel.status, utenNokkel.body.code], [400, 'idempotency_key_required']);
  assert.equal((await intake({ name: 'Eksempel', email: 'a@example.invalid' }, 'kort')).status, 400);
  assert.equal((await intake({ name: 'Eksempel' }, key(2))).status, 422);
  const fritekst = await intake({ name: 'Eksempel', email: 'a@example.invalid', message: 'Fritekst' }, key(3));
  assert.deepEqual(fritekst.body.errors.map(e => [e.field, e.code]), [['message', 'unknown_field']]);
  assert.equal(await antall(), before);
});

test('inntak avslører ikke overfor avsender at kontakten finnes fra før, og tjenestekontoen kan ikke lese', async () => {
  const sak = await createCase(t, U.selgerA, { contact: { displayName: 'Eksempelkontakt', email: 'finnes@example.invalid' } });
  const ny = await intake({ name: 'Eksempel', email: 'ny-kontakt@example.invalid' }, key(4));
  const dublett = await intake({ name: 'Eksempel', email: ' FINNES@example.invalid ' }, key(5));
  assert.equal(dublett.status, ny.status);
  assert.deepEqual(Object.keys(dublett.body), Object.keys(ny.body));
  assert.deepEqual([...dublett.headers.keys()].sort(), [...ny.headers.keys()].sort());
  const lagret = await t.repository.transaction(tx => tx.list('intakeSubmissions'));
  assert.equal(lagret.find(s => s.id === dublett.body.submissionId).state, 'possible_duplicate');
  assert.equal(lagret.find(s => s.id === ny.body.submissionId).state, 'received');
  // En innsending blir ikke automatisk en sak, og tjenestekontoen har bare intake.submit.
  assert.equal((await t.as(U.avdelingslederT).get('/cases?q=Eksempel')).body.items.filter(c => c.name === 'Eksempel').length, 0);
  assert.equal((await t.as(U.inntak).get('/cases/' + sak.id)).status, 403);
  for (const u of [U.selgerA, U.avdelingslederT, U.admin]) assert.equal((await intake({ name: 'Eksempel', email: 'x@example.invalid' }, key(6), u)).status, 403);
});

test('inntak har ratebegrensning med 429 og Retry-After', async () => {
  const clock = createTestClock(new Date('2026-11-13T10:00:05Z'));
  const s = await startServer({ clock, env: { INTAKE_RATE_LIMIT_PER_MINUTE: '3' } });
  try {
    const k = s.as(U.inntak);
    const send = n => k.post('/intake/web-form', { name: 'Eksempel', email: `rate${n}@example.invalid` }, { headers: { 'Idempotency-Key': key(100 + n) } });
    for (let n = 0; n < 3; n++) assert.equal((await send(n)).status, 202);
    const stoppet = await send(3);
    assert.deepEqual([stoppet.status, stoppet.body.code, stoppet.headers.get('retry-after')], [429, 'rate_limited', '55']);
    clock.advance(60_000);
    assert.equal((await send(4)).status, 202);
  } finally { await s.close(); }
});

test('katalogoppslag gir bare kolleger med saksrolle i egen avdeling', async () => {
  const res = await t.as(U.selgerA).get('/users');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.items.map(u => u.id).sort(), [U.selgerA, U.selgerB, U.selgerC, U.teamlederT1, U.avdelingslederT, U.kombinert].map(u => u.id).sort());
  assert.ok(res.body.items.every(u => !('roles' in u)));
  for (const u of [U.leder, U.admin, U.revisor, U.inntak]) assert.equal((await t.as(u).get('/users')).status, 403);
  const me = await t.as(U.leder).get('/me');
  assert.deepEqual(me.body.operations, ['report.aggregate']);
});

test('eier og mottaker må være ansatt med saksrolle i sakens avdeling', async () => {
  for (const ownerId of [U.selgerV.id, U.leder.id, U.admin.id, crypto.randomUUID(), 'ikke-uuid']) {
    const res = await t.as(U.selgerA).post('/cases', caseBody(t, U.selgerA, { ownerId }));
    assert.equal(res.status, 422, ownerId);
    assert.ok(res.body.errors.some(e => e.code === 'invalid_reference'));
  }
  const sak = await createCase(t, U.selgerA, { agreementDate: t.today() });
  for (const toUserId of [U.selgerV.id, U.leder.id, U.admin.id]) {
    assert.equal((await t.as(U.selgerA).post(`/cases/${sak.id}/handoffs`, { toUserId }, { ifMatch: sak.etag })).status, 422);
    assert.equal((await t.as(U.teamlederT1).post(`/cases/${sak.id}/reassign`, { toUserId, reason: 'Test' }, { ifMatch: sak.etag })).status, 422);
  }
});

test('eierskifte krever begrunnelse, flytter åpen handling og trekker ventende overlevering', async () => {
  const sak = await createCase(t, U.selgerA, { agreementDate: t.today() });
  const ventende = await t.as(U.selgerA).post(`/cases/${sak.id}/handoffs`, { toUserId: U.selgerB.id }, { ifMatch: sak.etag });
  const tl = t.as(U.teamlederT1);
  assert.equal((await tl.post(`/cases/${sak.id}/reassign`, { toUserId: U.selgerC.id }, { ifMatch: ventende.etag })).status, 422);
  const res = await tl.post(`/cases/${sak.id}/reassign`, { toUserId: U.selgerC.id, reason: 'Fravær (test)' }, { ifMatch: ventende.etag });
  assert.deepEqual([res.status, res.body.ownerId, res.body.openAction.assigneeId, res.body.pendingHandoff, res.body.lastHandoff.state], [200, U.selgerC.id, U.selgerC.id, null, 'cancelled']);
  assert.equal((await t.as(U.selgerB).get('/cases/' + sak.id)).status, 404);
  const logg = await t.auditEvents({ operation: 'case.reassign', caseId: sak.id });
  assert.equal(logg.at(-1).purpose, 'Fravær (test)');
});

test('serverens tilgangsavgjørelse er lik referansemodellen for alle roller, operasjoner og saksforhold', () => {
  const sak = (extra = {}) => ({ id: 'c', department: 'd1', team: 't1', ownerId: 'u-x', openActionAssigneeId: 'u-x', pendingHandoffToId: null, ...extra });
  const saker = [undefined, sak(), sak({ ownerId: 'u' }), sak({ openActionAssigneeId: 'u' }), sak({ pendingHandoffToId: 'u' }), sak({ team: 't2' }), sak({ department: 'd2', team: 't9' }), sak({ ownerId: 'u', department: 'd2', team: 't9' })];
  const rollesett = [[], ...ROLES.map(r => [r]), ['selger', 'leder'], ['teknisk_admin', 'selger'], ['teamleder', 'revisor']];
  let sammenlignet = 0;
  for (const roles of rollesett) {
    const bruker = { id: 'u', roles, departments: ['d1'], teams: ['t1'] };
    for (const operation of OPERATIONS) for (const c of saker) {
      if (operation === 'case.create' && !c) continue; // referansemodellen krever avdeling og team ved opprettelse
      const forventet = authorize(bruker, operation, c), faktisk = decide(bruker, operation, c);
      assert.deepEqual([faktisk.allowed, faktisk.status ?? 200, faktisk.code], [forventet.allowed, forventet.status, forventet.code], `${roles}/${operation}`);
      sammenlignet += 1;
    }
  }
  assert.equal(decide(null, 'case.read', sak()).status, 401);
  assert.ok(sammenlignet > 1000);
});

test('utviklingsadaptere kan ikke brukes i produksjonsprofil, og produksjon starter ikke uten godkjente adaptere', () => {
  const clock = createTestClock();
  assert.throws(() => createDevMemoryRepository({ profile: 'production' }), /produksjonsprofil/);
  assert.throws(() => createDevIdentity({ profile: 'production', clock }), /produksjonsprofil/);
  assert.throws(() => createAdapters(loadConfig({ APP_PROFILE: 'production' })), /B-01, B-02 og B-03/);
  assert.throws(() => createAdapters(loadConfig({ APP_PROFILE: 'production', REPOSITORY_ADAPTER: 'dev-memory', IDENTITY_ADAPTER: 'dev' })), /sperret i produksjon/);
  // Heller ikke ved å sende inn ferdige utviklingsadaptere forbi registeret.
  const adapters = { repository: createDevMemoryRepository({ profile: 'test' }), identity: createDevIdentity({ profile: 'test', clock }) };
  assert.throws(() => createApplication(loadConfig({ APP_PROFILE: 'production', REPOSITORY_ADAPTER: 'x', IDENTITY_ADAPTER: 'y' }), { clock, adapters }), /kan ikke brukes i produksjonsprofil/);
  assert.throws(() => loadConfig({ APP_PROFILE: 'prod' }), /Ukjent APP_PROFILE/);
  assert.equal(loadConfig({ APP_PROFILE: 'development', HOST: '0.0.0.0' }).host, '127.0.0.1');
});

test('testbrukere finnes for hver rolle, og lagringsadapteren ruller tilbake ved feil', async () => {
  for (const role of ROLES) assert.ok(DEV_USERS.some(u => u.roles.includes(role)), role);
  assert.ok(DEV_USERS.some(u => u.roles.length === 0));
  const repo = createDevMemoryRepository({ profile: 'test' });
  const doc = { id: crypto.randomUUID(), revision: 1, name: 'Eksempel' };
  await assert.rejects(repo.transaction(async tx => { await tx.insert('persons', doc); throw new Error('avbrutt'); }));
  assert.equal(await repo.transaction(tx => tx.get('persons', doc.id)), null);
  await repo.transaction(tx => tx.insert('persons', doc));
  await assert.rejects(repo.transaction(tx => tx.replace('persons', { ...doc, revision: 3 })), /Revisjonskonflikt/);
  await assert.rejects(repo.transaction(tx => tx.get('ukjent', doc.id)), /Ukjent samling/);
});

test('egen tilgang og teknisk oppsett: omfang per operasjon, og inntakskø bare som antall', async () => {
  const me = await t.as(U.teamlederT1).get('/me');
  const access = Object.fromEntries(me.body.access.map(a => [a.operation, a.scopes]));
  assert.deepEqual(access['case.update'], ['team']);
  assert.deepEqual(access['case.export'], []);
  assert.deepEqual(access['audit.read'], []);
  await intake({ name: 'Eksempel Kø', email: 'ko@example.invalid' }, key(900));
  const config = await t.as(U.admin).get('/admin/config');
  assert.ok(config.body.intakeQueue.received.count >= 1);
  assert.ok(config.body.intakeQueue.received.oldestReceivedAt);
  assert.doesNotMatch(config.text, /Eksempel Kø|ko@example\.invalid/);
});

test('demobruker med alle personroller får summen av rollene, men ikke inntak', async () => {
  const superbruker = DEV_USERS[0];
  assert.match(superbruker.displayName, /Superbruker/);
  assert.deepEqual([...superbruker.roles].sort(), ROLES.filter(r => r !== 'inntak').sort());
  t.identity.dev.setUser(superbruker);
  const s = t.as(superbruker);
  const sak = await createCase(t, U.selgerV);
  for (const path of ['/cases/' + sak.id, '/cases', '/reports/aggregate?groupBy=status', '/audit-events?limit=1', '/admin/config', '/users']) assert.equal((await s.get(path)).status, 200, path);
  assert.equal((await s.post('/exports', { purpose: 'Demo' })).status, 200);
  assert.equal((await s.post('/intake/web-form', { name: 'Eksempel', email: 'x@example.invalid' }, { headers: { 'Idempotency-Key': key(901) } })).status, 403);
});
