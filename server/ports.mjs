// Porter mellom applikasjonen og omgivelsene. Applikasjonskoden (service.mjs, http.mjs)
// kjenner bare disse grensesnittene. Valg av database og identitetsløsning (B-01 til B-03)
// avgjør hvilke adaptere som skrives, ikke hvordan API-et er bygget.
//
// ── Lagringsport (repository) ────────────────────────────────────────────────
// repository.kind            tekst, for eksempel 'dev-memory'
// repository.devOnly         true for adaptere som aldri skal brukes i produksjon
// repository.transaction(fn) kjører fn(tx) atomisk og serialiserbart. Kaster fn, lagres ingenting.
//
// tx.get(collection, id)                 → dokument eller null
// tx.insert(collection, doc)             doc.revision skal være 1
// tx.replace(collection, doc)            doc.revision må være lagret revisjon + 1, ellers RepositoryConflict
// tx.list(collection, filter)            filter er likhet på felt, f.eks. { caseId }
// tx.listCases(clauses)                  saker som treffer minst én omfangsklausul (se access.mjs)
// tx.findDuplicateCases(probe)           { email, phone, name, municipality, excludeCaseId } – normaliserte verdier
// tx.appendAudit(event)                  eneste skriveoperasjon mot revisjonsloggen
// tx.listAudit(filter)                   { caseId, actorId, operation, outcome }
// tx.getIdempotencyRecord(key) / tx.putIdempotencyRecord(key, record)
//
// Porten har med hensikt ingen metode for å endre eller slette AuditEvent, og ingen
// generell slettemetode. Sletting etter lagringsfrist (B-10) må spesifiseres før den bygges.
// En databaseadapter bør i tillegg bruke en databasekonto uten UPDATE/DELETE på loggtabellen.
//
// ── Identitetsport ───────────────────────────────────────────────────────────
// identity.kind, identity.devOnly
// identity.authenticate(req)  → principal eller null. Skal validere sesjonen på server ved hvert kall
//                               og returnere gjeldende roller og tilhørighet (ikke en kopi fra innlogging
//                               som er eldre enn avtalt tid, se N-21 og B-02).
//                               principal: { id, displayName, roles[], departments[], teams[] }
// identity.handles(pathname)  → true for adapterens egne ruter (innlogging, tilbakekall, utlogging)
// identity.handle(req, res, url)
// identity.directory.getUser(id) / identity.directory.listUsers()
//                               oppslag av ansatte for validering av eier, ansvarlig og mottaker
//
// En OIDC-adapter (for eksempel mot Entra ID) er IKKE skrevet. Den må gjøre autorisasjonskodeflyt
// med PKCE, validere ID-token (utsteder, mottaker, signatur, utløp, nonce), holde sesjonen på server
// med HttpOnly-informasjonskapsel, og avbilde grupper til roller, avdeling og team.
export const COLLECTIONS = ['persons', 'contacts', 'relationships', 'cases', 'actions', 'handoffs', 'intakeSubmissions'];

export class RepositoryConflict extends Error {
  constructor(message = 'Revisjonskonflikt') { super(message); this.name = 'RepositoryConflict'; }
}

const REPOSITORY_METHODS = ['transaction'];
const IDENTITY_METHODS = ['authenticate', 'handles', 'handle'];

export function assertRepositoryPort(repository) {
  for (const m of REPOSITORY_METHODS) if (typeof repository?.[m] !== 'function') throw new Error('Lagringsadapteren mangler ' + m + '().');
  if (typeof repository.kind !== 'string') throw new Error('Lagringsadapteren mangler kind.');
  return repository;
}
export function assertIdentityPort(identity) {
  for (const m of IDENTITY_METHODS) if (typeof identity?.[m] !== 'function') throw new Error('Identitetsadapteren mangler ' + m + '().');
  for (const m of ['getUser', 'listUsers']) if (typeof identity.directory?.[m] !== 'function') throw new Error('Identitetsadapteren mangler directory.' + m + '().');
  if (typeof identity.kind !== 'string') throw new Error('Identitetsadapteren mangler kind.');
  return identity;
}

// Produksjonsprofilen godtar aldri en adapter som er merket devOnly.
export function assertAllowedInProfile(adapter, profile) {
  if (profile === 'production' && adapter.devOnly !== false) {
    throw new Error(`Adapteren «${adapter.kind}» er bare for utvikling og test og kan ikke brukes i produksjonsprofil.`);
  }
  return adapter;
}
