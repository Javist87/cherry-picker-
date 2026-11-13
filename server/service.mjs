// Applikasjonslaget: alle regler i docs/backend-contract.md og docs/access-matrix.md håndheves her.
// Laget kjenner bare portene i ports.mjs. Det har ingen kunnskap om HTTP, database eller leverandør.
import { randomUUID } from 'node:crypto';
import { ApiError, validationError } from './errors.mjs';
import { CODEBOOK, CASE_ROLES, departmentOf, teamBelongs } from './codebook.mjs';
import { today as todayOf, validDate, dateInOslo } from './clock.mjs';
import { requireAccess, scopesFor, scopeClauses, inScope, grantedOperations } from './access.mjs';
import { RepositoryConflict } from './ports.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = value => typeof value === 'string' && UUID.test(value);
export const etag = resource => '"' + resource.revision + '"';

const MAX_TEXT = 200;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normText = value => (value || '').trim().toLowerCase();
const normPhone = value => (value || '').replace(/\D/g, '');
const blank = value => value === undefined || value === null || value === '';

const CASE_TEXT_FIELDS = ['name', 'municipality', 'department', 'team', 'ownerId', 'status', 'bpa', 'source', 'reason', 'agreementDate', 'startDate'];
const NESTED = { person: ['displayName'], contact: ['displayName', 'email', 'phone', 'role'], action: ['description', 'assigneeId', 'dueDate'] };
const AGGREGATE_DIMENSIONS = ['status', 'bpa', 'source', 'municipality', 'department', 'team'];
const INTAKE_FIELDS = ['name', 'email', 'phone', 'municipality'];
const HIDDEN_CASE_FIELDS = ['nameNormalized', 'municipalityNormalized', 'openActionAssigneeId', 'pendingHandoffToId'];

const MESSAGES = {
  required: 'Feltet må fylles ut.',
  invalid_enum: 'Ugyldig verdi.',
  invalid_date: 'Ugyldig dato.',
  invalid_email: 'Ugyldig e-postadresse.',
  invalid_type: 'Feil datatype.',
  invalid_reference: 'Ukjent eller ikke tillatt referanse.',
  too_long: 'Teksten er for lang.',
  unknown_field: 'Ukjent felt.',
  read_only: 'Feltet kan ikke endres her.',
  open_action_required: 'Aktive saker må ha ansvarlig, neste handling og gyldig frist.',
  next_action_required: 'Avtal neste handling og en frist fra i dag eller senere.',
  past_date: 'Fristen må være i dag eller senere.',
  future_date: 'Faktisk oppstart kan ikke ligge i fremtiden.',
  date_order: 'Oppstart krever avtaledato og kan ikke være før avtalen.',
};
const fieldError = (field, code, message) => ({ field, code, message: message || MESSAGES[code] || code });

// Leser tekstfelt strengt: ukjente felt avvises, tekst trimmes, lengde kontrolleres.
function readObject(input, allowed, prefix, errors) {
  const out = {};
  if (input === undefined) return out;
  if (input === null || typeof input !== 'object' || Array.isArray(input)) { errors.push(fieldError(prefix.replace(/\.$/, '') || 'body', 'invalid_type')); return out; }
  for (const [key, raw] of Object.entries(input)) {
    if (!allowed.includes(key)) { errors.push(fieldError(prefix + key, 'unknown_field')); continue; }
    if (raw === null) { out[key] = ''; continue; }
    if (typeof raw !== 'string') { errors.push(fieldError(prefix + key, 'invalid_type')); continue; }
    const value = raw.trim();
    if (value.length > MAX_TEXT) { errors.push(fieldError(prefix + key, 'too_long')); continue; }
    out[key] = value;
  }
  return out;
}

function readCaseBody(body, { patch }) {
  const errors = [];
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw validationError([fieldError('body', 'invalid_type')]);
  const { person, contact, action, confirmNotDuplicate, ...rest } = body;
  const fields = readObject(rest, CASE_TEXT_FIELDS, '', errors);
  if (patch && 'ownerId' in fields) { errors.push(fieldError('ownerId', 'read_only', 'Eier endres med overlevering eller eierskifte.')); delete fields.ownerId; }
  const nested = {};
  for (const [name, allowed] of Object.entries(NESTED)) if (body[name] !== undefined) nested[name] = readObject(body[name], allowed, name + '.', errors);
  if (confirmNotDuplicate !== undefined && typeof confirmNotDuplicate !== 'boolean') errors.push(fieldError('confirmNotDuplicate', 'invalid_type'));
  return { fields, ...nested, confirmNotDuplicate: confirmNotDuplicate === true, errors };
}

export function createService({ repository, directory, clock, config }) {
  const nowIso = () => clock.now().toISOString();
  const today = () => todayOf(clock);

  async function audit(tx, ctx, event) {
    await tx.appendAudit({
      id: randomUUID(), at: nowIso(), requestId: ctx.requestId,
      actorId: ctx.principal?.id ?? null, actorRoles: [...(ctx.principal?.roles || [])],
      operation: null, outcome: 'allowed', reason: null,
      entityType: null, entityId: null, caseId: null, changedFields: [], purpose: null, details: null,
      ...event,
    });
  }

  // Brukere som kan eie eller motta saker i en avdeling.
  async function caseUserIn(department, userId) {
    if (!isUuid(userId)) return null;
    const user = await directory.getUser(userId);
    if (!user || !user.roles.some(r => CASE_ROLES.includes(r)) || !user.departments.includes(department)) return null;
    return user;
  }

  // V-01 til V-08. state er saken slik den vil bli lagret, med åpen handling og kontakt.
  async function validateState(state, { dueMustBeFuture }) {
    const errors = [];
    for (const key of ['name', 'municipality', 'department', 'team']) if (blank(state[key])) errors.push(fieldError(key, 'required'));
    for (const key of ['status', 'bpa', 'source']) if (!CODEBOOK[key].includes(state[key])) errors.push(fieldError(key, blank(state[key]) ? 'required' : 'invalid_enum'));
    if (!blank(state.department) && !departmentOf(state.department)) errors.push(fieldError('department', 'invalid_enum'));
    else if (!blank(state.department) && !blank(state.team) && !teamBelongs(state.department, state.team)) errors.push(fieldError('team', 'invalid_enum', 'Teamet tilhører ikke avdelingen.'));

    if (state.status !== 'closed' && CODEBOOK.status.includes(state.status)) {
      const a = state.action;
      if (blank(state.ownerId) || !a || blank(a.description) || blank(a.assigneeId) || blank(a.dueDate)) errors.push(fieldError('action', 'open_action_required'));
      else if (!validDate(a.dueDate)) errors.push(fieldError('action.dueDate', 'invalid_date'));
      else if (dueMustBeFuture && a.dueDate < today()) errors.push(fieldError('action.dueDate', 'past_date'));
      if (!blank(state.ownerId) && departmentOf(state.department) && !(await caseUserIn(state.department, state.ownerId))) errors.push(fieldError('ownerId', 'invalid_reference'));
      if (a && !blank(a.assigneeId) && departmentOf(state.department) && !(await caseUserIn(state.department, a.assigneeId))) errors.push(fieldError('action.assigneeId', 'invalid_reference'));
    }
    if (['on_hold', 'closed'].includes(state.status) && blank(state.reason)) {
      errors.push(fieldError('reason', 'required', state.status === 'on_hold' ? 'Oppgi årsak til pause. Fristen er dato for ny vurdering.' : 'Oppgi årsak til avslutning.'));
    }
    for (const key of ['agreementDate', 'startDate']) if (!blank(state[key]) && !validDate(state[key])) errors.push(fieldError(key, 'invalid_date'));
    if (!blank(state.startDate) && validDate(state.startDate)) {
      if (blank(state.agreementDate)) errors.push(fieldError('startDate', 'date_order', 'Registrer avtaledato før faktisk oppstart.'));
      else if (state.startDate < state.agreementDate) errors.push(fieldError('startDate', 'date_order', 'Oppstart kan ikke være før avtalen.'));
      if (state.startDate > today()) errors.push(fieldError('startDate', 'future_date'));
    }
    if (state.contact) {
      if (blank(state.contact.displayName)) errors.push(fieldError('contact.displayName', 'required'));
      if (!blank(state.contact.email) && !EMAIL.test(state.contact.email)) errors.push(fieldError('contact.email', 'invalid_email'));
      if (!blank(state.contact.role) && !CODEBOOK.relationshipRole.includes(state.contact.role)) errors.push(fieldError('contact.role', 'invalid_enum'));
    }
    if (state.person && blank(state.person.displayName)) errors.push(fieldError('person.displayName', 'required'));
    return errors;
  }

  // V-14. Detaljer vises bare for treff i brukerens omfang (N-22, forslag under B-09).
  // Bare roller med eierskifte (teamleder, avdelingsleder) kan bekrefte at det ikke er en dublett. Antakelse.
  async function checkDuplicates(tx, ctx, state, excludeCaseId, confirmed) {
    const hits = await tx.findDuplicateCases({
      email: normText(state.contact?.email), phone: normPhone(state.contact?.phone),
      name: normText(state.name), municipality: normText(state.municipality), excludeCaseId,
    });
    if (!hits.length) return false;
    const mayConfirm = scopesFor(ctx.principal, 'case.reassign').length > 0;
    if (confirmed && mayConfirm) return true;
    const visible = hits.filter(c => inScope(ctx.principal, 'case.read', c));
    throw new ApiError(409, 'possible_duplicate', {
      matches: visible.map(c => ({ caseId: c.id, name: c.name })),
      outsideScope: visible.length < hits.length,
      mayConfirm,
    });
  }

  async function caseView(tx, c) {
    const person = await tx.get('persons', c.personId);
    const relationships = (await tx.list('relationships', { personId: c.personId })).filter(r => !r.endedAt);
    const contacts = [];
    for (const r of relationships) {
      const contact = await tx.get('contacts', r.contactId);
      if (contact) contacts.push({ id: contact.id, revision: contact.revision, displayName: contact.displayName, email: contact.email, phone: contact.phone, role: r.role, relationshipId: r.id, primary: contact.id === c.primaryContactId });
    }
    const actions = await tx.list('actions', { caseId: c.id });
    const handoffs = (await tx.list('handoffs', { caseId: c.id })).sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
    const view = { ...c };
    for (const key of HIDDEN_CASE_FIELDS) delete view[key];
    return {
      ...view,
      person: person && { id: person.id, displayName: person.displayName },
      contacts,
      openAction: actions.find(a => !a.completedAt && !a.closedAt) || null,
      completedActions: actions.filter(a => a.completedAt).sort((a, b) => a.completedAt.localeCompare(b.completedAt)),
      pendingHandoff: handoffs.find(h => h.state === 'pending') || null,
      lastHandoff: handoffs.at(-1) || null,
    };
  }

  const base = ctx => ({ id: randomUUID(), revision: 1, createdAt: nowIso(), updatedAt: nowIso(), createdBy: ctx.principal.id });
  const bump = doc => ({ ...doc, revision: doc.revision + 1, updatedAt: nowIso() });

  function checkIfMatch(ifMatch, c) {
    if (!ifMatch) throw new ApiError(428, 'precondition_required');
    if (ifMatch !== etag(c)) throw new ApiError(412, 'precondition_failed').withHeaders({ ETag: etag(c) });
  }

  async function loadCase(tx, ctx, operation, caseId, target = {}) {
    const c = isUuid(caseId) ? await tx.get('cases', caseId) : null;
    requireAccess(ctx.principal, operation, c, { entityId: isUuid(caseId) ? caseId : null, ...target });
    return c;
  }

  // For handlinger på avsluttet sak: den som kan lese saken får 409 case_closed (V-10).
  async function loadActiveCase(tx, ctx, operation, caseId, target = {}) {
    const c = isUuid(caseId) ? await tx.get('cases', caseId) : null;
    if (c && c.status === 'closed' && scopesFor(ctx.principal, operation).length && inScope(ctx.principal, 'case.read', c)) throw new ApiError(409, 'case_closed');
    requireAccess(ctx.principal, operation, c, { entityId: isUuid(caseId) ? caseId : null, ...target });
    return c;
  }

  const run = async fn => {
    try { return await repository.transaction(fn); }
    catch (error) {
      if (error instanceof RepositoryConflict) throw new ApiError(412, 'precondition_failed');
      throw error;
    }
  };

  async function closeOpenWork(tx, c, { cancelHandoff = true, closeAction = true } = {}) {
    if (closeAction) for (const a of await tx.list('actions', { caseId: c.id })) {
      if (!a.completedAt && !a.closedAt) await tx.replace('actions', bump({ ...a, closedAt: nowIso(), closedReason: 'case_closed' }));
    }
    if (cancelHandoff) for (const h of await tx.list('handoffs', { caseId: c.id })) {
      if (h.state === 'pending') await tx.replace('handoffs', bump({ ...h, state: 'cancelled', decidedAt: nowIso() }));
    }
  }

  return {
    // Avslag skrives i egen transaksjon, fordi transaksjonen som ga avslaget er rullet tilbake.
    async recordDenial(ctx, { operation, code, entityType = null, entityId = null, caseId = null }) {
      await repository.transaction(tx => audit(tx, ctx, { operation, outcome: 'denied', reason: code, entityType, entityId, caseId }));
    },

    async me(ctx) {
      return { user: ctx.principal, operations: grantedOperations(ctx.principal), codebook: CODEBOOK, identityKind: config.identityKind, today: today() };
    },

    // Ansatte med saksrolle i egne avdelinger. Brukes til valg av ansvarlig og mottaker.
    async listUsers(ctx) {
      requireAccess(ctx.principal, 'directory.read');
      const users = (await directory.listUsers()).filter(u => u.roles.some(r => CASE_ROLES.includes(r)) && u.departments.some(d => ctx.principal.departments.includes(d)));
      return { items: users.map(u => ({ id: u.id, displayName: u.displayName, departments: u.departments, teams: u.teams })) };
    },

    async createCase(ctx, body) {
      if (!scopesFor(ctx.principal, 'case.create').length) requireAccess(ctx.principal, 'case.create', null);
      const input = readCaseBody(body, { patch: false });
      const f = input.fields;
      const status = f.status || 'new';
      const state = {
        name: f.name, municipality: f.municipality, department: f.department, team: f.team,
        ownerId: f.ownerId || '', status, bpa: f.bpa || 'unclear', source: f.source,
        reason: f.reason || '', agreementDate: f.agreementDate || '', startDate: f.startDate || '',
        person: input.person ? { displayName: input.person.displayName } : null, // uten oppgitt person brukes saksnavnet
        contact: input.contact && Object.values(input.contact).some(v => !blank(v)) ? { role: 'other', ...input.contact } : null,
        action: status === 'closed' ? null : (input.action ? { assigneeId: f.ownerId || '', ...input.action } : null),
      };
      if (status !== 'closed' && state.action && blank(state.action.assigneeId)) state.action.assigneeId = state.ownerId;
      const errors = [...input.errors, ...(await validateState(state, { dueMustBeFuture: true }))];
      if (errors.length) throw validationError(errors);
      requireAccess(ctx.principal, 'case.create', { department: state.department, team: state.team });

      return run(async tx => {
        const overridden = await checkDuplicates(tx, ctx, state, null, input.confirmNotDuplicate);
        const person = { ...base(ctx), displayName: state.person?.displayName ?? state.name };
        await tx.insert('persons', person);
        let contact = null;
        if (state.contact) {
          contact = { ...base(ctx), displayName: state.contact.displayName, email: state.contact.email || '', phone: state.contact.phone || '', emailNormalized: normText(state.contact.email), phoneNormalized: normPhone(state.contact.phone) };
          await tx.insert('contacts', contact);
          await tx.insert('relationships', { ...base(ctx), personId: person.id, contactId: contact.id, role: state.contact.role || 'other', endedAt: null });
        }
        const c = {
          ...base(ctx), name: state.name, nameNormalized: normText(state.name), municipality: state.municipality, municipalityNormalized: normText(state.municipality),
          personId: person.id, primaryContactId: contact?.id || null, department: state.department, team: state.team,
          ownerId: state.ownerId || null, status, bpa: state.bpa, source: state.source, reason: state.reason,
          agreementDate: state.agreementDate || null, startDate: state.startDate || null,
          closedAt: status === 'closed' ? nowIso() : null, openActionAssigneeId: null, pendingHandoffToId: null,
        };
        if (state.action) {
          const action = { ...base(ctx), caseId: c.id, description: state.action.description, assigneeId: state.action.assigneeId, dueDate: state.action.dueDate, completedAt: null, completedBy: null, closedAt: null, closedReason: null };
          await tx.insert('actions', action);
          c.openActionAssigneeId = action.assigneeId;
        }
        await tx.insert('cases', c);
        await audit(tx, ctx, { operation: 'case.create', entityType: 'case', entityId: c.id, caseId: c.id, changedFields: Object.keys(f).sort(), details: overridden ? { duplicateOverride: true } : null });
        return { body: await caseView(tx, c), etag: etag(c) };
      });
    },

    async updateCase(ctx, caseId, ifMatch, body) {
      return run(async tx => {
        const c = await loadCase(tx, ctx, 'case.update', caseId);
        checkIfMatch(ifMatch, c);
        const input = readCaseBody(body, { patch: true });
        const f = input.fields;
        const view = await caseView(tx, c);
        const primary = view.contacts.find(k => k.primary) || null;
        const status = f.status ?? c.status;
        const merged = key => (key in f ? f[key] : (c[key] ?? ''));
        const contactTouched = !!input.contact && Object.keys(input.contact).length > 0;
        const state = {
          name: merged('name'), municipality: merged('municipality'), department: merged('department'), team: merged('team'),
          ownerId: c.ownerId || '', status, bpa: merged('bpa'), source: merged('source'), reason: merged('reason'),
          agreementDate: merged('agreementDate'), startDate: merged('startDate'),
          person: input.person && 'displayName' in input.person ? { displayName: input.person.displayName } : null,
          contact: contactTouched ? { displayName: primary?.displayName || '', email: primary?.email || '', phone: primary?.phone || '', role: primary?.role || 'other', ...input.contact } : (primary ? { ...primary } : null),
          action: status === 'closed' ? null : (view.openAction || input.action ? { ...(view.openAction || {}), ...(input.action || {}) } : null),
        };
        if (state.action && blank(state.action.assigneeId)) state.action.assigneeId = state.ownerId;
        const dueChanged = !!state.action && state.action.dueDate !== view.openAction?.dueDate;
        const errors = [...input.errors, ...(await validateState(state, { dueMustBeFuture: dueChanged }))];
        if (errors.length) throw validationError(errors);
        // Flytting til annet team eller annen avdeling krever at målet er i brukerens omfang for opprettelse.
        if (state.department !== c.department || state.team !== c.team) requireAccess(ctx.principal, 'case.create', { department: state.department, team: state.team }, { entityType: 'case', entityId: c.id });

        const identityChanged = normText(state.name) !== c.nameNormalized || normText(state.municipality) !== c.municipalityNormalized ||
          (contactTouched && (normText(state.contact.email) !== normText(primary?.email) || normPhone(state.contact.phone) !== normPhone(primary?.phone)));
        const overridden = identityChanged ? await checkDuplicates(tx, ctx, state, c.id, input.confirmNotDuplicate) : false;

        const changed = [];
        const next = { ...c };
        for (const key of ['name', 'municipality', 'department', 'team', 'status', 'bpa', 'source', 'reason']) if (state[key] !== (c[key] ?? '')) { next[key] = state[key]; changed.push(key); }
        for (const key of ['agreementDate', 'startDate']) if ((state[key] || null) !== c[key]) { next[key] = state[key] || null; changed.push(key); }
        next.nameNormalized = normText(next.name); next.municipalityNormalized = normText(next.municipality);

        if (state.person && state.person.displayName !== view.person?.displayName) {
          const person = await tx.get('persons', c.personId);
          await tx.replace('persons', bump({ ...person, displayName: state.person.displayName }));
          changed.push('person.displayName');
        }
        if (contactTouched) {
          const values = { displayName: state.contact.displayName, email: state.contact.email || '', phone: state.contact.phone || '' };
          if (primary) {
            const stored = await tx.get('contacts', primary.id);
            const fields = Object.keys(values).filter(k => values[k] !== stored[k]);
            if (fields.length) { await tx.replace('contacts', bump({ ...stored, ...values, emailNormalized: normText(values.email), phoneNormalized: normPhone(values.phone) })); changed.push(...fields.map(k => 'contact.' + k)); }
            if (state.contact.role !== primary.role) {
              const rel = await tx.get('relationships', primary.relationshipId);
              await tx.replace('relationships', bump({ ...rel, role: state.contact.role })); changed.push('contact.role');
            }
          } else {
            const contact = { ...base(ctx), ...values, emailNormalized: normText(values.email), phoneNormalized: normPhone(values.phone) };
            await tx.insert('contacts', contact);
            await tx.insert('relationships', { ...base(ctx), personId: c.personId, contactId: contact.id, role: state.contact.role || 'other', endedAt: null });
            next.primaryContactId = contact.id; changed.push('contact');
          }
        }

        if (status === 'closed' && c.status !== 'closed') {
          // Avslutning lukker åpen handling og ventende overlevering i samme transaksjon.
          await closeOpenWork(tx, c);
          next.closedAt = nowIso(); next.openActionAssigneeId = null; next.pendingHandoffToId = null;
        } else if (status !== 'closed') {
          if (c.status === 'closed') next.closedAt = null;
          const open = view.openAction;
          if (!open) {
            const action = { ...base(ctx), caseId: c.id, description: state.action.description, assigneeId: state.action.assigneeId, dueDate: state.action.dueDate, completedAt: null, completedBy: null, closedAt: null, closedReason: null };
            await tx.insert('actions', action); next.openActionAssigneeId = action.assigneeId; changed.push('action');
          } else {
            const fields = ['description', 'assigneeId', 'dueDate'].filter(k => state.action[k] !== open[k]);
            if (fields.length) {
              await tx.replace('actions', bump({ ...open, description: state.action.description, assigneeId: state.action.assigneeId, dueDate: state.action.dueDate }));
              next.openActionAssigneeId = state.action.assigneeId; changed.push(...fields.map(k => 'action.' + k));
            }
          }
        }
        if (!changed.length) return { body: view, etag: etag(c) };
        const saved = bump(next);
        await tx.replace('cases', saved);
        await audit(tx, ctx, { operation: 'case.update', entityType: 'case', entityId: c.id, caseId: c.id, changedFields: changed.sort(), details: overridden ? { duplicateOverride: true } : null });
        return { body: await caseView(tx, saved), etag: etag(saved) };
      });
    },

    async completeAction(ctx, caseId, actionId, ifMatch, body) {
      return run(async tx => {
        const c = await loadActiveCase(tx, ctx, 'action.complete', caseId, { entityType: 'action', entityId: isUuid(actionId) ? actionId : null });
        const action = isUuid(actionId) ? await tx.get('actions', actionId) : null;
        if (!action || action.caseId !== c.id) throw new ApiError(404, 'not_found');
        checkIfMatch(ifMatch, c);
        if (action.completedAt || action.closedAt) throw new ApiError(409, 'action_already_completed');
        const errors = [];
        if (body === null || typeof body !== 'object' || Array.isArray(body)) throw validationError([fieldError('body', 'invalid_type')]);
        for (const key of Object.keys(body)) if (key !== 'next') errors.push(fieldError(key, 'unknown_field'));
        const nextInput = readObject(body.next ?? {}, NESTED.action, 'next.', errors);
        const assigneeId = nextInput.assigneeId || action.assigneeId;
        // V-09: fullføring krever ny handling med frist fra i dag eller senere.
        if (blank(nextInput.description) || !validDate(nextInput.dueDate) || nextInput.dueDate < today()) errors.push(fieldError('next', 'next_action_required'));
        if (!(await caseUserIn(c.department, assigneeId))) errors.push(fieldError('next.assigneeId', 'invalid_reference'));
        if (errors.length) throw validationError(errors);

        await tx.replace('actions', bump({ ...action, completedAt: nowIso(), completedBy: ctx.principal.id }));
        const created = { ...base(ctx), caseId: c.id, description: nextInput.description, assigneeId, dueDate: nextInput.dueDate, completedAt: null, completedBy: null, closedAt: null, closedReason: null };
        await tx.insert('actions', created);
        const saved = bump({ ...c, openActionAssigneeId: assigneeId });
        await tx.replace('cases', saved);
        await audit(tx, ctx, { operation: 'action.complete', entityType: 'action', entityId: action.id, caseId: c.id, changedFields: ['action'] });
        return { body: await caseView(tx, saved), etag: etag(saved) };
      });
    },

    async requestHandoff(ctx, caseId, ifMatch, body) {
      return run(async tx => {
        const c = await loadActiveCase(tx, ctx, 'handoff.request', caseId);
        checkIfMatch(ifMatch, c);
        const errors = [];
        const input = readObject(body, ['toUserId'], '', errors);
        // Mottaker må ha saksrolle i sakens avdeling og kan ikke være nåværende eier. Antakelse, se B-08.
        if (blank(input.toUserId)) errors.push(fieldError('toUserId', 'required'));
        else if (input.toUserId === c.ownerId || !(await caseUserIn(c.department, input.toUserId))) errors.push(fieldError('toUserId', 'invalid_reference', 'Velg en annen mottaker.'));
        if (errors.length) throw validationError(errors);
        if (c.pendingHandoffToId) throw new ApiError(409, 'handoff_pending');
        if (!c.agreementDate) throw new ApiError(409, 'agreement_required');
        const handoff = { ...base(ctx), caseId: c.id, fromUserId: c.ownerId, toUserId: input.toUserId, state: 'pending', requestedAt: nowIso(), decidedAt: null };
        await tx.insert('handoffs', handoff);
        const saved = bump({ ...c, status: 'handover', pendingHandoffToId: handoff.toUserId });
        await tx.replace('cases', saved);
        await audit(tx, ctx, { operation: 'handoff.request', entityType: 'handoff', entityId: handoff.id, caseId: c.id, changedFields: ['handoff', ...(c.status === 'handover' ? [] : ['status'])] });
        return { body: await caseView(tx, saved), etag: etag(saved) };
      });
    },

    async confirmHandoff(ctx, caseId, handoffId, ifMatch) {
      return run(async tx => {
        const c = await loadActiveCase(tx, ctx, 'handoff.confirm', caseId, { entityType: 'handoff', entityId: isUuid(handoffId) ? handoffId : null });
        const handoff = isUuid(handoffId) ? await tx.get('handoffs', handoffId) : null;
        if (!handoff || handoff.caseId !== c.id) throw new ApiError(404, 'not_found');
        checkIfMatch(ifMatch, c);
        if (handoff.state !== 'pending') throw new ApiError(409, 'handoff_not_pending');
        // V-13: eier flyttes først nå. Åpen handling følger med hvis tidligere eier var ansvarlig.
        await tx.replace('handoffs', bump({ ...handoff, state: 'confirmed', decidedAt: nowIso() }));
        let assignee = c.openActionAssigneeId;
        for (const a of await tx.list('actions', { caseId: c.id })) {
          if (!a.completedAt && !a.closedAt && a.assigneeId === c.ownerId) { await tx.replace('actions', bump({ ...a, assigneeId: handoff.toUserId })); assignee = handoff.toUserId; }
        }
        const saved = bump({ ...c, ownerId: handoff.toUserId, openActionAssigneeId: assignee, pendingHandoffToId: null });
        await tx.replace('cases', saved);
        await audit(tx, ctx, { operation: 'handoff.confirm', entityType: 'handoff', entityId: handoff.id, caseId: c.id, changedFields: ['handoff', 'ownerId'] });
        return { body: await caseView(tx, saved), etag: etag(saved) };
      });
    },

    async reassignCase(ctx, caseId, ifMatch, body) {
      return run(async tx => {
        const c = await loadActiveCase(tx, ctx, 'case.reassign', caseId);
        checkIfMatch(ifMatch, c);
        const errors = [];
        const input = readObject(body, ['toUserId', 'reason'], '', errors);
        if (blank(input.reason)) errors.push(fieldError('reason', 'required'));
        if (blank(input.toUserId)) errors.push(fieldError('toUserId', 'required'));
        else if (input.toUserId === c.ownerId || !(await caseUserIn(c.department, input.toUserId))) errors.push(fieldError('toUserId', 'invalid_reference'));
        if (errors.length) throw validationError(errors);
        await closeOpenWork(tx, c, { closeAction: false });
        let assignee = c.openActionAssigneeId;
        for (const a of await tx.list('actions', { caseId: c.id })) {
          if (!a.completedAt && !a.closedAt && a.assigneeId === c.ownerId) { await tx.replace('actions', bump({ ...a, assigneeId: input.toUserId })); assignee = input.toUserId; }
        }
        const saved = bump({ ...c, ownerId: input.toUserId, openActionAssigneeId: assignee, pendingHandoffToId: null });
        await tx.replace('cases', saved);
        await audit(tx, ctx, { operation: 'case.reassign', entityType: 'case', entityId: c.id, caseId: c.id, changedFields: ['ownerId'], purpose: input.reason });
        return { body: await caseView(tx, saved), etag: etag(saved) };
      });
    },

    // Sakshistorikk: utdrag av revisjonsloggen for saken, uten oppslag, søk og avslag.
    async caseEvents(ctx, caseId) {
      return run(async tx => {
        const c = await loadCase(tx, ctx, 'case.read', caseId);
        const items = (await tx.listAudit({ caseId: c.id }))
          .filter(e => e.outcome === 'allowed' && !['case.read', 'case.search'].includes(e.operation))
          .map(e => ({ at: e.at, actorId: e.actorId, operation: e.operation, entityType: e.entityType, changedFields: e.changedFields }));
        await audit(tx, ctx, { operation: 'case.read', entityType: 'case', entityId: c.id, caseId: c.id, details: { part: 'events' } });
        return { body: { items } };
      });
    },

    // Bare antall per gruppe. Ingen totalsum, og små grupper undertrykkes (B-06).
    async aggregate(ctx, query) {
      requireAccess(ctx.principal, 'report.aggregate');
      const errors = Object.keys(query).filter(k => !['groupBy', 'from', 'to'].includes(k)).map(k => fieldError(k, 'unknown_field'));
      if (!AGGREGATE_DIMENSIONS.includes(query.groupBy)) errors.push(fieldError('groupBy', blank(query.groupBy) ? 'required' : 'invalid_enum'));
      for (const key of ['from', 'to']) if (!blank(query[key]) && !validDate(query[key])) errors.push(fieldError(key, 'invalid_date'));
      if (errors.length) throw validationError(errors);
      return run(async tx => {
        const counts = new Map();
        for (const c of await tx.listCases(scopeClauses(ctx.principal, 'report.aggregate'))) {
          const created = dateInOslo(new Date(c.createdAt));
          if ((query.from && created < query.from) || (query.to && created > query.to)) continue;
          counts.set(c[query.groupBy], (counts.get(c[query.groupBy]) || 0) + 1);
        }
        const minCell = config.aggregateMinCell;
        const groups = [...counts].sort(([a], [b]) => String(a).localeCompare(String(b)))
          .map(([key, count]) => (count < minCell ? { key, count: null, suppressed: true } : { key, count, suppressed: false }));
        await audit(tx, ctx, { operation: 'report.aggregate', details: { groupBy: query.groupBy } });
        return { body: { groupBy: query.groupBy, from: query.from || null, to: query.to || null, minCell, groups } };
      });
    },

    async exportCases(ctx, body) {
      requireAccess(ctx.principal, 'case.export');
      const errors = [];
      const input = readObject(body, ['purpose'], '', errors);
      if (blank(input.purpose)) errors.push(fieldError('purpose', 'required'));
      if (errors.length) throw validationError(errors);
      return run(async tx => {
        const items = [];
        for (const c of await tx.listCases(scopeClauses(ctx.principal, 'case.export'))) items.push(await caseView(tx, c));
        await audit(tx, ctx, { operation: 'case.export', purpose: input.purpose, details: { count: items.length } });
        return { body: { exportedAt: nowIso(), purpose: input.purpose, total: items.length, items } };
      });
    },

    async auditEvents(ctx, query) {
      requireAccess(ctx.principal, 'audit.read');
      const allowed = ['caseId', 'actorId', 'operation', 'outcome', 'limit', 'cursor'];
      const errors = Object.keys(query).filter(k => !allowed.includes(k)).map(k => fieldError(k, 'unknown_field'));
      const limit = query.limit === undefined ? 100 : Number(query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 500) errors.push(fieldError('limit', 'invalid_type'));
      const offset = query.cursor === undefined ? 0 : Number(query.cursor);
      if (!Number.isInteger(offset) || offset < 0) errors.push(fieldError('cursor', 'invalid_type'));
      if (errors.length) throw validationError(errors);
      return run(async tx => {
        const all = await tx.listAudit({ caseId: query.caseId, actorId: query.actorId, operation: query.operation, outcome: query.outcome });
        await audit(tx, ctx, { operation: 'audit.read' });
        return { body: { items: all.slice(offset, offset + limit), total: all.length, nextCursor: offset + limit < all.length ? String(offset + limit) : null } };
      });
    },

    // Teknisk oppsett uten saks- eller persondata.
    async adminConfig(ctx) {
      requireAccess(ctx.principal, 'admin.config');
      return run(async tx => {
        await audit(tx, ctx, { operation: 'admin.config' });
        return { body: { profile: config.profile, adapters: { repository: repository.kind, identity: config.identityKind }, settings: { aggregateMinCell: config.aggregateMinCell, sessionTtlSeconds: config.sessionTtlSeconds, intakeRateLimitPerMinute: config.intakeRateLimitPerMinute }, codebook: CODEBOOK } };
      });
    },

    // Idempotent inntak, docs/backend-contract.md kapittel 7.
    async submitIntake(ctx, idempotencyKey, payload) {
      requireAccess(ctx.principal, 'intake.submit');
      if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9-]{16,128}$/.test(idempotencyKey)) throw new ApiError(400, 'idempotency_key_required');
      const errors = [];
      const input = readObject(payload, INTAKE_FIELDS, '', errors);
      if (blank(input.name)) errors.push(fieldError('name', 'required'));
      if (!blank(input.email) && !EMAIL.test(input.email)) errors.push(fieldError('email', 'invalid_email'));
      if (blank(normText(input.email)) && blank(normPhone(input.phone))) errors.push(fieldError('email', 'required', 'Oppgi e-post eller telefon.'));
      if (errors.length) throw validationError(errors);
      const fingerprint = JSON.stringify(INTAKE_FIELDS.map(key => [key, input[key] ?? '']));
      return run(async tx => {
        const earlier = await tx.getIdempotencyRecord(idempotencyKey);
        if (earlier) {
          if (earlier.fingerprint !== fingerprint) throw new ApiError(422, 'idempotency_key_reused');
          return { status: 202, body: earlier.body, replayed: true };
        }
        // Mulig dublett merkes internt. Svaret til avsender er likt uansett.
        const email = normText(input.email), phone = normPhone(input.phone);
        const earlierSubmissions = await tx.list('intakeSubmissions');
        const inSubmissions = earlierSubmissions.some(s => (email && s.emailNormalized === email) || (phone && s.phoneNormalized === phone));
        const inCases = (await tx.findDuplicateCases({ email, phone, name: '', municipality: '', excludeCaseId: null })).length > 0;
        const submission = {
          ...base(ctx), name: input.name, email: input.email || '', phone: input.phone || '', municipality: input.municipality || '',
          emailNormalized: email, phoneNormalized: phone, state: inSubmissions || inCases ? 'possible_duplicate' : 'received', receivedAt: nowIso(),
        };
        await tx.insert('intakeSubmissions', submission);
        const body = { submissionId: submission.id };
        await tx.putIdempotencyRecord(idempotencyKey, { fingerprint, body, storedAt: nowIso() });
        await audit(tx, ctx, { operation: 'intake.submit', entityType: 'intake_submission', entityId: submission.id });
        return { status: 202, body, replayed: false };
      });
    },

    async getCase(ctx, caseId) {
      return run(async tx => {
        const c = await loadCase(tx, ctx, 'case.read', caseId);
        await audit(tx, ctx, { operation: 'case.read', entityType: 'case', entityId: c.id, caseId: c.id });
        return { body: await caseView(tx, c), etag: etag(c) };
      });
    },

    async searchCases(ctx, query) {
      requireAccess(ctx.principal, 'case.search');
      const allowed = ['q', 'status', 'bpa', 'source', 'ownerId', 'limit', 'cursor'];
      const errors = Object.keys(query).filter(k => !allowed.includes(k)).map(k => fieldError(k, 'unknown_field'));
      for (const key of ['status', 'bpa', 'source']) if (query[key] && !CODEBOOK[key].includes(query[key])) errors.push(fieldError(key, 'invalid_enum'));
      const limit = query.limit === undefined ? 50 : Number(query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) errors.push(fieldError('limit', 'invalid_type'));
      let offset = 0;
      if (query.cursor) {
        try { offset = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')).offset; } catch { offset = -1; }
        if (!Number.isInteger(offset) || offset < 0) errors.push(fieldError('cursor', 'invalid_type'));
      }
      if (errors.length) throw validationError(errors);
      return run(async tx => {
        const q = normText(query.q);
        const views = [];
        // Bare saker i omfanget hentes. Søketeksten brukes etterpå, og treff telles bare blant disse.
        for (const c of await tx.listCases(scopeClauses(ctx.principal, 'case.search'))) {
          if (query.status && c.status !== query.status) continue;
          if (query.bpa && c.bpa !== query.bpa) continue;
          if (query.source && c.source !== query.source) continue;
          if (query.ownerId && c.ownerId !== query.ownerId) continue;
          const view = await caseView(tx, c);
          if (q) {
            const haystack = [view.name, view.municipality, view.openAction?.description, ...view.contacts.map(k => k.displayName)].join(' ').toLowerCase();
            if (!haystack.includes(q)) continue;
          }
          views.push(view);
        }
        views.sort((a, b) => (a.openAction?.dueDate || '9999').localeCompare(b.openAction?.dueDate || '9999') || a.id.localeCompare(b.id));
        const items = views.slice(offset, offset + limit);
        const nextCursor = offset + limit < views.length ? Buffer.from(JSON.stringify({ offset: offset + limit })).toString('base64url') : null;
        // Søketeksten logges ikke (B-10). Bare hvilke filtre som ble brukt og antall treff.
        await audit(tx, ctx, { operation: 'case.search', details: { filters: Object.keys(query).filter(k => k !== 'cursor' && k !== 'limit').sort(), count: views.length } });
        return { body: { items, total: views.length, nextCursor } };
      });
    },
  };
}
