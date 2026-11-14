// Aktivitetslogg og utfall ved avslutning, kjørt mot API-et over HTTP med utviklingsadaptere. Bare fiktive data.
// N-23 er den negative tilgangstesten for aktivitetsloggen i docs/access-matrix.md.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, USERS, createCase, randomId } from './helpers.mjs';

const U = USERS;
let t;
before(async () => { t = await startServer(); });
after(() => t.close());

const log = (user, sak, body, etag = sak.etag) => t.as(user).post(`/cases/${sak.id}/activities`, body, { ifMatch: etag });
const call = { type: 'call', outcome: 'reached', note: 'Fiktivt notat om avtalt samtale' };

test('eier logger aktivitet: 201, aktiviteten følger saken og revisjonen øker', async () => {
  const sak = await createCase(t, U.selgerA);
  const res = await log(U.selgerA, sak, call);
  assert.equal(res.status, 201);
  assert.equal(res.body.revision, sak.revision + 1);
  assert.equal(res.body.activities.length, 1);
  const a = res.body.activities[0];
  assert.deepEqual({ type: a.type, outcome: a.outcome, note: a.note, by: a.by }, { ...call, by: U.selgerA.id });
  const lest = await t.as(U.selgerA).get('/cases/' + sak.id);
  assert.equal(lest.body.activities.length, 1);
  assert.equal(lest.etag, res.etag);
});

test('aktiviteter returneres i tidsrekkefølge og kan ikke endres eller slettes via API', async () => {
  const sak = await createCase(t, U.selgerA);
  const first = await log(U.selgerA, sak, call);
  t.clock.advance(60_000);
  const second = await log(U.selgerA, sak, { type: 'note', note: 'Fiktivt notat nummer to' }, first.etag);
  assert.deepEqual(second.body.activities.map(a => a.type), ['call', 'note']);
  const id = second.body.activities[0].id;
  for (const method of ['PATCH', 'DELETE', 'PUT']) {
    const res = await t.as(U.selgerA).request(method, `/cases/${sak.id}/activities/${id}`, { body: {}, ifMatch: second.etag });
    assert.ok([404, 405].includes(res.status), method + ' ga ' + res.status);
  }
});

test('validering: type og utfall må være gyldige, notat krever tekst, ukjente felt avvises', async () => {
  const sak = await createCase(t, U.selgerA);
  const cases = [
    [{}, 'type', 'required'],
    [{ type: 'visit', outcome: 'reached' }, 'type', 'invalid_enum'],
    [{ type: 'call' }, 'outcome', 'required'],
    [{ type: 'call', outcome: 'sold' }, 'outcome', 'invalid_enum'],
    [{ type: 'note' }, 'note', 'required'],
    [{ type: 'note', note: 'Fiktivt', outcome: 'reached' }, 'outcome', 'not_applicable'],
    [{ type: 'call', outcome: 'reached', note: 'x'.repeat(201) }, 'note', 'too_long'],
    [{ type: 'call', outcome: 'reached', at: '2020-01-01' }, 'at', 'unknown_field'],
  ];
  for (const [body, field, code] of cases) {
    const res = await log(U.selgerA, sak, body);
    assert.equal(res.status, 422, JSON.stringify(body));
    assert.ok(res.body.errors.some(e => e.field === field && e.code === code), JSON.stringify(res.body.errors));
  }
  assert.equal((await t.as(U.selgerA).get('/cases/' + sak.id)).body.activities.length, 0);
});

test('revisjonskontroll: uten If-Match 428, utdatert revisjon 412', async () => {
  const sak = await createCase(t, U.selgerA);
  assert.equal((await t.as(U.selgerA).post(`/cases/${sak.id}/activities`, call)).status, 428);
  assert.equal((await log(U.selgerA, sak, call)).status, 201);
  assert.equal((await log(U.selgerA, sak, call)).status, 412);
});

test('avsluttet sak kan ikke få ny aktivitet (409 case_closed)', async () => {
  const sak = await createCase(t, U.selgerA);
  const lukket = await t.as(U.selgerA).patch('/cases/' + sak.id, { status: 'closed', reason: 'Fiktiv avslutning' }, { ifMatch: sak.etag });
  assert.equal(lukket.status, 200);
  const res = await log(U.selgerA, sak, call, lukket.etag);
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'case_closed');
});

test('N-23 aktivitet: bare eier, teamleder i teamet og avdelingsleder i avdelingen kan logge', async () => {
  const sak = await createCase(t, U.selgerA, { agreementDate: t.today() });
  // Utenfor innsyn: likt svar som for sak som ikke finnes.
  for (const user of [U.selgerB, U.selgerC, U.selgerV, U.avdelingslederV]) {
    const res = await log(user, sak, call);
    assert.equal(res.status, 404, user.displayName);
    assert.equal(res.body.code, 'not_found');
  }
  assert.equal((await t.as(U.selgerA).post(`/cases/${randomId()}/activities`, call, { ifMatch: '"1"' })).status, 404);
  // Roller uten saksinnsyn.
  for (const user of [U.leder, U.admin, U.revisor, U.inntak, U.utenRolle]) {
    const res = await log(user, sak, call);
    assert.equal(res.status, 403, user.displayName);
    assert.equal(res.body.code, 'forbidden_operation');
  }
  assert.equal((await t.anonymous.post(`/cases/${sak.id}/activities`, call, { ifMatch: sak.etag })).status, 401);
  // Ventende mottaker kan lese saken, men ikke logge før ansvaret er flyttet.
  const handoff = await t.as(U.selgerA).post(`/cases/${sak.id}/handoffs`, { toUserId: U.selgerB.id }, { ifMatch: sak.etag });
  assert.equal(handoff.status, 201);
  const mottaker = await log(U.selgerB, sak, call, handoff.etag);
  assert.equal(mottaker.status, 403);
  assert.equal(mottaker.body.code, 'forbidden_scope');
  // Teamleder og avdelingsleder i eget omfang kan logge.
  const leder = await log(U.teamlederT1, sak, call, handoff.etag);
  assert.equal(leder.status, 201);
  assert.equal((await log(U.avdelingslederT, sak, call, leder.etag)).status, 201);
  assert.equal((await t.as(U.selgerA).get('/cases/' + sak.id)).body.activities.length, 2);
});

test('revisjonslogg: logging og avslag gir AuditEvent uten notattekst', async () => {
  const sak = await createCase(t, U.selgerA);
  const hemmelig = 'Fiktiv notattekst som ikke skal i loggen';
  assert.equal((await log(U.selgerA, sak, { type: 'note', note: hemmelig })).status, 201);
  assert.equal((await log(U.selgerB, sak, call)).status, 404);
  const events = await t.auditEvents({ caseId: sak.id, operation: 'activity.create' });
  assert.equal(events.filter(e => e.outcome === 'allowed').length, 1);
  assert.ok(!JSON.stringify(events).includes(hemmelig));
  const denied = (await t.auditEvents({ operation: 'activity.create', outcome: 'denied' })).filter(e => e.actorId === U.selgerB.id && e.entityId === sak.id);
  assert.equal(denied.length, 1);
  const historikk = await t.as(U.selgerA).get(`/cases/${sak.id}/events`);
  assert.ok(historikk.body.items.some(e => e.operation === 'activity.create'));
});

test('utfall ved avslutning: gyldig kode lagres, ugyldig kode og utfall på aktiv sak avvises', async () => {
  const sak = await createCase(t, U.selgerA);
  const a = t.as(U.selgerA);
  const aktiv = await a.patch('/cases/' + sak.id, { closeOutcome: 'won' }, { ifMatch: sak.etag });
  assert.equal(aktiv.status, 422);
  assert.ok(aktiv.body.errors.some(e => e.field === 'closeOutcome' && e.code === 'not_applicable'));
  const ugyldig = await a.patch('/cases/' + sak.id, { status: 'closed', reason: 'Fiktiv', closeOutcome: 'best' }, { ifMatch: sak.etag });
  assert.ok(ugyldig.body.errors.some(e => e.field === 'closeOutcome' && e.code === 'invalid_enum'));
  const lukket = await a.patch('/cases/' + sak.id, { status: 'closed', reason: 'Fiktiv', closeOutcome: 'lost_no_response' }, { ifMatch: sak.etag });
  assert.equal(lukket.status, 200);
  assert.equal(lukket.body.closeOutcome, 'lost_no_response');
  const events = await t.auditEvents({ caseId: sak.id, operation: 'case.update' });
  assert.ok(events.at(-1).changedFields.includes('closeOutcome'));
});

test('utfall er valgfritt og nullstilles når saken åpnes igjen', async () => {
  const sak = await createCase(t, U.selgerA);
  const a = t.as(U.selgerA);
  assert.equal(sak.closeOutcome, '');
  const lukket = await a.patch('/cases/' + sak.id, { status: 'closed', reason: 'Fiktiv', closeOutcome: 'won' }, { ifMatch: sak.etag });
  assert.equal(lukket.body.closeOutcome, 'won');
  const apnet = await a.patch('/cases/' + sak.id, { status: 'dialog', action: { description: 'Ring igjen', dueDate: t.today() } }, { ifMatch: lukket.etag });
  assert.equal(apnet.status, 200);
  assert.equal(apnet.body.closeOutcome, '');
  const utenUtfall = await a.patch('/cases/' + sak.id, { status: 'closed', reason: 'Fiktiv' }, { ifMatch: apnet.etag });
  assert.equal(utenUtfall.status, 200);
  assert.equal(utenUtfall.body.closeOutcome, '');
});
