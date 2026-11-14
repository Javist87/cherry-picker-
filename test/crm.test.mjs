// Regeltester for CRM-tilleggene i crm.mjs. Bare fiktive data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { today, offset } from '../domain.mjs';
import { STALE_DAYS, WON, lastActivity, daysSilent, isStale, flags, inSmartList, sortCases, logActivity, validateCloseOutcome, funnel, daysBetween } from '../crm.mjs';

const sak = (overrides = {}) => ({
  id: 's1', name: 'Eksempelsak', municipality: 'Trondheim', owner: 'Thomas', status: 'Dialog', source: 'Nettside',
  nextAction: 'Ring', due: offset(3), email: 'demo@example.invalid', phone: '', createdAt: today(), history: [], ...overrides,
});

test('siste aktivitet er nyeste av registrering, fullført oppfølging og logget aktivitet', () => {
  const c = sak({ createdAt: offset(-30), completedActions: [{ completedAt: offset(-20) + 'T10:00:00.000Z' }], activities: [{ at: offset(-5) + 'T10:00:00.000Z' }] });
  assert.equal(lastActivity(c), offset(-5));
  assert.equal(daysSilent(c), 5);
  assert.equal(lastActivity(sak({ createdAt: offset(-2) })), offset(-2));
  assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2); // over overgang til sommertid
});

test('stillstand: aktiv sak uten aktivitet over terskelen merkes, ikke saker som avventer eller er avsluttet', () => {
  assert.equal(isStale(sak({ createdAt: offset(-STALE_DAYS) })), true);
  assert.equal(isStale(sak({ createdAt: offset(-STALE_DAYS + 1) })), false);
  assert.equal(isStale(sak({ createdAt: offset(-40), status: 'Avventer' })), false);
  assert.equal(isStale(sak({ createdAt: offset(-40), status: 'Avsluttet' })), false);
  assert.equal(isStale(sak({ createdAt: offset(-40), activities: [{ at: offset(-1) + 'T08:00:00.000Z' }] })), false);
});

test('varsler: forfalt, uten aktivitet, mangler kontaktinfo og ufordelt', () => {
  const codes = c => flags(c).map(f => f.code);
  assert.deepEqual(codes(sak()), []);
  assert.deepEqual(codes(sak({ due: offset(-1), createdAt: offset(-20), email: '', owner: '' })), ['overdue', 'stale', 'nocontact', 'unassigned']);
  assert.deepEqual(codes(sak({ status: 'Avsluttet', due: offset(-1), email: '', owner: '' })), []);
  assert.match(flags(sak({ createdAt: offset(-20) }))[0].label, /20 dager/);
});

test('smarte lister filtrerer på eier, frist, stillstand, kontaktinfo og avsluttet', () => {
  const ctx = { actor: 'Thomas' };
  assert.equal(inSmartList('all', sak(), ctx), true);
  assert.equal(inSmartList('mine', sak(), ctx), true);
  assert.equal(inSmartList('mine', sak({ owner: 'Selger A' }), ctx), false);
  assert.equal(inSmartList('mine', sak({ status: 'Avsluttet' }), ctx), false);
  assert.equal(inSmartList('overdue', sak({ due: offset(-1) }), ctx), true);
  assert.equal(inSmartList('overdue', sak({ due: today() }), ctx), false);
  assert.equal(inSmartList('week', sak({ due: offset(7) }), ctx), true);
  assert.equal(inSmartList('week', sak({ due: offset(8) }), ctx), false);
  assert.equal(inSmartList('stale', sak({ createdAt: offset(-30) }), ctx), true);
  assert.equal(inSmartList('nocontact', sak({ email: '' }), ctx), true);
  assert.equal(inSmartList('closed', sak({ status: 'Avsluttet' }), ctx), true);
});

test('sortering: stigende og synkende, tomme verdier sist, original liste urørt', () => {
  const list = [sak({ id: 'b', name: 'Bravo', due: '' }), sak({ id: 'c', name: 'Charlie', due: offset(1) }), sak({ id: 'a', name: 'Alfa', due: offset(5) })];
  assert.deepEqual(sortCases(list, 'name').map(c => c.id), ['a', 'b', 'c']);
  assert.deepEqual(sortCases(list, 'name', 'desc').map(c => c.id), ['c', 'b', 'a']);
  assert.deepEqual(sortCases(list, 'due').map(c => c.id), ['c', 'a', 'b']);
  assert.deepEqual(sortCases(list, 'due', 'desc').map(c => c.id), ['a', 'c', 'b']);
  assert.deepEqual(list.map(c => c.id), ['b', 'c', 'a']);
  assert.equal(sortCases(list, 'email'), list);
});

test('aktivitetslogg: aktivitet legges til, siste kontakt oppdateres og historikken bevares', () => {
  const stamp = '2026-11-10T09:30:00.000Z';
  const c = logActivity(sak({ history: [{ at: 'x', text: 'Henvendelse registrert' }] }), { type: 'Telefon', outcome: 'Ikke svar', note: '  Prøver igjen i morgen ', actor: 'Thomas' }, stamp);
  assert.equal(c.activities.length, 1);
  assert.deepEqual({ ...c.activities[0], id: null }, { id: null, type: 'Telefon', outcome: 'Ikke svar', note: 'Prøver igjen i morgen', by: 'Thomas', at: stamp });
  assert.equal(c.lastContact, '2026-11-10');
  assert.deepEqual(c.history.map(h => h.text), ['Henvendelse registrert', 'Aktivitet: Telefon · Ikke svar']);
  const note = logActivity(sak({ lastContact: '2026-11-01' }), { type: 'Notat', outcome: 'Fikk kontakt', note: 'Fiktivt notat', actor: 'Thomas' }, stamp);
  assert.equal(note.activities[0].outcome, '');
  assert.equal(note.lastContact, '2026-11-01');
});

test('aktivitetslogg: ugyldig type, manglende utfall, tomt notat, for langt notat og avsluttet sak avvises', () => {
  const ok = { type: 'Møte', outcome: 'Fikk kontakt', actor: 'Thomas' };
  assert.throws(() => logActivity(sak(), { ...ok, type: 'Besøk' }), /aktivitetstype/);
  assert.throws(() => logActivity(sak(), { ...ok, outcome: '' }), /utfall/);
  assert.throws(() => logActivity(sak(), { type: 'Notat', note: ' ', actor: 'Thomas' }), /notat/);
  assert.throws(() => logActivity(sak(), { ...ok, note: 'x'.repeat(201) }), /for langt/);
  assert.throws(() => logActivity(sak(), { ...ok, actor: '' }), /hvem/);
  assert.throws(() => logActivity(sak({ status: 'Avsluttet' }), ok), /Avsluttede/);
});

test('utfall ved avslutning er valgfritt, må være gyldig og hører bare til avsluttet sak', () => {
  assert.deepEqual(validateCloseOutcome(sak()), []);
  assert.deepEqual(validateCloseOutcome(sak({ status: 'Avsluttet', closeOutcome: WON })), []);
  assert.equal(validateCloseOutcome(sak({ status: 'Avsluttet', closeOutcome: 'Best' })).length, 1);
  assert.equal(validateCloseOutcome(sak({ closeOutcome: WON })).length, 1);
});

test('salgstrakt: kohort på registreringsdato, konvertering, median tid, kilde og utfall', () => {
  const cases = [
    sak({ id: '1', createdAt: '2026-10-01', agreementDate: '2026-10-11', startDate: '2026-10-21', status: 'Avsluttet', closeOutcome: WON }),
    sak({ id: '2', createdAt: '2026-10-05', agreementDate: '2026-10-25', source: 'Messe' }),
    sak({ id: '3', createdAt: '2026-10-07', status: 'Avsluttet', closeOutcome: 'Tapt – ingen respons' }),
    sak({ id: '4', createdAt: '2026-10-09', status: 'Avsluttet' }),
    sak({ id: '5', createdAt: '2026-09-30', agreementDate: '2026-10-02' }), // utenfor kohorten
  ];
  const f = funnel(cases, '2026-10-01', '2026-10-31');
  assert.deepEqual([f.registered, f.agreements, f.starts, f.closed], [4, 2, 1, 3]);
  assert.deepEqual([f.agreementRate, f.startRate], [50, 50]);
  assert.deepEqual([f.daysToAgreement, f.daysToStart], [15, 10]);
  assert.deepEqual(f.bySource, [{ source: 'Messe', registered: 1, agreements: 1, rate: 100 }, { source: 'Nettside', registered: 3, agreements: 1, rate: 33 }]);
  assert.deepEqual(f.outcomes, [{ outcome: WON, count: 1 }, { outcome: 'Tapt – ingen respons', count: 1 }, { outcome: 'Ikke satt', count: 1 }]);
});

test('salgstrakt uten saker gir null i stedet for prosent og median', () => {
  const f = funnel([], '2026-01-01', '2026-12-31');
  assert.deepEqual([f.registered, f.agreementRate, f.startRate, f.daysToAgreement, f.daysToStart], [0, null, null, null, null]);
  assert.deepEqual([f.bySource, f.outcomes], [[], []]);
});
