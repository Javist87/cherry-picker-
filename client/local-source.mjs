// Lokal datakilde: prototypens oppførsel uendret. Fiktive data i sessionStorage, bare i denne fanen.
// «Test som» er en demonstrasjon og ikke tilgangskontroll.
import { OWNERS, duplicates, saveCase, requestHandoff, acceptHandoff, completeFollowup, seed, offset } from '../domain.mjs';
import { logActivity, validateCloseOutcome, WON } from '../crm.mjs';

const storageKey = 'cherry-picker-demo-v1';

export function createLocalSource() {
  // Demodata: én sak uten aktivitet over terskelen og ett registrert utfall, slik at varsler og trakt kan prøves.
  let cases = seed().map(c => (c.id === 'demo-3' ? { ...c, createdAt: offset(-16) } : c.id === 'demo-4' ? { ...c, closeOutcome: WON } : c));
  let actor = 'Thomas';
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey));
    if (Array.isArray(saved) && saved.every(c => typeof c.id === 'string' && Array.isArray(c.history))) cases = saved;
  } catch { /* ingen lagrede data */ }
  const users = OWNERS.map(name => ({ id: name, name }));
  const source = {
    mode: 'local',
    warning: '',
    async init() {
      return {
        actor, users, actors: users, org: null,
        caps: { cases: true, create: true, aggregate: false, activity: true },
        texts: {
          saved: 'Saken er lagret i denne nettleserfanen.',
          handoffSent: 'Overlevering sendt til simulert mottaker.',
          reportScope: 'Hele demodatasettet.',
          actorNote: 'Test som en annen medarbeider øverst for å prøve mottak av overlevering. Dette simulerer roller og er ikke tilgangskontroll.',
        },
      };
    },
    async setActor(id) { actor = id; },
    async list() { return cases; },
    async history(id) { return cases.find(c => c.id === id)?.history || []; },
    async save(draft) {
      const dup = duplicates(draft, cases);
      if (dup.length) throw new Error('Mulig dublett: ' + dup.map(x => x.name).join(', ') + '. Kontroller eksisterende sak eller bruk et annet fiktivt eksempel.');
      const outcomeErrors = validateCloseOutcome(draft);
      if (outcomeErrors.length) throw new Error(outcomeErrors.join(' '));
      commit(saveCase(draft, cases));
    },
    async completeFollowup(id, { nextAction, due }) { replace(id, c => completeFollowup(c, { nextAction, due, actor })); },
    async logActivity(id, { type, outcome, note }) { replace(id, c => logActivity(c, { type, outcome, note, actor })); },
    async requestHandoff(id, recipient) { replace(id, c => requestHandoff(c, recipient)); },
    async acceptHandoff(id) { replace(id, c => acceptHandoff(c, actor)); },
  };
  function replace(id, change) { const next = change(cases.find(c => c.id === id)); commit(cases.map(c => (c.id === id ? next : c))); }
  function commit(next) {
    cases = next; source.warning = '';
    try { sessionStorage.setItem(storageKey, JSON.stringify(cases)); } catch { source.warning = 'Nettleseren kunne ikke lagre endringen. Hold fanen åpen.'; }
  }
  return source;
}
