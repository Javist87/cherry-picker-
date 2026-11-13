// API-datakilde: alt hentes fra og lagres på server. Ingenting skrives til sessionStorage eller localStorage.
// Tilgang avgjøres av serveren. Det klienten skjuler er bare brukerstøtte.
const API = './api/v1';
const LABELS = {
  status: { new: 'Ny', dialog: 'Dialog', on_hold: 'Avventer', handover: 'Oppstartsoverlevering', closed: 'Avsluttet' },
  bpa: { unclear: 'Uavklart', application: 'Søknad', awaiting_decision: 'Venter på vedtak', decision_made: 'Vedtak foreligger', provider_change: 'Leverandørbytte' },
  source: { website: 'Nettside', email: 'E-post', phone: 'Telefon', fair: 'Messe', referral: 'Anbefaling' },
  handoff: { pending: 'Venter på bekreftelse', confirmed: 'Bekreftet', cancelled: 'Trukket', declined: 'Avslått' },
};
const FIELD_LABELS = { name: 'Saksnavn', municipality: 'Kommune', department: 'Avdeling', team: 'Team', ownerId: 'Ansvarlig', status: 'Kontaktløp', bpa: 'BPA-prosess', source: 'Kilde', reason: 'Årsak', agreementDate: 'Avtale inngått', startDate: 'Faktisk oppstart', 'action.dueDate': 'Frist', 'action.assigneeId': 'Ansvarlig for handling', 'contact.email': 'E-post', 'contact.displayName': 'Kontaktperson', toUserId: 'Mottaker', next: 'Neste steg' };
const EVENT_TEXT = { 'case.create': 'Henvendelse registrert', 'case.update': 'Sak oppdatert', 'action.complete': 'Oppfølging fullført, nytt steg avtalt', 'handoff.request': 'Overlevering forespurt', 'handoff.confirm': 'Overlevering bekreftet', 'case.reassign': 'Eierskifte gjennomført' };
const code = (kind, label) => Object.entries(LABELS[kind]).find(([, text]) => text === label)?.[0] ?? label;
const osloDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' });

class ApiProblem extends Error {
  constructor(status, problem) { super(describe(status, problem)); this.status = status; this.code = problem?.code; }
}
function describe(status, p) {
  if (!p) return 'Serveren svarte ikke som forventet (' + status + ').';
  if (p.code === 'validation_failed') return (p.errors || []).map(e => (FIELD_LABELS[e.field] ? FIELD_LABELS[e.field] + ': ' : '') + e.message).join(' ');
  if (p.code === 'possible_duplicate') {
    const names = (p.matches || []).map(m => m.name).join(', ');
    return 'Mulig dublett' + (names ? ': ' + names + '.' : '.') + (p.outsideScope ? ' Det finnes et mulig treff utenfor ditt omfang.' : '') + ' Kontroller eksisterende sak, eller be teamleder vurdere saken.';
  }
  if (p.code === 'precondition_failed') return 'Saken er endret av andre siden du åpnet den. Åpne saken på nytt og kontroller før du lagrer.';
  if (p.code === 'unauthenticated') return 'Sesjonen er utløpt. Last siden på nytt.';
  return p.title || 'Forespørselen ble avvist.';
}

async function call(method, path, { body, ifMatch, base = API } = {}) {
  const response = await fetch(base + path, {
    method, credentials: 'same-origin', cache: 'no-store',
    headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(ifMatch ? { 'If-Match': ifMatch } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null; try { json = await response.json(); } catch { /* tomt svar */ }
  if (!response.ok) throw new ApiProblem(response.status, json);
  return json;
}

// Fra API-ets normaliserte sak til det flate sakskortet arbeidsflaten viser.
function flatten(c) {
  const contact = c.contacts.find(k => k.primary) || c.contacts[0] || null;
  const h = c.lastHandoff;
  return {
    id: c.id, name: c.name, municipality: c.municipality, department: c.department, team: c.team,
    owner: c.ownerId || '', assignee: c.openAction?.assigneeId || '',
    status: LABELS.status[c.status] || c.status, bpa: LABELS.bpa[c.bpa] || c.bpa, source: LABELS.source[c.source] || c.source,
    contact: contact?.displayName || '', email: contact?.email || '', phone: contact?.phone || '',
    nextAction: c.openAction?.description || '', due: c.openAction?.dueDate || '',
    reason: c.reason || '', agreementDate: c.agreementDate || '', startDate: c.startDate || '',
    createdAt: osloDate.format(new Date(c.createdAt)),
    handoff: h ? { from: h.fromUserId, to: h.toUserId, state: LABELS.handoff[h.state] || h.state } : null,
    completedActions: c.completedActions,
    _etag: '"' + c.revision + '"', _actionId: c.openAction?.id || null, _handoffId: c.pendingHandoff?.id || null,
  };
}

export function createApiSource() {
  let me = null, byId = new Map(), names = new Map();
  const find = id => byId.get(id);
  const source = {
    mode: 'api',
    warning: '',
    async init() {
      let actors = [];
      try { actors = (await call('GET', '/dev/users', { base: '.' })).users.map(u => ({ id: u.id, name: u.displayName })); } catch { /* ingen utviklingsinnlogging */ }
      try { me = await call('GET', '/me'); }
      catch (error) {
        if (error.status !== 401 || !actors.length) throw new Error('Innlogging er ikke konfigurert for dette miljøet.');
        // Bare med utviklingsadapteren: velg første testbruker. Dette er ikke innlogging.
        await call('POST', '/dev/login', { base: '.', body: { userId: actors[0].id } });
        me = await call('GET', '/me');
      }
      const can = op => me.operations.includes(op);
      let users = [];
      if (can('directory.read')) users = (await call('GET', '/users')).items.map(u => ({ id: u.id, name: u.displayName }));
      names = new Map([...actors, ...users].map(u => [u.id, u.name]));
      return {
        actor: me.user.id, users, actors: actors.length ? actors : [{ id: me.user.id, name: me.user.displayName }],
        org: { departments: me.codebook.departments, defaults: { department: me.user.departments[0] || '', team: me.user.teams[0] || '' } },
        caps: { cases: can('case.search'), create: can('case.create'), aggregate: can('report.aggregate') },
        texts: {
          saved: 'Saken er lagret på serveren.',
          handoffSent: 'Overlevering sendt. Ansvar flyttes når mottaker bekrefter.',
          reportScope: 'Saker i ditt omfang.',
          actorNote: 'Bytt testbruker øverst for å prøve mottak av overlevering. Tilgang avgjøres av serveren for hver testbruker.',
          banner: me.identityKind === 'dev'
            ? 'Utviklingsmodus med fiktive data på server. Testinnlogging uten passord og lagring i minnet. Ikke registrer reelle personopplysninger.'
            : 'Testmiljø. Ikke registrer reelle personopplysninger før løsningen er godkjent.',
          footer: 'Fiktive data lagres i serverens minne og forsvinner ved omstart.',
          actorLabel: me.identityKind === 'dev' ? 'Testbruker (uten passord)' : 'Innlogget',
        },
      };
    },
    async setActor(id) { await call('POST', '/dev/login', { base: '.', body: { userId: id } }); },
    async list() {
      const all = []; let cursor = null;
      do {
        const page = await call('GET', '/cases?limit=200' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
        all.push(...page.items); cursor = page.nextCursor;
      } while (cursor);
      const flat = all.map(flatten);
      byId = new Map(flat.map(c => [c.id, c]));
      return flat;
    },
    async history(id) {
      const { items } = await call('GET', `/cases/${id}/events`);
      return items.map(e => ({ at: e.at, text: (EVENT_TEXT[e.operation] || e.operation) + (names.get(e.actorId) ? ' · ' + names.get(e.actorId) : '') + (e.operation === 'case.update' && e.changedFields.length ? ' · felt: ' + e.changedFields.join(', ') : '') }));
    },
    async save(d) {
      const existing = d.id ? find(d.id) : null;
      const body = {
        name: d.name, municipality: d.municipality, department: d.department, team: d.team,
        status: code('status', d.status), bpa: code('bpa', d.bpa), source: code('source', d.source),
        reason: d.reason || '', agreementDate: d.agreementDate || '', startDate: d.startDate || '',
      };
      if (d.contact || d.email || d.phone || existing?.contact) body.contact = { displayName: d.contact || 'Ikke oppgitt', email: d.email || '', phone: d.phone || '' };
      if (body.status !== 'closed') body.action = { description: d.nextAction || '', dueDate: d.due || '' };
      if (existing) await call('PATCH', '/cases/' + d.id, { body, ifMatch: existing._etag });
      else await call('POST', '/cases', { body: { ...body, ownerId: d.owner } });
    },
    async completeFollowup(id, { nextAction, due }) {
      const c = find(id);
      await call('POST', `/cases/${id}/actions/${c._actionId}/complete`, { body: { next: { description: nextAction, dueDate: due } }, ifMatch: c._etag });
    },
    async requestHandoff(id, recipient) { await call('POST', `/cases/${id}/handoffs`, { body: { toUserId: recipient }, ifMatch: find(id)._etag }); },
    async acceptHandoff(id) { const c = find(id); await call('POST', `/cases/${id}/handoffs/${c._handoffId}/confirm`, { body: {}, ifMatch: c._etag }); },
    async aggregate({ groupBy, from, to }) {
      const params = new URLSearchParams({ groupBy }); if (from) params.set('from', from); if (to) params.set('to', to);
      const result = await call('GET', '/reports/aggregate?' + params);
      const label = key => LABELS[groupBy]?.[key] || me.codebook.departments.flatMap(d => [d, ...d.teams]).find(x => x.code === key)?.label || key;
      return { ...result, groups: result.groups.map(g => ({ ...g, label: label(g.key) })) };
    },
  };
  return source;
}
