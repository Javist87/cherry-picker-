// Tilgangskontroll på server. Tabellen (MATRIX) er den samme som i docs/access-matrix.md
// og contract/reference-model.mjs. Håndhevelsen under er skrevet uavhengig av referansemodellen,
// og test/api/access-differential.test.mjs kontrollerer at de to gir samme avgjørelse.
import { MATRIX } from '../contract/reference-model.mjs';
import { ApiError } from './errors.mjs';

export const OPERATIONS = Object.keys(MATRIX);

export function scopesFor(principal, operation) {
  if (!Object.hasOwn(MATRIX, operation)) throw new Error('Ukjent operasjon: ' + operation);
  const scopes = new Set();
  for (const role of principal?.roles || []) {
    const scope = MATRIX[operation][role];
    if (scope) scopes.add(scope);
  }
  return [...scopes];
}

export const grantedOperations = principal => OPERATIONS.filter(op => scopesFor(principal, op).length > 0);

// Oversetter rollenes omfang til nøytrale klausuler som en lagringsadapter kan bruke i en spørring.
export function scopeClauses(principal, operation) {
  const clauses = [];
  for (const scope of scopesFor(principal, operation)) {
    if (scope === 'alle') clauses.push({ kind: 'all' });
    if (scope === 'eier' || scope === 'tildelt') clauses.push({ kind: 'owner', userId: principal.id });
    if (scope === 'ansvarlig' || scope === 'tildelt') clauses.push({ kind: 'assignee', userId: principal.id });
    if (scope === 'mottaker' || scope === 'tildelt') clauses.push({ kind: 'recipient', userId: principal.id });
    if (scope === 'team') clauses.push({ kind: 'team', teams: [...(principal.teams || [])] });
    if (scope === 'avdeling') clauses.push({ kind: 'department', departments: [...(principal.departments || [])] });
  }
  return clauses;
}

export function matchesClauses(clauses, c) {
  return clauses.some(clause => {
    switch (clause.kind) {
      case 'all': return true;
      case 'owner': return !!c.ownerId && c.ownerId === clause.userId;
      case 'assignee': return !!c.openActionAssigneeId && c.openActionAssigneeId === clause.userId;
      case 'recipient': return !!c.pendingHandoffToId && c.pendingHandoffToId === clause.userId;
      case 'team': return clause.teams.includes(c.team);
      case 'department': return clause.departments.includes(c.department);
      default: return false;
    }
  });
}

export const inScope = (principal, operation, c) => matchesClauses(scopeClauses(principal, operation), c);

const COLLECTION_OPERATIONS = new Set(['case.search', 'case.export', 'report.aggregate', 'audit.read', 'admin.config', 'intake.submit', 'directory.read']);

// Returnerer { allowed: true } eller { allowed: false, status, code }.
export function decide(principal, operation, caseRecord) {
  if (!principal) return { allowed: false, status: 401, code: 'unauthenticated' };
  if (!scopesFor(principal, operation).length) return { allowed: false, status: 403, code: 'forbidden_operation' };
  if (COLLECTION_OPERATIONS.has(operation)) return { allowed: true };
  if (operation === 'case.create') {
    return caseRecord && inScope(principal, operation, caseRecord) ? { allowed: true } : { allowed: false, status: 403, code: 'forbidden_scope' };
  }
  if (!caseRecord) return { allowed: false, status: 404, code: 'not_found' };
  if (inScope(principal, operation, caseRecord)) return { allowed: true };
  // Kan brukeren lese saken, er 403 riktig. Ellers 404, likt svaret for en sak som ikke finnes.
  return inScope(principal, 'case.read', caseRecord)
    ? { allowed: false, status: 403, code: 'forbidden_scope' }
    : { allowed: false, status: 404, code: 'not_found' };
}

// Kaster ApiError ved avslag. Avslaget merkes slik at HTTP-laget skriver det til revisjonsloggen.
export function requireAccess(principal, operation, caseRecord, target = {}) {
  const decision = decide(principal, operation, caseRecord);
  if (decision.allowed) return;
  throw new ApiError(decision.status, decision.code).withDenial({
    operation,
    entityType: target.entityType || (COLLECTION_OPERATIONS.has(operation) ? null : 'case'),
    entityId: target.entityId ?? caseRecord?.id ?? null,
    caseId: caseRecord?.id ?? null,
  });
}
