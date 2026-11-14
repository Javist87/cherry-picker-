// CRM-tillegg oppå prototypens regler: aktivitetslogg, stillstandsvarsel, smarte lister, sortering,
// utfall ved avslutning og salgstrakt. Rene funksjoner uten lagring, nettverk eller DOM.
// domain.mjs er ikke endret. Kodeverk og terskler her er forslag og må bekreftes med salgsteamet (fase 1).
import { today, isActive, validDate } from './domain.mjs';

export const ACTIVITY_TYPES = ['Telefon', 'Møte', 'E-post', 'SMS', 'Notat'];
export const ACTIVITY_OUTCOMES = ['Fikk kontakt', 'Ikke svar', 'La igjen beskjed', 'Møte avtalt'];
export const CLOSE_OUTCOMES = ['Vunnet – oppstart', 'Tapt – valgte annen leverandør', 'Tapt – ikke aktuelt lenger', 'Tapt – ingen respons', 'Feilregistrert eller dublett', 'Annet'];
export const WON = CLOSE_OUTCOMES[0];
// Antall dager uten registrert aktivitet før en aktiv sak merkes. Forslag.
export const STALE_DAYS = 14;
const NOTE_MAX = 200;

const day = value => (value || '').slice(0, 10);
export function daysBetween(from, to) {
  return Math.round((Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 86400000);
}

// Siste registrerte aktivitet: logget aktivitet, fullført oppfølging eller registrering. Dato i formatet ÅÅÅÅ-MM-DD.
export function lastActivity(c) {
  const dates = [c.createdAt, c.lastContact, ...(c.completedActions || []).map(a => a.completedAt), ...(c.activities || []).map(a => a.at)];
  return dates.map(day).filter(validDate).sort().at(-1) || '';
}
export function daysSilent(c, date = today()) {
  const last = lastActivity(c);
  return last ? Math.max(0, daysBetween(last, date)) : null;
}
// Saker som avventer har en avtalt dato for ny vurdering og regnes ikke som stillstand.
export function isStale(c, date = today(), limit = STALE_DAYS) {
  const silent = daysSilent(c, date);
  return isActive(c) && c.status !== 'Avventer' && silent !== null && silent >= limit;
}
export const isOverdue = (c, date = today()) => isActive(c) && !!c.due && c.due < date;
export const missingContactInfo = c => isActive(c) && !(c.email || '').trim() && !(c.phone || '').trim();

// Varsler som vises på sakskort og i lister. Regelbasert og forklarbart, ingen rangering.
export function flags(c, date = today()) {
  const out = [];
  if (isOverdue(c, date)) out.push({ code: 'overdue', label: 'Forfalt' });
  if (isStale(c, date)) out.push({ code: 'stale', label: `Ingen aktivitet på ${daysSilent(c, date)} dager` });
  if (missingContactInfo(c)) out.push({ code: 'nocontact', label: 'Mangler e-post og telefon' });
  if (isActive(c) && !c.owner) out.push({ code: 'unassigned', label: 'Ufordelt' });
  return out;
}

export const SMART_LISTS = [
  { id: 'all', label: 'Alle' },
  { id: 'mine', label: 'Mine aktive' },
  { id: 'overdue', label: 'Forfalt' },
  { id: 'week', label: 'Frist innen 7 dager' },
  { id: 'stale', label: 'Uten aktivitet' },
  { id: 'nocontact', label: 'Mangler kontaktinfo' },
  { id: 'closed', label: 'Avsluttet' },
];
export function inSmartList(id, c, { actor = '', date = today() } = {}) {
  switch (id) {
    case 'mine': return isActive(c) && c.owner === actor;
    case 'overdue': return isOverdue(c, date);
    case 'week': return isActive(c) && !!c.due && c.due >= date && daysBetween(date, c.due) <= 7;
    case 'stale': return isStale(c, date);
    case 'nocontact': return missingContactInfo(c);
    case 'closed': return !isActive(c);
    default: return true;
  }
}

export const SORT_KEYS = ['name', 'municipality', 'status', 'owner', 'due', 'lastActivity'];
export function sortCases(list, key, direction = 'asc', label = c => c[key]) {
  if (!SORT_KEYS.includes(key)) return list;
  const value = c => String((key === 'lastActivity' ? lastActivity(c) : label(c)) ?? '');
  const sign = direction === 'desc' ? -1 : 1;
  // Tomme verdier havner sist uansett retning.
  return [...list].sort((a, b) => {
    const x = value(a), y = value(b);
    if (!x || !y) return x ? -1 : y ? 1 : 0;
    return sign * x.localeCompare(y, 'nb');
  });
}

// Logger en gjennomført aktivitet på saken. Notat-typen krever tekst; øvrige typer krever utfall.
export function logActivity(c, { type, outcome = '', note = '', actor }, stamp = new Date().toISOString()) {
  if (!isActive(c)) throw new Error('Avsluttede saker kan ikke få ny aktivitet.');
  if (!ACTIVITY_TYPES.includes(type)) throw new Error('Velg gyldig aktivitetstype.');
  const text = (note || '').trim();
  if (text.length > NOTE_MAX) throw new Error('Notatet er for langt.');
  if (type === 'Notat') { if (!text) throw new Error('Skriv et kort notat.'); outcome = ''; }
  else if (!ACTIVITY_OUTCOMES.includes(outcome)) throw new Error('Velg utfall for aktiviteten.');
  if (!actor) throw new Error('Aktiviteten mangler hvem som utførte den.');
  const activity = { id: crypto.randomUUID(), type, outcome, note: text, by: actor, at: stamp };
  return {
    ...c,
    activities: [...(c.activities || []), activity],
    lastContact: type === 'Notat' ? c.lastContact : stamp.slice(0, 10),
    history: [...(c.history || []), { at: stamp, text: 'Aktivitet: ' + type + (outcome ? ' · ' + outcome : '') }],
  };
}

export function validateCloseOutcome(c) {
  if (!c.closeOutcome) return [];
  if (!CLOSE_OUTCOMES.includes(c.closeOutcome)) return ['Velg gyldig utfall ved avslutning.'];
  if (isActive(c)) return ['Utfall kan bare settes når saken er avsluttet.'];
  return [];
}

const median = values => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b), mid = s.length >> 1;
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};
const share = (part, whole) => (whole ? Math.round((part / whole) * 100) : null);

// Salgstrakt for henvendelser registrert i perioden (kohort), målt på dagens status.
// Konvertering = andel av kohorten med registrert avtale. Ingen omsetning og ingen historiske øyeblikksbilder.
export function funnel(cases, from, to) {
  const cohort = cases.filter(c => c.createdAt && day(c.createdAt) >= from && day(c.createdAt) <= to);
  const agreements = cohort.filter(c => c.agreementDate);
  const starts = cohort.filter(c => c.startDate);
  const closed = cohort.filter(c => !isActive(c));
  const bySource = [...new Set(cohort.map(c => c.source))].sort().map(source => {
    const rows = cohort.filter(c => c.source === source), won = rows.filter(c => c.agreementDate).length;
    return { source, registered: rows.length, agreements: won, rate: share(won, rows.length) };
  });
  const outcomes = [...CLOSE_OUTCOMES, ''].map(outcome => ({ outcome: outcome || 'Ikke satt', count: closed.filter(c => (c.closeOutcome || '') === outcome).length })).filter(r => r.count);
  return {
    registered: cohort.length, agreements: agreements.length, starts: starts.length, closed: closed.length,
    agreementRate: share(agreements.length, cohort.length), startRate: share(starts.length, agreements.length),
    daysToAgreement: median(agreements.map(c => daysBetween(day(c.createdAt), c.agreementDate)).filter(n => n >= 0)),
    daysToStart: median(starts.filter(c => c.agreementDate).map(c => daysBetween(c.agreementDate, c.startDate)).filter(n => n >= 0)),
    bySource, outcomes,
  };
}
