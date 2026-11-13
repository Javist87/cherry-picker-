// Referansemodell for docs/backend-contract.md og docs/access-matrix.md.
//
// Dette er en kjørbar spesifikasjon, ikke produksjonskode. Den har ingen
// nettverkskall, ingen lagring og ingen reelle data. Formålet er at reglene
// i dokumentene kan testes (test/contract.test.mjs) før en backend finnes,
// og at samme tester senere kan rettes mot den faktiske implementasjonen.
// Filen serveres ikke av server.mjs og brukes ikke av app.mjs.

export const ROLES = ['selger', 'teamleder', 'avdelingsleder', 'leder', 'teknisk_admin', 'revisor', 'inntak'];

// Operasjon -> rolle -> omfang. Manglende rolle betyr ingen tilgang.
// Tabellen i docs/access-matrix.md skal være identisk; det kontrolleres av en test.
export const MATRIX = {
  'case.read':       { selger: 'tildelt', teamleder: 'team', avdelingsleder: 'avdeling' },
  'case.search':     { selger: 'tildelt', teamleder: 'team', avdelingsleder: 'avdeling' },
  'case.create':     { selger: 'team', teamleder: 'team', avdelingsleder: 'avdeling' },
  'case.update':     { selger: 'eier', teamleder: 'team', avdelingsleder: 'avdeling' },
  'action.complete': { selger: 'ansvarlig', teamleder: 'ansvarlig', avdelingsleder: 'ansvarlig' },
  'handoff.request': { selger: 'eier', teamleder: 'team', avdelingsleder: 'avdeling' },
  'handoff.confirm': { selger: 'mottaker', teamleder: 'mottaker', avdelingsleder: 'mottaker' },
  'case.reassign':   { teamleder: 'team', avdelingsleder: 'avdeling' },
  'case.export':     { avdelingsleder: 'avdeling' },
  'report.aggregate': { teamleder: 'team', avdelingsleder: 'avdeling', leder: 'alle' },
  'audit.read':      { revisor: 'alle' },
  'admin.config':    { teknisk_admin: 'alle' },
  'intake.submit':   { inntak: 'alle' },
};

const isOwner = (u, c) => c.ownerId === u.id;
const isAssignee = (u, c) => c.openActionAssigneeId === u.id;
const isRecipient = (u, c) => c.pendingHandoffToId === u.id;

const SCOPE_TESTS = {
  eier: isOwner,
  ansvarlig: isAssignee,
  mottaker: isRecipient,
  tildelt: (u, c) => isOwner(u, c) || isAssignee(u, c) || isRecipient(u, c),
  team: (u, c) => (u.teams || []).includes(c.team),
  avdeling: (u, c) => (u.departments || []).includes(c.department),
  alle: () => true,
};

// Feilformat etter RFC 9457 (application/problem+json), forenklet.
export function problem(status, code, extra = {}) {
  return { allowed: false, status, code, ...extra };
}
const ok = (extra = {}) => ({ allowed: true, status: 200, ...extra });

function grants(user, operation) {
  if (!(operation in MATRIX)) throw new Error('Ukjent operasjon: ' + operation);
  return (user.roles || []).map(role => MATRIX[operation][role]).filter(Boolean);
}
function inScope(user, operation, resource) {
  return grants(user, operation).some(scope => SCOPE_TESTS[scope](user, resource));
}

const COLLECTION_OPERATIONS = new Set(['case.search', 'case.export', 'report.aggregate', 'audit.read', 'admin.config', 'intake.submit']);

// Avgjør om en bruker kan utføre en operasjon.
// - 401: ingen gyldig sesjon.
// - 403: rollen har ikke operasjonen, eller saken er synlig men operasjonen er utenfor omfanget.
// - 404: saken finnes ikke ELLER er utenfor brukerens innsyn. Svarene skal være like,
//        slik at direkte oppslag ikke bekrefter at en sak eksisterer.
export function authorize(user, operation, resource) {
  if (!user) return problem(401, 'unauthenticated');
  if (!grants(user, operation).length) return problem(403, 'forbidden_operation');
  if (COLLECTION_OPERATIONS.has(operation)) return ok();
  if (operation === 'case.create') {
    return inScope(user, operation, resource) ? ok() : problem(403, 'forbidden_scope');
  }
  if (!resource) return problem(404, 'not_found');
  if (inScope(user, operation, resource)) return ok();
  return inScope(user, 'case.read', resource) ? problem(403, 'forbidden_scope') : problem(404, 'not_found');
}

// Søk: filtrering skjer på server. Antall treff gjelder bare saker i omfanget.
export function searchCases(user, cases, predicate = () => true) {
  const decision = authorize(user, 'case.search');
  if (!decision.allowed) return decision;
  const items = cases.filter(c => inScope(user, 'case.search', c) && predicate(c));
  return ok({ items, total: items.length });
}

// Eksport av saksdata: krever oppgitt formål og gir bare saker i omfanget.
export function exportCases(user, cases, { purpose } = {}) {
  const decision = authorize(user, 'case.export');
  if (!decision.allowed) return decision;
  if (!purpose?.trim()) return problem(422, 'validation_failed', { errors: [{ field: 'purpose', code: 'required' }] });
  const items = cases.filter(c => inScope(user, 'case.export', c));
  return ok({ items, total: items.length });
}

export const AGGREGATE_DIMENSIONS = ['status', 'bpa', 'source', 'municipality', 'department', 'team'];

// Aggregater: bare antall per gruppe, aldri sak, person eller kontakt.
// Grupper med færre enn minCell saker undertrykkes (count: null).
export function aggregate(user, cases, { groupBy, minCell = 5 } = {}) {
  const decision = authorize(user, 'report.aggregate');
  if (!decision.allowed) return decision;
  if (!AGGREGATE_DIMENSIONS.includes(groupBy)) {
    return problem(422, 'validation_failed', { errors: [{ field: 'groupBy', code: 'invalid_enum' }] });
  }
  const counts = new Map();
  for (const c of cases) {
    if (!inScope(user, 'report.aggregate', c)) continue;
    counts.set(c[groupBy], (counts.get(c[groupBy]) || 0) + 1);
  }
  const groups = [...counts].map(([key, count]) => (count < minCell ? { key, count: null, suppressed: true } : { key, count, suppressed: false }));
  return ok({ groupBy, minCell, groups });
}

// Samtidige oppdateringer: ETag er revisjonsnummeret i anførselstegn.
export const etag = resource => '"' + resource.revision + '"';

export function checkPrecondition(ifMatch, resource) {
  if (!ifMatch) return problem(428, 'precondition_required');
  if (ifMatch !== etag(resource)) return problem(412, 'precondition_failed', { currentEtag: etag(resource) });
  return ok();
}

export function applyUpdate(resource, patch, ifMatch) {
  const decision = checkPrecondition(ifMatch, resource);
  if (!decision.allowed) return decision;
  const updated = { ...resource, ...patch, id: resource.id, revision: resource.revision + 1 };
  return ok({ resource: updated, etag: etag(updated) });
}

// Idempotent inntak fra nettskjema.
const INTAKE_FIELDS = ['name', 'email', 'phone', 'municipality'];
const canonical = payload => JSON.stringify(Object.keys(payload).sort().map(key => [key, payload[key]]));
const normEmail = value => (value || '').trim().toLowerCase();
const normPhone = value => (value || '').replace(/\D/g, '');

export function createIntake() {
  const byKey = new Map();
  const submissions = [];
  let sequence = 0;
  return {
    submissions,
    submit({ idempotencyKey, payload }) {
      if (!idempotencyKey || !/^[A-Za-z0-9-]{16,128}$/.test(idempotencyKey)) return problem(400, 'idempotency_key_required');
      const errors = [];
      for (const field of Object.keys(payload || {})) if (!INTAKE_FIELDS.includes(field)) errors.push({ field, code: 'unknown_field' });
      if (!payload?.name?.trim()) errors.push({ field: 'name', code: 'required' });
      if (!normEmail(payload?.email) && !normPhone(payload?.phone)) errors.push({ field: 'email', code: 'required' });
      if (errors.length) return problem(422, 'validation_failed', { errors });

      const fingerprint = canonical(payload);
      const earlier = byKey.get(idempotencyKey);
      if (earlier) {
        if (earlier.fingerprint !== fingerprint) return problem(422, 'idempotency_key_reused');
        return { ...earlier.response, replayed: true };
      }
      // Mulig dublett registreres internt til manuell vurdering. Svaret til
      // avsender er likt uansett, slik at skjemaet ikke avslører hvem som finnes.
      const duplicate = submissions.some(s =>
        (normEmail(payload.email) && normEmail(payload.email) === normEmail(s.payload.email)) ||
        (normPhone(payload.phone) && normPhone(payload.phone) === normPhone(s.payload.phone)));
      const submission = { id: 'sub-' + (++sequence), payload, state: duplicate ? 'possible_duplicate' : 'received' };
      submissions.push(submission);
      const response = { allowed: true, status: 202, body: { submissionId: submission.id } };
      byKey.set(idempotencyKey, { fingerprint, response });
      return { ...response, replayed: false };
    },
  };
}
