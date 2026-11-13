// Setter sammen applikasjonen av konfigurasjon og adaptere. Eneste sted adaptere velges.
import { createService } from './service.mjs';
import { createApp } from './http.mjs';
import { systemClock } from './clock.mjs';
import { assertRepositoryPort, assertIdentityPort, assertAllowedInProfile } from './ports.mjs';
import { createDevMemoryRepository } from './adapters/dev-memory-repository.mjs';
import { createDevIdentity } from './adapters/dev-identity.mjs';

// Registeret inneholder bare utviklingsadaptere. Produksjonsadaptere legges til når B-01 til B-03 er besluttet.
const REPOSITORY_ADAPTERS = { 'dev-memory': options => createDevMemoryRepository(options) };
const IDENTITY_ADAPTERS = { dev: options => createDevIdentity(options) };

export function createAdapters(config, { clock = systemClock } = {}) {
  const makeRepository = REPOSITORY_ADAPTERS[config.repositoryAdapter];
  const makeIdentity = IDENTITY_ADAPTERS[config.identityAdapter];
  if (config.profile === 'production' && (!makeRepository || !makeIdentity || config.repositoryAdapter === 'dev-memory' || config.identityAdapter === 'dev')) {
    throw new Error('Produksjonsprofilen kan ikke startes: det finnes ingen godkjent adapter for lagring og identitet. ' +
      'Beslutning B-01, B-02 og B-03 må tas, og adaptere må bygges og testes først. Utviklingsadaptere er sperret i produksjon.');
  }
  if (!makeRepository) throw new Error('Ukjent REPOSITORY_ADAPTER: ' + config.repositoryAdapter);
  if (!makeIdentity) throw new Error('Ukjent IDENTITY_ADAPTER: ' + config.identityAdapter);
  const repository = assertAllowedInProfile(assertRepositoryPort(makeRepository({ profile: config.profile })), config.profile);
  const identity = assertAllowedInProfile(assertIdentityPort(makeIdentity({ profile: config.profile, clock, sessionTtlSeconds: config.sessionTtlSeconds })), config.profile);
  return { repository, identity };
}

export function createApplication(config, { clock = systemClock, staticHandler = null, log = () => {}, adapters = null } = {}) {
  const { repository, identity } = adapters || createAdapters(config, { clock });
  assertAllowedInProfile(assertRepositoryPort(repository), config.profile);
  assertAllowedInProfile(assertIdentityPort(identity), config.profile);
  const service = createService({ repository, directory: identity.directory, clock, config: { ...config, identityKind: identity.kind } });
  const app = createApp({ service, identity, config, clock, staticHandler, log });
  return { app, service, repository, identity };
}
