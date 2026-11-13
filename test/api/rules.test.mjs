// Regeltestene i test/domain.test.mjs speilet mot API-et, én servertest per regeltest og i samme rekkefølge.
// Reglene er V-01 til V-14 i docs/backend-contract.md. Bare fiktive data.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, USERS, createCase, caseBody } from './helpers.mjs';

const U = USERS;
let t;
before(async () => { t = await startServer(); });
after(() => t.close());

const codes = res => (res.body.errors || []).map(e => e.code);
const create = (overrides, user = U.selgerA) => t.as(user).post('/cases', caseBody(t, U.selgerA, overrides));
const next = (description = 'Send oppsummering', dueDate = t.today()) => ({ next: { description, dueDate } });

test('aktive saker krever eier, neste handling og frist', async () => {
  for (const overrides of [{ ownerId: '' }, { action: { description: '', dueDate: t.today() } }, { action: { description: 'Ring', dueDate: '' } }, { action: undefined }]) {
    const res = await create(overrides);
    assert.equal(res.status, 422);
    assert.ok(codes(res).includes('open_action_required'), JSON.stringify(res.body.errors));
  }
  assert.equal((await create({})).status, 201);
});

test('pause og avslutning krever årsak', async () => {
  for (const status of ['on_hold', 'closed']) {
    const res = await create({ status, reason: '' });
    assert.equal(res.status, 422);
    assert.deepEqual(res.body.errors.map(e => [e.field, e.code]), [['reason', 'required']]);
    assert.equal((await create({ status, reason: 'Venter på kommunen (test)' })).status, 201);
  }
});

test('avtale uten ordningsnummer er gyldig; faktisk oppstart er separat', async () => {
  const res = await create({ agreementDate: t.today() });
  assert.equal(res.status, 201);
  assert.equal(res.body.agreementDate, t.today());
  assert.equal(res.body.startDate, null);
  // Modellen har ikke noe felt for ordningsnummer. Ukjente felt avvises, de ignoreres ikke.
  const ukjent = await create({ schemeNumber: '123' });
  assert.deepEqual(ukjent.body.errors.map(e => [e.field, e.code]), [['schemeNumber', 'unknown_field']]);
});

test('oppstart krever avtale og kan ikke være før avtale eller i fremtiden', async () => {
  assert.deepEqual(codes(await create({ startDate: t.today() })), ['date_order']);
  assert.deepEqual(codes(await create({ agreementDate: t.today(), startDate: t.offset(-1) })), ['date_order']);
  assert.deepEqual(codes(await create({ agreementDate: t.today(), startDate: t.offset(1) })), ['future_date']);
  assert.equal((await create({ agreementDate: t.offset(-2), startDate: t.offset(-1) })).status, 201);
});

test('dubletter sammenlignes på normalisert e-post, telefon og navn/kommune', async () => {
  const sak = await createCase(t, U.selgerA, { contact: { displayName: 'Eksempelkontakt D', email: 'dublett@example.invalid', phone: '4712345' } });
  const epost = await create({ contact: { displayName: 'Annen', email: ' DUBLETT@EXAMPLE.INVALID ' } });
  assert.deepEqual([epost.status, epost.body.code, epost.body.matches.map(m => m.caseId)], [409, 'possible_duplicate', [sak.id]]);
  assert.equal((await create({ contact: { displayName: 'Annen', phone: '+47 123 45' } })).status, 409);
  assert.equal((await create({ name: ' ' + sak.name.toLowerCase() + ' ', municipality: 'TRONDHEIM' })).status, 409);
  // En sak er ikke dublett av seg selv ved lagring.
  const oppdatert = await t.as(U.selgerA).patch('/cases/' + sak.id, { name: sak.name, bpa: 'application' }, { ifMatch: sak.etag });
  assert.equal(oppdatert.status, 200);
});

test('rapport har inklusiv periode og gir avstembare sakssett', async () => {
  const s = await startServer({ env: { AGGREGATE_MIN_CELL: '1' } });
  try {
    await createCase(s, U.selgerA); await createCase(s, U.selgerA, { source: 'phone' }); await createCase(s, U.selgerB);
    const al = s.as(U.avdelingslederT);
    const idag = await al.get(`/reports/aggregate?groupBy=source&from=${s.today()}&to=${s.today()}`);
    assert.deepEqual(idag.body.groups, [{ key: 'phone', count: 1, suppressed: false }, { key: 'website', count: 2, suppressed: false }]);
    assert.deepEqual((await al.get(`/reports/aggregate?groupBy=source&from=${s.offset(1)}&to=${s.offset(2)}`)).body.groups, []);
    assert.deepEqual((await al.get(`/reports/aggregate?groupBy=source&to=${s.offset(-1)}`)).body.groups, []);
    // Avstemming: summen av gruppene er lik antall saker i samme omfang.
    const sum = idag.body.groups.reduce((n, g) => n + g.count, 0);
    assert.equal(sum, (await al.get('/cases')).body.total);
    assert.equal((await al.get('/reports/aggregate?groupBy=source&from=2026-02-30')).status, 422);
  } finally { await s.close(); }
});

test('lagring bevarer historikk og opprettelsesdato', async () => {
  const sak = await createCase(t, U.selgerA);
  const a = t.as(U.selgerA);
  const res = await a.patch('/cases/' + sak.id, { action: { description: 'Ring igjen' } }, { ifMatch: sak.etag });
  assert.equal(res.status, 200);
  assert.equal(res.body.createdAt, sak.createdAt);
  assert.equal(res.body.createdBy, U.selgerA.id);
  assert.equal(res.body.revision, sak.revision + 1);
  assert.equal(res.body.openAction.description, 'Ring igjen');
  assert.equal(res.body.openAction.id, sak.openAction.id);
  const events = (await a.get(`/cases/${sak.id}/events`)).body.items;
  assert.deepEqual(events.map(e => e.operation), ['case.create', 'case.update']);
  assert.deepEqual(events[1].changedFields, ['action.description']);
});

test('mottaker må bekrefte overlevering før ansvar flyttes', async () => {
  const utenAvtale = await createCase(t, U.selgerA);
  const avvist = await t.as(U.selgerA).post(`/cases/${utenAvtale.id}/handoffs`, { toUserId: U.selgerB.id }, { ifMatch: utenAvtale.etag });
  assert.deepEqual([avvist.status, avvist.body.code], [409, 'agreement_required']);

  const sak = await createCase(t, U.selgerA, { agreementDate: t.today() });
  const tilSegSelv = await t.as(U.selgerA).post(`/cases/${sak.id}/handoffs`, { toUserId: U.selgerA.id }, { ifMatch: sak.etag });
  assert.equal(tilSegSelv.status, 422);
  const forespurt = await t.as(U.selgerA).post(`/cases/${sak.id}/handoffs`, { toUserId: U.selgerB.id }, { ifMatch: sak.etag });
  assert.equal(forespurt.status, 201);
  assert.equal(forespurt.body.ownerId, U.selgerA.id);
  assert.equal(forespurt.body.status, 'handover');
  assert.equal(forespurt.body.pendingHandoff.state, 'pending');
  const confirm = (u, etag) => t.as(u).post(`/cases/${sak.id}/handoffs/${forespurt.body.pendingHandoff.id}/confirm`, {}, { ifMatch: etag });
  assert.equal((await confirm(U.selgerC, forespurt.etag)).status, 404);
  const bekreftet = await confirm(U.selgerB, forespurt.etag);
  assert.equal(bekreftet.status, 200);
  assert.equal(bekreftet.body.ownerId, U.selgerB.id);
  assert.equal(bekreftet.body.openAction.assigneeId, U.selgerB.id);
  assert.equal(bekreftet.body.lastHandoff.state, 'confirmed');
  assert.equal(bekreftet.body.pendingHandoff, null);
  // Etter bekreftelse er ingen lenger ventende mottaker. Ny bekreftelse avvises.
  const igjen = await confirm(U.selgerB, bekreftet.etag);
  assert.deepEqual([igjen.status, igjen.body.code], [403, 'forbidden_scope']);
  assert.equal((await t.as(U.selgerB).get('/cases/' + sak.id)).body.ownerId, U.selgerB.id);
});

test('ugyldige datoer og ukjente statuser avvises', async () => {
  assert.deepEqual(codes(await create({ action: { description: 'Ring', dueDate: '2026-02-30' } })), ['invalid_date']);
  assert.deepEqual(codes(await create({ agreementDate: '13.11.2026' })), ['invalid_date']);
  assert.deepEqual(codes(await create({ action: { description: 'Ring', dueDate: t.offset(-1) } })), ['past_date']);
  for (const felt of ['status', 'bpa', 'source']) {
    const res = await create({ [felt]: 'Ukjent' });
    assert.deepEqual(res.body.errors.map(e => [e.field, e.code]), [[felt, 'invalid_enum']]);
  }
  assert.deepEqual(codes(await create({ contact: { displayName: 'Eksempel', email: 'ikke-epost' } })), ['invalid_email']);
  assert.deepEqual(codes(await create({ team: 'vestland-1' })), ['invalid_enum']);
  assert.deepEqual(codes(await create({ name: 'x'.repeat(201) })).sort(), ['required', 'too_long']);
});

test('fullført oppfølging bevarer forrige handling og avtaler nytt steg', async () => {
  const sak = await createCase(t, U.selgerA);
  const a = t.as(U.selgerA);
  const res = await a.post(`/cases/${sak.id}/actions/${sak.openAction.id}/complete`, next(), { ifMatch: sak.etag });
  assert.equal(res.status, 200);
  assert.equal(res.body.completedActions.length, 1);
  assert.equal(res.body.completedActions[0].description, sak.openAction.description);
  assert.equal(res.body.completedActions[0].completedBy, U.selgerA.id);
  assert.ok(res.body.completedActions[0].completedAt);
  assert.equal(res.body.openAction.description, 'Send oppsummering');
  assert.notEqual(res.body.openAction.id, sak.openAction.id);
  assert.equal((await a.get(`/cases/${sak.id}/events`)).body.items.length, 2);
  const lagret = await a.patch('/cases/' + sak.id, { name: sak.name + ' oppdatert' }, { ifMatch: res.etag });
  assert.equal(lagret.body.completedActions.length, 1);
  // Fullført handling kan ikke fullføres på nytt.
  const igjen = await a.post(`/cases/${sak.id}/actions/${sak.openAction.id}/complete`, next(), { ifMatch: lagret.etag });
  assert.deepEqual([igjen.status, igjen.body.code], [409, 'action_already_completed']);
});

test('fullføring avviser feil ansvarlig, avsluttet sak og manglende neste steg', async () => {
  const sak = await createCase(t, U.selgerA);
  const complete = (u, body, etag = sak.etag, s = sak) => t.as(u).post(`/cases/${s.id}/actions/${s.openAction.id}/complete`, body, { ifMatch: etag });
  assert.equal((await complete(U.teamlederT1, next())).status, 403);
  for (const body of [next(''), next('Ring', t.offset(-1)), next('Ring', 'ugyldig'), {}]) {
    const res = await complete(U.selgerA, body);
    assert.equal(res.status, 422);
    assert.ok(codes(res).includes('next_action_required'));
  }
  const lukket = await t.as(U.selgerA).patch('/cases/' + sak.id, { status: 'closed', reason: 'Avsluttet (test)' }, { ifMatch: sak.etag });
  assert.equal(lukket.status, 200);
  assert.ok(lukket.body.closedAt);
  assert.equal(lukket.body.openAction, null);
  const etterLukking = await complete(U.selgerA, next(), lukket.etag);
  assert.deepEqual([etterLukking.status, etterLukking.body.code], [409, 'case_closed']);
});

test('overlevering kan ikke overskrive en ventende forespørsel eller gjenåpne avsluttet sak', async () => {
  const sak = await createCase(t, U.selgerA, { agreementDate: t.today() });
  const a = t.as(U.selgerA);
  const forste = await a.post(`/cases/${sak.id}/handoffs`, { toUserId: U.selgerB.id }, { ifMatch: sak.etag });
  const andre = await a.post(`/cases/${sak.id}/handoffs`, { toUserId: U.teamlederT1.id }, { ifMatch: forste.etag });
  assert.deepEqual([andre.status, andre.body.code], [409, 'handoff_pending']);
  // Avslutning lukker åpen handling og ventende overlevering i samme transaksjon.
  const lukket = await a.patch('/cases/' + sak.id, { status: 'closed', reason: 'Avsluttet (test)' }, { ifMatch: forste.etag });
  assert.deepEqual([lukket.body.pendingHandoff, lukket.body.lastHandoff.state, lukket.body.openAction], [null, 'cancelled', null]);
  assert.equal((await t.as(U.selgerB).get('/cases/' + sak.id)).status, 404);
  const etter = await a.post(`/cases/${sak.id}/handoffs`, { toUserId: U.selgerB.id }, { ifMatch: lukket.etag });
  assert.deepEqual([etter.status, etter.body.code], [409, 'case_closed']);
  assert.equal((await a.get('/cases/' + sak.id)).body.status, 'closed');
  // Gjenåpning krever ny handling.
  const utenHandling = await a.patch('/cases/' + sak.id, { status: 'dialog' }, { ifMatch: lukket.etag });
  assert.ok(codes(utenHandling).includes('open_action_required'));
  const gjenapnet = await a.patch('/cases/' + sak.id, { status: 'dialog', action: { description: 'Ta kontakt på nytt', dueDate: t.today() } }, { ifMatch: lukket.etag });
  assert.deepEqual([gjenapnet.status, gjenapnet.body.closedAt, gjenapnet.body.openAction.assigneeId], [200, null, U.selgerA.id]);
});
