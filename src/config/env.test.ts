import { describe, expect, it } from 'vitest';
import { loadConfig } from './env.js';

function productionEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    APP_ENV: 'production',
    DEMO_MODE: 'false',
    DATABASE_URL: 'postgresql://agroshield:password@db:5432/agroshield',
    SESSION_SECRET: 'a'.repeat(64),
    COOKIE_SECURE: 'true',
    CORS_ORIGINS: 'https://agroshield.example',
    TRUST_PROXY: 'true',
    ...overrides,
  };
}

describe('loadConfig', () => {
  it('parses a safe production configuration', () => {
    const config = loadConfig(productionEnv());
    expect(config.isProduction).toBe(true);
    expect(config.demoMode).toBe(false);
    expect(config.cookieSecure).toBe(true);
    expect(config.enableApiDocs).toBe(false);
    expect(config.corsOrigins).toEqual(['https://agroshield.example']);
  });

  it('defaults secure cookies and disabled docs in production', () => {
    const env = productionEnv();
    delete env.COOKIE_SECURE;
    const config = loadConfig(env);
    expect(config.cookieSecure).toBe(true);
    expect(config.enableApiDocs).toBe(false);
  });

  it('rejects demo mode in production', () => {
    expect(() => loadConfig(productionEnv({ DEMO_MODE: 'true' }))).toThrow(
      /DEMO_MODE must be false/,
    );
  });

  it('rejects insecure cookies in production', () => {
    expect(() => loadConfig(productionEnv({ COOKIE_SECURE: 'false' }))).toThrow(
      /COOKIE_SECURE must be true/,
    );
  });

  it('rejects placeholder session secrets in production', () => {
    expect(() =>
      loadConfig(productionEnv({ SESSION_SECRET: `dev-only-${'a'.repeat(40)}` })),
    ).toThrow(/placeholder/);
    expect(() =>
      loadConfig(productionEnv({ SESSION_SECRET: `replace-${'a'.repeat(40)}` })),
    ).toThrow(/placeholder/);
  });

  it('rejects non-PostgreSQL URLs in production', () => {
    expect(() =>
      loadConfig(productionEnv({ DATABASE_URL: 'pglite://.data/pglite' })),
    ).toThrow(/PostgreSQL/);
  });

  it('rejects HTTP origins and missing trust proxy in production', () => {
    expect(() =>
      loadConfig(productionEnv({ CORS_ORIGINS: 'http://agroshield.example' })),
    ).toThrow(/https origins/);
    expect(() => loadConfig(productionEnv({ TRUST_PROXY: 'false' }))).toThrow(
      /TRUST_PROXY/,
    );
  });

  it('keeps local development permissive', () => {
    const config = loadConfig({
      NODE_ENV: 'development',
      APP_ENV: 'development',
      DEMO_MODE: 'true',
      DATABASE_URL: 'pglite://.data/pglite',
      SESSION_SECRET: 'local-only-session-secret-0123456789abcdef',
      COOKIE_SECURE: 'false',
      CORS_ORIGINS: 'http://localhost:5173,http://localhost:4321',
    });
    expect(config.demoMode).toBe(true);
    expect(config.cookieSecure).toBe(false);
    expect(config.enableApiDocs).toBe(true);
  });

  it('rejects wildcard CORS everywhere', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'development',
        DATABASE_URL: 'pglite://.data/pglite',
        SESSION_SECRET: 'a'.repeat(40),
        CORS_ORIGINS: '*',
      }),
    ).toThrow(/explicit origins/);
  });
});
