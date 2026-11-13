// Kontrakttester for docs/backend-contract.md og docs/access-matrix.md.
// Kjøres mot referansemodellen. Bare fiktive data. Testene berører ikke
// app.mjs, domain.mjs eller test/browser.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ROLES, MATRIX, authorize, searchCases, exportCases, aggregate, etag, checkPrecondition, applyUpdate, createIntake } from '../contract/reference-model.mjs';

const user = (id, roles, departments = [], teams = []) => ({ id, roles, departments, teams });
const selgerA = user('u-a', ['selger'], ['Trøndelag'], ['T1']);
const selgerB = user('u-b', ['selger'], ['Trøndelag'], ['T1']);
const teamlederT1 = user('u-tl', ['teamleder'], ['Trøndelag'], ['T1']);
const avdelingslederTrondelag = user('u-al', ['avdelingsleder'], ['Trøndelag']);
const avdelingslederVestland = user('u-av', ['avdelingsleder'], ['Vestland']);
const leder = user('u-l', ['leder']);
const admin = user('u-adm', ['teknisk_admin']);
const revisor = user('u-rev', ['revisor']);
const inntak = user('svc-inntak', ['inntak']);

const sak = (id, department, team, ownerId, extra = {}) => ({ id, department, team, ownerId, openActionAssigneeId: ownerId, pendingHandoffToId: null, status: 'Dialog', source: 'Nettside', municipality: 'Trondheim', name: 'Eksempelsak ' + id, ...extra });
const egenSak = sak('c1', 'Trøndelag', 'T1', 'u-a');
const kollegasSak = sak('c2', 'Trøndelag', 'T1', 'u-b');
const annetTeam = sak('c3', 'Trøndelag', 'T2', 'u-c');
const annenAvdeling = sak('c4', 'Vestland', 'V1', 'u-x');
const alleSaker = [egenSak, kollegasSak, annetTeam, annenAvdeling];

const CASE_OPERATIONS = ['case.read', 'case.update', 'action.complete', 'handoff.request', 'handoff.confirm', 'case.reassign', 'case.export'];

test('tabellen i docs/access-matrix.md er identisk med referansemodellen', async () => {
  const doc = await readFile(new URL('../docs/access-matrix.md', import.meta.url), 'utf8');
  const block = doc.split('<!-- matrix:start -->')[1]?.split('<!-- matrix:end -->')[0];
  assert.ok(block, 'Fant ikke matrisen mellom markørene.');
  const rows = block.trim().split('\n').map(line => line.split('|').slice(1, -1).map(cell => cell.trim().replaceAll('`', '')));
  const [header, , ...body] = rows;
  assert.deepEqual(header.slice(1), ROLES);
  const fromDoc = Object.fromEntries(body.map(([operation, ...cells]) => [operation, Object.fromEntries(cells.map((cell, i) => [ROLES[i], cell]).filter(([, cell]) => cell !== '—'))]));
  assert.deepEqual(fromDoc, MATRIX);
});

test('uten sesjon eller uten rolle gis ingen tilgang', () => {
  assert.equal(authorize(null, 'case.read', egenSak).status, 401);
  for (const operation of Object.keys(MATRIX)) assert.equal(authorize(user('u-0', []), operation, egenSak).status, 403);
});

test('direkte oppslag: selger ser egne saker, ikke kollegers, andre teams eller andre avdelingers', () => {
  assert.equal(authorize(selgerA, 'case.read', egenSak).allowed, true);
  for (const c of [kollegasSak, annetTeam, annenAvdeling]) assert.equal(authorize(selgerA, 'case.read', c).status, 404);
});

test('direkte oppslag utenfor innsyn kan ikke skilles fra en sak som ikke finnes', () => {
  assert.deepEqual(authorize(selgerA, 'case.read', annenAvdeling), authorize(selgerA, 'case.read', undefined));
  assert.deepEqual(authorize(teamlederT1, 'case.update', annetTeam), authorize(teamlederT1, 'case.update', undefined));
});

test('teamleder er avgrenset til team og avdelingsleder til avdeling', () => {
  assert.equal(authorize(teamlederT1, 'case.read', kollegasSak).allowed, true);
  assert.equal(authorize(teamlederT1, 'case.read', annetTeam).status, 404);
  assert.equal(authorize(avdelingslederTrondelag, 'case.read', annetTeam).allowed, true);
  assert.equal(authorize(avdelingslederTrondelag, 'case.read', annenAvdeling).status, 404);
});

test('søk gir bare saker i omfanget, og antall treff lekker ikke andre saker', () => {
  const treff = searchCases(selgerA, alleSaker);
  assert.deepEqual(treff.items.map(c => c.id), ['c1']);
  assert.equal(treff.total, 1);
  assert.equal(searchCases(selgerA, alleSaker, c => c.name === annenAvdeling.name).total, 0);
  assert.deepEqual(searchCases(teamlederT1, alleSaker).items.map(c => c.id), ['c1', 'c2']);
  assert.deepEqual(searchCases(avdelingslederVestland, alleSaker).items.map(c => c.id), ['c4']);
});

test('endring: selger kan bare endre saker selgeren eier', () => {
  assert.equal(authorize(selgerA, 'case.update', egenSak).allowed, true);
  assert.equal(authorize(selgerB, 'case.update', egenSak).status, 404);
  assert.equal(authorize(selgerA, 'case.reassign', egenSak).status, 403);
});

test('ventende mottaker kan lese og bekrefte, men ikke endre før ansvaret er flyttet', () => {
  const ventende = { ...egenSak, pendingHandoffToId: 'u-b' };
  assert.equal(authorize(selgerB, 'case.read', ventende).allowed, true);
  assert.equal(authorize(selgerB, 'handoff.confirm', ventende).allowed, true);
  assert.equal(authorize(selgerB, 'case.update', ventende).status, 403);
  assert.equal(authorize(selgerA, 'handoff.confirm', ventende).status, 403);
  const bekreftet = { ...ventende, ownerId: 'u-b', openActionAssigneeId: 'u-b', pendingHandoffToId: null };
  assert.equal(authorize(selgerB, 'case.update', bekreftet).allowed, true);
  assert.equal(authorize(selgerA, 'case.read', bekreftet).status, 404);
});

test('bare ansvarlig for den åpne handlingen kan fullføre den', () => {
  assert.equal(authorize(selgerA, 'action.complete', egenSak).allowed, true);
  assert.equal(authorize(teamlederT1, 'action.complete', egenSak).status, 403);
  assert.equal(authorize(selgerB, 'action.complete', egenSak).status, 404);
});

test('opprettelse er begrenset til eget team eller egen avdeling', () => {
  assert.equal(authorize(selgerA, 'case.create', { department: 'Trøndelag', team: 'T1' }).allowed, true);
  assert.equal(authorize(selgerA, 'case.create', { department: 'Trøndelag', team: 'T2' }).status, 403);
  assert.equal(authorize(avdelingslederTrondelag, 'case.create', { department: 'Vestland', team: 'V1' }).status, 403);
});

test('eksport: avvist for selger og teamleder, avgrenset til avdeling og krever formål', () => {
  assert.equal(exportCases(selgerA, alleSaker, { purpose: 'Test' }).status, 403);
  assert.equal(exportCases(teamlederT1, alleSaker, { purpose: 'Test' }).status, 403);
  assert.equal(exportCases(avdelingslederTrondelag, alleSaker).status, 422);
  assert.deepEqual(exportCases(avdelingslederTrondelag, alleSaker, { purpose: 'Avstemming' }).items.map(c => c.id), ['c1', 'c2', 'c3']);
  assert.deepEqual(exportCases(avdelingslederVestland, alleSaker, { purpose: 'Avstemming' }).items.map(c => c.id), ['c4']);
});

test('teknisk administrator har teknisk oppsett, men ikke personsaksinnsyn', () => {
  assert.equal(authorize(admin, 'admin.config').allowed, true);
  for (const operation of CASE_OPERATIONS) assert.equal(authorize(admin, operation, egenSak).status, 403);
  assert.equal(searchCases(admin, alleSaker).status, 403);
  assert.equal(exportCases(admin, alleSaker, { purpose: 'Feilsøking' }).status, 403);
  assert.equal(aggregate(admin, alleSaker, { groupBy: 'status' }).status, 403);
  assert.equal(authorize(admin, 'audit.read').status, 403);
});

test('leder får aggregater uten tilgang til enkeltsaker', () => {
  for (const operation of CASE_OPERATIONS) assert.equal(authorize(leder, operation, egenSak).status, 403);
  assert.equal(searchCases(leder, alleSaker).status, 403);
  const mange = Array.from({ length: 6 }, (_, i) => sak('m' + i, 'Trøndelag', 'T1', 'u-a'));
  const resultat = aggregate(leder, [...mange, annenAvdeling], { groupBy: 'department' });
  assert.deepEqual(resultat.groups, [{ key: 'Trøndelag', count: 6, suppressed: false }, { key: 'Vestland', count: null, suppressed: true }]);
  assert.doesNotMatch(JSON.stringify(resultat), /Eksempelsak|u-a|"id"/);
  assert.equal(aggregate(leder, mange, { groupBy: 'name' }).status, 422);
  assert.equal(aggregate(leder, mange, { groupBy: 'ownerId' }).status, 422);
});

test('aggregater for teamleder teller bare eget team', () => {
  const resultat = aggregate(teamlederT1, alleSaker, { groupBy: 'team', minCell: 1 });
  assert.deepEqual(resultat.groups, [{ key: 'T1', count: 2, suppressed: false }]);
});

test('revisor leser revisjonslogg, men ikke saker; inntakstjenesten kan bare levere', () => {
  assert.equal(authorize(revisor, 'audit.read').allowed, true);
  assert.equal(authorize(revisor, 'case.read', egenSak).status, 403);
  assert.equal(authorize(inntak, 'intake.submit').allowed, true);
  assert.equal(authorize(inntak, 'case.read', egenSak).status, 403);
  assert.equal(searchCases(inntak, alleSaker).status, 403);
});

test('flere roller gir summen av rollene, ikke mer', () => {
  const kombinert = user('u-k', ['selger', 'leder'], ['Trøndelag'], ['T1']);
  assert.equal(authorize(kombinert, 'case.read', kollegasSak).status, 404);
  assert.equal(aggregate(kombinert, alleSaker, { groupBy: 'status', minCell: 1 }).allowed, true);
});

test('samtidige endringer: If-Match er påkrevd, og utdatert revisjon avvises', () => {
  const lagret = { id: 'c1', revision: 3, nextAction: 'Ring' };
  assert.equal(checkPrecondition(undefined, lagret).status, 428);
  assert.equal(checkPrecondition('*', lagret).status, 412);
  const lestAvBegge = etag(lagret);
  const forste = applyUpdate(lagret, { nextAction: 'Send oppsummering' }, lestAvBegge);
  assert.equal(forste.resource.revision, 4);
  assert.equal(forste.etag, '"4"');
  const andre = applyUpdate(forste.resource, { nextAction: 'Overskriv' }, lestAvBegge);
  assert.equal(andre.status, 412);
  assert.equal(andre.currentEtag, '"4"');
  assert.equal(forste.resource.nextAction, 'Send oppsummering');
});

test('inntak er idempotent: samme nøkkel og innhold gir samme svar og én innsending', () => {
  const inntakskø = createIntake();
  const payload = { name: 'Eksempelperson', email: 'demo@example.invalid', municipality: 'Trondheim' };
  const forste = inntakskø.submit({ idempotencyKey: 'key-0000000000000001', payload });
  const gjentatt = inntakskø.submit({ idempotencyKey: 'key-0000000000000001', payload: { municipality: 'Trondheim', email: 'demo@example.invalid', name: 'Eksempelperson' } });
  assert.equal(forste.status, 202);
  assert.equal(forste.replayed, false);
  assert.equal(gjentatt.replayed, true);
  assert.deepEqual(gjentatt.body, forste.body);
  assert.equal(inntakskø.submissions.length, 1);
  assert.equal(inntakskø.submit({ idempotencyKey: 'key-0000000000000001', payload: { ...payload, name: 'Annet navn' } }).code, 'idempotency_key_reused');
});

test('inntak avviser manglende nøkkel, manglende kontaktpunkt og ukjente felt som fritekst', () => {
  const inntakskø = createIntake();
  assert.equal(inntakskø.submit({ payload: { name: 'Eksempel', email: 'a@example.invalid' } }).status, 400);
  assert.equal(inntakskø.submit({ idempotencyKey: 'key-0000000000000002', payload: { name: 'Eksempel' } }).status, 422);
  const fritekst = inntakskø.submit({ idempotencyKey: 'key-0000000000000003', payload: { name: 'Eksempel', email: 'a@example.invalid', message: 'Fritekst' } });
  assert.deepEqual(fritekst.errors, [{ field: 'message', code: 'unknown_field' }]);
  assert.equal(inntakskø.submissions.length, 0);
});

test('inntak avslører ikke overfor avsender at kontakten finnes fra før', () => {
  const inntakskø = createIntake();
  const forste = inntakskø.submit({ idempotencyKey: 'key-0000000000000004', payload: { name: 'Eksempel', email: 'demo@example.invalid' } });
  const dublett = inntakskø.submit({ idempotencyKey: 'key-0000000000000005', payload: { name: 'Eksempel', email: ' DEMO@example.invalid ' } });
  assert.equal(dublett.status, forste.status);
  assert.deepEqual(Object.keys(dublett.body), Object.keys(forste.body));
  assert.equal(inntakskø.submissions[1].state, 'possible_duplicate');
});
