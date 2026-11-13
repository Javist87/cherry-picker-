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

http.createServer(app).listen(config.port, config.host, () => {
  console.log(`Cherry Picker API (${config.profile}): http://${config.host}:${config.port}`);
  if (repository.devOnly || identity.devOnly) {
    console.log('ADVARSEL: Utviklingsadaptere er i bruk (minnelagring og testinnlogging uten passord). Bare fiktive data. Ikke eksponer serveren.');
  }
});
