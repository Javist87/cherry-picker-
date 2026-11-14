// Oppstart av API-serveren. Kjører i dag bare med utviklingsadaptere og fiktive data.
import http from 'node:http';
import { loadConfig } from './config.mjs';
import { createApplication } from './bootstrap.mjs';
import { createStaticHandler } from './static.mjs';
import { systemClock } from './clock.mjs';
import { seedDevData } from './dev-seed.mjs';

const config = loadConfig();
const log = config.requestLog ? entry => console.log(JSON.stringify({ at: new Date().toISOString(), ...entry })) : () => {};
const { app, service, repository, identity } = createApplication(config, { clock: systemClock, staticHandler: createStaticHandler({ dataSource: 'api' }), log });

if (config.profile === 'development' && process.env.DEV_SEED !== 'off') await seedDevData(service, systemClock);

// Nullstilling av demodata. Finnes bare i utviklingsprofil med minnelagring.
const canReset = config.profile === 'development' && typeof repository.dev?.reset === 'function';
async function handler(req, res) {
  if (canReset && req.method === 'POST' && req.url === '/dev/reset') {
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(415, { code: 'unsupported_media_type' });
    req.resume();
    await repository.dev.reset();
    if (process.env.DEV_SEED !== 'off') await seedDevData(service, systemClock);
    return json(200, { ok: true });
  }
  return app(req, res);
}

http.createServer(handler).listen(config.port, config.host, () => {
  console.log(`Cherry Picker API (${config.profile}): http://${config.host}:${config.port}`);
  if (repository.devOnly || identity.devOnly) {
    console.log('ADVARSEL: Utviklingsadaptere er i bruk (minnelagring og testinnlogging uten passord). Bare fiktive data. Ikke eksponer serveren.');
  }
});
