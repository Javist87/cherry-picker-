// KUN FOR UTVIKLING OG TEST. Lagrer alt i prosessminnet. Alt forsvinner ved omstart.
// Ingen kryptering, ingen sikkerhetskopi, ingen flere instanser. Kan ikke brukes i produksjonsprofil.
import { COLLECTIONS, RepositoryConflict } from '../ports.mjs';
import { matchesClauses } from '../access.mjs';

const clone = value => (value === null || value === undefined ? value : structuredClone(value));

function emptyState() {
  const state = { audit: [], idempotency: new Map() };
  for (const name of COLLECTIONS) state[name] = new Map();
  return state;
}

function copyState(state) {
  const next = { audit: [...state.audit], idempotency: new Map(state.idempotency) };
  for (const name of COLLECTIONS) next[name] = new Map(state[name]);
  return next;
}

function collection(state, name) {
  if (!COLLECTIONS.includes(name)) throw new Error('Ukjent samling: ' + name);
  return state[name];
}

function createTx(state) {
  return {
    get: (name, id) => clone(collection(state, name).get(id) ?? null),
    insert(name, doc) {
      const col = collection(state, name);
      if (!doc?.id || col.has(doc.id)) throw new RepositoryConflict('Dokumentet finnes fra før.');
      if (doc.revision !== 1) throw new RepositoryConflict('Nytt dokument må ha revisjon 1.');
      col.set(doc.id, Object.freeze(clone(doc)));
    },
    replace(name, doc) {
      const col = collection(state, name);
      const stored = col.get(doc?.id);
      if (!stored || doc.revision !== stored.revision + 1) throw new RepositoryConflict();
      col.set(doc.id, Object.freeze(clone(doc)));
    },
    list(name, filter = {}) {
      const entries = Object.entries(filter);
      return [...collection(state, name).values()].filter(doc => entries.every(([k, v]) => doc[k] === v)).map(clone);
    },
    listCases: clauses => [...state.cases.values()].filter(c => matchesClauses(clauses, c)).map(clone),
    findDuplicateCases({ email, phone, name, municipality, excludeCaseId }) {
      const hits = [];
      for (const c of state.cases.values()) {
        if (c.id === excludeCaseId) continue;
        const sameName = !!name && c.nameNormalized === name && c.municipalityNormalized === municipality;
        const sameContact = [...state.relationships.values()].some(r => {
          if (r.personId !== c.personId || r.endedAt) return false;
          const contact = state.contacts.get(r.contactId);
          return !!contact && ((!!email && contact.emailNormalized === email) || (!!phone && contact.phoneNormalized === phone));
        });
        if (sameName || sameContact) hits.push(clone(c));
      }
      return hits;
    },
    // Revisjonsloggen kan bare legges til. Hendelsene fryses, og det finnes ingen metode for endring eller sletting.
    appendAudit(event) { state.audit.push(Object.freeze(clone(event))); },
    listAudit(filter = {}) {
      const entries = Object.entries(filter).filter(([, v]) => v !== undefined && v !== null);
      return state.audit.filter(e => entries.every(([k, v]) => e[k] === v)).map(clone);
    },
    getIdempotencyRecord: key => clone(state.idempotency.get(key) ?? null),
    putIdempotencyRecord(key, record) { state.idempotency.set(key, Object.freeze(clone(record))); },
  };
}

export function createDevMemoryRepository({ profile } = {}) {
  if (profile === 'production') throw new Error('dev-memory-lagring kan ikke brukes i produksjonsprofil.');
  let state = emptyState();
  let queue = Promise.resolve();
  return {
    kind: 'dev-memory',
    devOnly: true,
    // Transaksjoner kjøres én om gangen på en kopi. Kopien tas i bruk bare hvis fn fullfører.
    transaction(fn) {
      const run = queue.then(async () => {
        const working = copyState(state);
        const result = await fn(createTx(working));
        state = working;
        return result;
      });
      queue = run.catch(() => {});
      return run;
    },
  };
}
