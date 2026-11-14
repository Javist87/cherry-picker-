// HTTP-laget: ruting, autentisering via identitetsporten, feilformat og logging uten persondata.
import { randomUUID } from 'node:crypto';
import { ApiError, problemBody } from './errors.mjs';
import { isUuid } from './service.mjs';

const API = '/api/v1';
const JSON_TYPE = 'application/json; charset=utf-8';
const PROBLEM_TYPE = 'application/problem+json; charset=utf-8';
const BASE_HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };

// [metode, sti, operasjon, behandler]. Operasjonen brukes også til å loggføre avslag uten sesjon.
function routes(service) {
  const ok = (result, status = 200) => ({ status, body: result.body, headers: result.etag ? { ETag: result.etag } : {} });
  return [
    ['GET', '/me', null, r => service.me(r.ctx).then(body => ({ status: 200, body }))],
    ['GET', '/users', 'directory.read', r => service.listUsers(r.ctx).then(body => ({ status: 200, body }))],
    ['GET', '/cases', 'case.search', r => service.searchCases(r.ctx, r.query).then(ok)],
    ['POST', '/cases', 'case.create', async r => {
      const result = await service.createCase(r.ctx, r.body);
      return { status: 201, body: result.body, headers: { ETag: result.etag, Location: `${API}/cases/${result.body.id}` } };
    }],
    ['GET', '/cases/:caseId', 'case.read', r => service.getCase(r.ctx, r.params.caseId).then(ok)],
    ['PATCH', '/cases/:caseId', 'case.update', r => service.updateCase(r.ctx, r.params.caseId, r.ifMatch, r.body).then(ok)],
    ['POST', '/cases/:caseId/actions/:actionId/complete', 'action.complete', r => service.completeAction(r.ctx, r.params.caseId, r.params.actionId, r.ifMatch, r.body).then(ok)],
    ['POST', '/cases/:caseId/handoffs', 'handoff.request', r => service.requestHandoff(r.ctx, r.params.caseId, r.ifMatch, r.body).then(result => ok(result, 201))],
    ['POST', '/cases/:caseId/handoffs/:handoffId/confirm', 'handoff.confirm', r => service.confirmHandoff(r.ctx, r.params.caseId, r.params.handoffId, r.ifMatch).then(ok)],
    ['POST', '/cases/:caseId/activities', 'activity.create', r => service.logActivity(r.ctx, r.params.caseId, r.ifMatch, r.body).then(result => ok(result, 201))],
    ['POST', '/cases/:caseId/reassign', 'case.reassign', r => service.reassignCase(r.ctx, r.params.caseId, r.ifMatch, r.body).then(ok)],
    ['GET', '/cases/:caseId/events', 'case.read', r => service.caseEvents(r.ctx, r.params.caseId).then(ok)],
    ['GET', '/reports/aggregate', 'report.aggregate', r => service.aggregate(r.ctx, r.query).then(ok)],
    ['POST', '/exports', 'case.export', r => service.exportCases(r.ctx, r.body).then(ok)],
    ['GET', '/audit-events', 'audit.read', r => service.auditEvents(r.ctx, r.query).then(ok)],
    ['GET', '/admin/config', 'admin.config', r => service.adminConfig(r.ctx).then(ok)],
    ['POST', '/intake/web-form', 'intake.submit', async r => {
      const result = await service.submitIntake(r.ctx, r.headers['idempotency-key'], r.body);
      return { status: result.status, body: result.body, headers: result.replayed ? { 'Idempotent-Replayed': 'true' } : {} };
    }],
  ].map(([method, path, operation, handler]) => {
    const names = [];
    const pattern = new RegExp('^' + path.replace(/:([A-Za-z]+)/g, (_, name) => { names.push(name); return '([^/]+)'; }) + '$');
    return { method, path, operation, handler, pattern, names };
  });
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) { reject(new ApiError(413, 'payload_too_large')); req.resume(); } else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => reject(new ApiError(400, 'malformed_request')));
  });
}

// Enkel ratebegrensning per aktør og minutt for inntak. Holdes i minnet. En løsning med flere
// instanser må flytte dette til felles lager eller til plattformen foran (B-01).
function createRateLimiter(limitPerMinute, clock) {
  const windows = new Map();
  return key => {
    const now = clock.now().getTime();
    const windowStart = Math.floor(now / 60000) * 60000;
    const entry = windows.get(key);
    if (!entry || entry.windowStart !== windowStart) { windows.set(key, { windowStart, count: 1 }); return null; }
    entry.count += 1;
    return entry.count > limitPerMinute ? Math.max(1, Math.ceil((windowStart + 60000 - now) / 1000)) : null;
  };
}

export function createApp({ service, identity, config, clock, staticHandler = null, log = () => {} }) {
  const table = routes(service);
  const intakeLimiter = createRateLimiter(config.intakeRateLimitPerMinute, clock);

  function send(res, status, body, headers, requestId, type = JSON_TYPE) {
    res.writeHead(status, { ...BASE_HEADERS, 'Content-Type': type, 'X-Request-Id': requestId, ...headers });
    res.end(body === undefined ? '' : JSON.stringify(body));
  }

  async function handleApi(req, res, url, requestId) {
    const path = url.pathname.slice(API.length) || '/';
    const candidates = table.filter(r => r.pattern.test(path));
    const route = candidates.find(r => r.method === req.method) || null;
    let routeLabel = route?.path || 'ukjent';
    let principal = null;
    try {
      principal = await identity.authenticate(req);
      const ctx = { principal, requestId };
      if (!principal) {
        throw new ApiError(401, 'unauthenticated').withDenial(route?.operation ? { operation: route.operation, entityType: null, entityId: null, caseId: null } : null);
      }
      if (!route) {
        if (candidates.length) throw new ApiError(405, 'method_not_allowed').withHeaders({ Allow: [...new Set(candidates.map(r => r.method))].join(', ') });
        throw new ApiError(404, 'not_found');
      }
      const unsafe = req.method !== 'GET';
      if (unsafe) {
        // Vern mot forfalskede forespørsler på tvers av nettsteder når sesjonen ligger i informasjonskapsel.
        const origin = req.headers.origin;
        let originHost = null;
        try { originHost = origin ? new URL(origin).host : null; } catch { originHost = ''; }
        if (origin && originHost !== req.headers.host) throw new ApiError(403, 'forbidden_origin');
        if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw new ApiError(415, 'unsupported_media_type');
      }
      if (route.operation === 'intake.submit') {
        const retryAfter = intakeLimiter(principal.id);
        if (retryAfter) throw new ApiError(429, 'rate_limited').withHeaders({ 'Retry-After': String(retryAfter) });
      }
      let body;
      if (unsafe) {
        const raw = await readBody(req, config.maxBodyBytes);
        try { body = raw.trim() ? JSON.parse(raw) : {}; } catch { throw new ApiError(400, 'malformed_request'); }
      }
      const params = {};
      const match = route.pattern.exec(path);
      try { route.names.forEach((name, i) => { params[name] = decodeURIComponent(match[i + 1]); }); }
      catch { throw new ApiError(404, 'not_found'); }
      const query = {};
      for (const [key, value] of url.searchParams) query[key] = value;
      const result = await route.handler({ ctx, params, query, body, headers: req.headers, ifMatch: req.headers['if-match'] });
      send(res, result.status, result.body, result.headers || {}, requestId);
      return { status: result.status, route: routeLabel };
    } catch (caught) {
      const error = caught instanceof ApiError ? caught : new ApiError(500, 'internal_error');
      if (!(caught instanceof ApiError)) log({ level: 'error', requestId, route: routeLabel, error: caught?.name || 'Error' });
      if (error.denial) {
        const d = error.denial;
        try {
          await service.recordDenial({ principal, requestId }, { operation: d.operation, code: error.code, entityType: d.entityType, entityId: isUuid(d.entityId) ? d.entityId : null, caseId: d.caseId });
        } catch { log({ level: 'error', requestId, route: routeLabel, error: 'audit_write_failed' }); }
      }
      send(res, error.status, problemBody(error, requestId), error.headers, requestId, PROBLEM_TYPE);
      return { status: error.status, route: routeLabel };
    }
  }

  return async function app(req, res) {
    const requestId = randomUUID();
    const started = clock.now().getTime();
    let outcome = { status: 500, route: 'ukjent' };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === API || url.pathname.startsWith(API + '/')) outcome = await handleApi(req, res, url, requestId);
      else if (identity.handles(url.pathname)) { await identity.handle(req, res, url); outcome = { status: res.statusCode, route: 'identitet' }; }
      else if (staticHandler) outcome = { status: await staticHandler(req, res, url), route: 'statisk' };
      else { send(res, 404, problemBody(new ApiError(404, 'not_found'), requestId), {}, requestId, PROBLEM_TYPE); outcome = { status: 404, route: 'ukjent' }; }
    } catch {
      if (!res.headersSent) send(res, 500, problemBody(new ApiError(500, 'internal_error'), requestId), {}, requestId, PROBLEM_TYPE);
      else res.end();
    }
    // Loggen inneholder rutemønster, ikke faktisk sti, spørring, innhold eller brukeridentitet.
    log({ level: 'info', requestId, method: req.method, route: outcome.route, status: outcome.status, ms: clock.now().getTime() - started });
  };
}
