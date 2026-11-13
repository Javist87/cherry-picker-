// Konfigurasjon leses bare fra miljøvariabler. Ingen hemmeligheter har standardverdi her.
// Navnene er dokumentert i docs/operations.md.
export const PROFILES = ['development', 'test', 'production'];

const positiveInt = (value, fallback, name) => {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error(`Ugyldig verdi for ${name}: må være et positivt heltall.`);
  return n;
};

export function loadConfig(env = process.env) {
  const profile = env.APP_PROFILE || 'development';
  if (!PROFILES.includes(profile)) throw new Error(`Ukjent APP_PROFILE: ${profile}. Tillatt: ${PROFILES.join(', ')}.`);
  return {
    profile,
    port: positiveInt(env.PORT, 3000, 'PORT'),
    // Utvikling og test binder alltid til localhost. Bare produksjonsprofilen kan lytte på annen adresse.
    host: profile === 'production' ? (env.HOST || '127.0.0.1') : '127.0.0.1',
    repositoryAdapter: env.REPOSITORY_ADAPTER || (profile === 'production' ? '' : 'dev-memory'),
    identityAdapter: env.IDENTITY_ADAPTER || (profile === 'production' ? '' : 'dev'),
    aggregateMinCell: positiveInt(env.AGGREGATE_MIN_CELL, 5, 'AGGREGATE_MIN_CELL'), // B-06
    sessionTtlSeconds: positiveInt(env.SESSION_TTL_SECONDS, 8 * 60 * 60, 'SESSION_TTL_SECONDS'), // B-02
    intakeRateLimitPerMinute: positiveInt(env.INTAKE_RATE_LIMIT_PER_MINUTE, 30, 'INTAKE_RATE_LIMIT_PER_MINUTE'),
    maxBodyBytes: 64 * 1024,
    requestLog: env.REQUEST_LOG !== 'off' && profile !== 'test',
  };
}
