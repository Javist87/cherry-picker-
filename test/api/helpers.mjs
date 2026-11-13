// Felles oppsett for tester som kjører mot det faktiske API-et over HTTP.
// Serveren startes på en ledig port på localhost med utviklingsadaptere. Bare fiktive data.
import http from 'node:http';
import { loadConfig } from '../../server/config.mjs';
import { createApplication } from '../../server/bootstrap.mjs';
import { createDevMemoryRepository } from '../../server/adapters/dev-memory-repository.mjs';
import { createDevIdentity } from '../../server/adapters/dev-identity.mjs';
import { dateInOslo } from '../../server/clock.mjs';

const uid = n => '10000000-0000-4000-8000-' + String(n).padStart(12, '0');
const user = (n, displayName, roles, departments = [], teams = []) => ({ id: uid(n), displayName, roles, departments, teams });

// Testbrukere per rolle. Samme oppsett som i test/contract.test.mjs.
export const USERS = {
  selgerA: user(1, 'Test Selger A', ['selger'], ['trondelag'], ['trondelag-1']),
  selgerB: user(2, 'Test Selger B', ['selger'], ['trondelag'], ['trondelag-1']),
  selgerC: user(3, 'Test Selger C', ['selger'], ['trondelag'], ['trondelag-2']),
  selgerV: user(4, 'Test Selger V', ['selger'], ['vestland'], ['vestland-1']),
  teamlederT1: user(5, 'Test Teamleder T1', ['teamleder'], ['trondelag'], ['trondelag-1']),
  avdelingslederT: user(6, 'Test Avdelingsleder Trøndelag', ['avdelingsleder'], ['trondelag']),
  avdelingslederV: user(7, 'Test Avdelingsleder Vestland', ['avdelingsleder'], ['vestland']),
  leder: user(8, 'Test Leder', ['leder']),
  admin: user(9, 'Test Teknisk administrator', ['teknisk_admin']),
  revisor: user(10, 'Test Revisor', ['revisor']),
  inntak: user(11, 'Tjenestekonto inntak (test)', ['inntak']),
  utenRolle: user(12, 'Test Uten rolle', []),
  kombinert: user(13, 'Test Selger og leder', ['selger', 'leder'], ['trondelag'], ['trondelag-1']),
};

export function createTestClock(start = new Date()) {
  let now = start.getTime();
  return { now: () => new Date(now), advance(ms) { now += ms; } };
}

export async function startServer({ env = {}, clock = createTestClock() } = {}) {
  const config = loadConfig({ APP_PROFILE: 'test', ...env });
  const repository = createDevMemoryRepository({ profile: config.profile });
  const identity = createDevIdentity({ profile: config.profile, clock, sessionTtlSeconds: config.sessionTtlSeconds, users: Object.values(USERS) });
  const { app, service } = createApplication(config, { clock, adapters: { repository, identity } });
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;

  // Klient for én bruker. token === null betyr uten sesjon.
  const client = token => {
    const request = async (method, path, { body, ifMatch, headers = {} } = {}) => {
      const response = await fetch(url + (path.startsWith('/dev/') ? path : '/api/v1' + path), {
        method,
        headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(ifMatch ? { 'If-Match': ifMatch } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* ikke JSON */ }
      return { status: response.status, body: json, text, headers: response.headers, etag: response.headers.get('etag') };
    };
    return {
      get: (path, options) => request('GET', path, options),
      post: (path, body = {}, options = {}) => request('POST', path, { body, ...options }),
      patch: (path, body, options = {}) => request('PATCH', path, { body, ...options }),
      request,
    };
  };
  const as = u => client(identity.dev.login(u.id));

  return {
    url, clock, config, repository, identity, service, as, anonymous: client(null), client,
    today: () => dateInOslo(clock.now()),
    offset(days) { const d = new Date(dateInOslo(clock.now()) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); },
    auditEvents: filter => repository.transaction(tx => tx.listAudit(filter)),
    close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }),
  };
}

let sequence = 0;
// Gyldig sak med unikt navn og unik e-post, slik at dublettkontrollen ikke slår inn utilsiktet.
export function caseBody(t, owner, overrides = {}) {
  sequence += 1;
  return {
    name: 'Eksempelsak T' + sequence, municipality: 'Trondheim', department: owner.departments[0], team: owner.teams[0],
    ownerId: owner.id, source: 'website',
    contact: { displayName: 'Eksempelkontakt ' + sequence, email: `test${sequence}@example.invalid` },
    action: { description: 'Ring eksempelkontakt', dueDate: t.today() },
    ...overrides,
  };
}

export async function createCase(t, owner, overrides = {}) {
  const response = await t.as(owner).post('/cases', caseBody(t, owner, overrides));
  if (response.status !== 201) throw new Error('Kunne ikke opprette testsak: ' + response.text);
  return { ...response.body, etag: response.etag };
}

export const randomId = () => crypto.randomUUID();
