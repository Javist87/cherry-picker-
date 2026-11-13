// KUN FOR UTVIKLING OG TEST. Dette er ikke innlogging. Hvem som helst som når serveren kan velge
// en testbruker uten passord. Adapteren nekter å starte i produksjonsprofil, og serveren binder
// bare til localhost i utviklings- og testprofil.
import { randomBytes } from 'node:crypto';

const user = (id, displayName, roles, departments = [], teams = []) => ({ id, displayName, roles, departments, teams });

// Fiktive testbrukere, én eller flere per rolle. Ingen av dem er personer.
export const DEV_USERS = [
  user('00000000-0000-4000-8000-000000000001', 'Test Selger A', ['selger'], ['trondelag'], ['trondelag-1']),
  user('00000000-0000-4000-8000-000000000002', 'Test Selger B', ['selger'], ['trondelag'], ['trondelag-1']),
  user('00000000-0000-4000-8000-000000000003', 'Test Selger C', ['selger'], ['trondelag'], ['trondelag-2']),
  user('00000000-0000-4000-8000-000000000004', 'Test Selger V', ['selger'], ['vestland'], ['vestland-1']),
  user('00000000-0000-4000-8000-000000000005', 'Test Teamleder T1', ['teamleder'], ['trondelag'], ['trondelag-1']),
  user('00000000-0000-4000-8000-000000000006', 'Test Avdelingsleder Trøndelag', ['avdelingsleder'], ['trondelag']),
  user('00000000-0000-4000-8000-000000000007', 'Test Avdelingsleder Vestland', ['avdelingsleder'], ['vestland']),
  user('00000000-0000-4000-8000-000000000008', 'Test Leder', ['leder']),
  user('00000000-0000-4000-8000-000000000009', 'Test Teknisk administrator', ['teknisk_admin']),
  user('00000000-0000-4000-8000-00000000000a', 'Test Revisor', ['revisor']),
  user('00000000-0000-4000-8000-00000000000b', 'Tjenestekonto inntak (test)', ['inntak']),
  user('00000000-0000-4000-8000-00000000000c', 'Test Uten rolle', []),
];

export const DEV_COOKIE = 'cp_dev_session';
const copy = u => (u ? { id: u.id, displayName: u.displayName, roles: [...u.roles], departments: [...u.departments], teams: [...u.teams] } : null);

function readJson(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', chunk => { size += chunk.length; if (size > limit) { reject(new Error('for stor')); req.destroy(); } else chunks.push(chunk); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

export function createDevIdentity({ profile, clock, sessionTtlSeconds = 8 * 60 * 60, users = DEV_USERS } = {}) {
  if (profile === 'production') throw new Error('dev-identitet kan ikke brukes i produksjonsprofil.');
  if (!clock) throw new Error('dev-identitet krever en klokke.');
  const directory = new Map(users.map(u => [u.id, copy(u)]));
  const sessions = new Map(); // token -> { userId, expiresAt }

  const tokenFrom = req => {
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
    for (const part of (req.headers.cookie || '').split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name === DEV_COOKIE) return rest.join('=');
    }
    return null;
  };
  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
    res.end(JSON.stringify(body));
  };

  const identity = {
    kind: 'dev',
    devOnly: true,
    // Sesjonen valideres ved hvert kall, og roller hentes fra katalogen hver gang.
    // Endret rolle virker derfor fra neste forespørsel. Utløpt eller ukjent sesjon gir null (401).
    async authenticate(req) {
      const token = tokenFrom(req);
      const session = token && sessions.get(token);
      if (!session) return null;
      if (session.expiresAt <= clock.now().getTime()) { sessions.delete(token); return null; }
      return copy(directory.get(session.userId));
    },
    handles: pathname => pathname.startsWith('/dev/'),
    async handle(req, res, url) {
      if (req.method === 'GET' && url.pathname === '/dev/users') {
        return send(res, 200, { warning: 'Testbrukere uten passord. Kun utvikling og test.', users: [...directory.values()].map(copy) });
      }
      if (req.method === 'POST' && url.pathname === '/dev/login') {
        // Krav om JSON hindrer at et skjema på en annen nettside kan logge inn uten forhåndssjekk (CORS).
        if (!(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 415, { code: 'unsupported_media_type' });
        let body; try { body = await readJson(req); } catch { return send(res, 400, { code: 'malformed_request' }); }
        if (!directory.has(body?.userId)) return send(res, 422, { code: 'validation_failed', errors: [{ field: 'userId', code: 'invalid_reference' }] });
        const token = randomBytes(32).toString('base64url');
        sessions.set(token, { userId: body.userId, expiresAt: clock.now().getTime() + sessionTtlSeconds * 1000 });
        return send(res, 200, { token, user: copy(directory.get(body.userId)) }, { 'Set-Cookie': `${DEV_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionTtlSeconds}` });
      }
      if (req.method === 'POST' && url.pathname === '/dev/logout') {
        const token = tokenFrom(req); if (token) sessions.delete(token);
        return send(res, 200, { ok: true }, { 'Set-Cookie': `${DEV_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` });
      }
      return send(res, 404, { code: 'not_found' });
    },
    directory: {
      getUser: async id => copy(directory.get(id)),
      listUsers: async () => [...directory.values()].map(copy),
    },
    // Testhjelpere. Finnes bare på dev-adapteren.
    dev: {
      setUser(u) { directory.set(u.id, copy({ displayName: u.id, roles: [], departments: [], teams: [], ...u })); },
      login(userId) {
        const token = randomBytes(32).toString('base64url');
        sessions.set(token, { userId, expiresAt: clock.now().getTime() + sessionTtlSeconds * 1000 });
        return token;
      },
    },
  };
  return identity;
}
