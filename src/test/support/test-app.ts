import { randomBytes } from 'node:crypto';
import { createDb, type Db } from '../../shared/db/db.js';
import { runMigrations } from '../../shared/db/migrations.js';
import { buildApp } from '../../app.js';
import type { AppConfig } from '../../config/env.js';
import type { FastifyInstance } from 'fastify';

export interface TestContext {
  app: FastifyInstance;
  db: Db;
  config: AppConfig;
  close(): Promise<void>;
}

export async function createTestContext(
  overrides: Partial<AppConfig> = {},
): Promise<TestContext> {
  const config: AppConfig = {
    nodeEnv: 'test',
    isProduction: false,
    demoMode: true,
    apiPort: 0,
    apiHost: '127.0.0.1',
    logLevel: 'silent',
    databaseUrl: 'pglite://memory',
    autoMigrate: false,
    sessionSecret: randomBytes(48).toString('hex'),
    sessionTtlHours: 8,
    cookieSecure: false,
    corsOrigins: ['http://localhost:4321', 'http://localhost:5173'],
    captchaDifficulty: 4,
    leadRateLimitPerHour: 5,
    sensorMaxSkewSeconds: 300,
    trustProxy: false,
    enableApiDocs: false,
    ...overrides,
  };

  const db = await createDb(config.databaseUrl);
  await runMigrations(db);
  const app = await buildApp({ config, db, logger: false });
  await app.ready();

  return {
    app,
    db,
    config,
    async close() {
      await app.close();
      await db.close();
    },
  };
}

export function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie'];
  const values = Array.isArray(raw) ? raw : [String(raw ?? '')];
  const session = values.find((value) => value.startsWith('agroshield_session='));
  if (!session) {
    throw new Error('The response did not set the session cookie');
  }
  return session.split(';')[0]!;
}

export async function registerUser(
  app: FastifyInstance,
  input: {
    email?: string;
    password?: string;
    name?: string;
    organizationName?: string;
  } = {},
): Promise<{
  cookie: string;
  csrfToken: string;
  userId: string;
  organizationId: string;
  email: string;
}> {
  const email = input.email ?? `user-${randomBytes(4).toString('hex')}@example.test`;
  const password = input.password ?? 'Prueba-Segura-2026!';
  const response = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: {
      email,
      password,
      name: input.name ?? 'Ana Agrónoma',
      organizationName: input.organizationName ?? 'Finca de Prueba',
    },
  });

  if (response.statusCode !== 201) {
    throw new Error(`Registration failed: ${response.statusCode} ${response.body}`);
  }
  const body = response.json();
  return {
    cookie: cookieFrom(response),
    csrfToken: body.csrfToken,
    userId: body.user.id,
    organizationId: body.organization.id,
    email,
  };
}
