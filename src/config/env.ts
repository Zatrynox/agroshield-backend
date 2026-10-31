import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) => (typeof value === 'boolean' ? value : value === 'true' || value === '1'));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DEMO_MODE: booleanish.default(false),
  API_PORT: z.coerce.number().int().positive().default(3000),
  API_HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  AUTO_MIGRATE: booleanish.default(false),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must have at least 32 characters'),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(8),
  COOKIE_SECURE: booleanish.optional(),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:4321'),
  CAPTCHA_DIFFICULTY: z.coerce.number().int().min(3).max(6).default(4),
  LEAD_RATE_LIMIT_PER_HOUR: z.coerce.number().int().min(1).max(100).default(5),
  SENSOR_MAX_SKEW_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  TRUST_PROXY: booleanish.default(false),
  ENABLE_API_DOCS: booleanish.optional(),
});

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  demoMode: boolean;
  apiPort: number;
  apiHost: string;
  logLevel: z.infer<typeof schema>['LOG_LEVEL'];
  databaseUrl: string;
  autoMigrate: boolean;
  sessionSecret: string;
  sessionTtlHours: number;
  cookieSecure: boolean;
  corsOrigins: string[];
  captchaDifficulty: number;
  leadRateLimitPerHour: number;
  sensorMaxSkewSeconds: number;
  trustProxy: boolean;
  enableApiDocs: boolean;
};

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  if (source !== process.env) {
    return parseConfig(source);
  }

  const envFile = fileURLToPath(new URL('../../.env', import.meta.url));
  if (existsSync(envFile) && process.env.NODE_ENV !== 'production') {
    loadDotenv({ path: envFile });
  }
  return parseConfig(process.env);
}

function parseConfig(source: NodeJS.ProcessEnv): AppConfig {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  const env = parsed.data;
  const isProduction = env.NODE_ENV === 'production';
  const corsOrigins = env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (corsOrigins.includes('*')) {
    throw new Error('CORS_ORIGINS must list explicit origins, not *');
  }

  if (isProduction) {
    // Fail closed when a production deployment is still carrying local/demo
    // defaults. These checks run before the server binds a port.
    if (env.DEMO_MODE) {
      throw new Error('DEMO_MODE must be false when NODE_ENV=production');
    }
    if (env.COOKIE_SECURE === false) {
      throw new Error('COOKIE_SECURE must be true when NODE_ENV=production');
    }
    if (
      /(change[-_ ]?me|replace|example|dev[-_ ]?only|local[-_ ]?only|set[-_ ]?me)/i.test(
        env.SESSION_SECRET,
      )
    ) {
      throw new Error('SESSION_SECRET contains a placeholder; generate a fresh production secret');
    }
    if (!/^postgres(ql)?:\/\//.test(env.DATABASE_URL)) {
      throw new Error('DATABASE_URL must use PostgreSQL when NODE_ENV=production');
    }
    if (corsOrigins.length === 0 || corsOrigins.some((origin) => !origin.startsWith('https://'))) {
      throw new Error('CORS_ORIGINS must contain explicit https origins in production');
    }
    if (!env.TRUST_PROXY) {
      throw new Error('TRUST_PROXY must be true in production so rate limits see client IPs');
    }
  }

  return {
    nodeEnv: env.NODE_ENV,
    isProduction,
    demoMode: env.DEMO_MODE,
    apiPort: env.API_PORT,
    apiHost: env.API_HOST,
    logLevel: env.LOG_LEVEL,
    databaseUrl: env.DATABASE_URL,
    autoMigrate: env.AUTO_MIGRATE,
    sessionSecret: env.SESSION_SECRET,
    sessionTtlHours: env.SESSION_TTL_HOURS,
    cookieSecure: env.COOKIE_SECURE ?? isProduction,
    corsOrigins,
    captchaDifficulty: env.CAPTCHA_DIFFICULTY,
    leadRateLimitPerHour: env.LEAD_RATE_LIMIT_PER_HOUR,
    sensorMaxSkewSeconds: env.SENSOR_MAX_SKEW_SECONDS,
    trustProxy: env.TRUST_PROXY,
    enableApiDocs: env.ENABLE_API_DOCS ?? !isProduction,
  };
}
