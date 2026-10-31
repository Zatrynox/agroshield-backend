import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import type { AppConfig } from './config/env.js';
import type { Db } from './shared/db/db.js';
import { createContainer } from './container.js';
import { AppError } from './shared/errors.js';
import { assertCsrf, SESSION_COOKIE } from './shared/http/auth.js';
import { sendProblem } from './shared/http/problem.js';
import { registerHealthRoutes } from './health-routes.js';
import { registerAuthRoutes } from './iam/interfaces/http/auth-routes.js';
import { registerOrganizationRoutes } from './organizations/interfaces/http/organization-routes.js';
import { registerFarmRoutes } from './farms/interfaces/http/farm-routes.js';
import { registerSensorRoutes } from './sensors/interfaces/http/sensor-routes.js';
import { registerAlertRoutes } from './alerts/interfaces/http/alert-routes.js';
import { registerSoilHealthRoutes } from './soil-health/interfaces/http/soil-health-routes.js';
import { registerForecastRoutes } from './forecast/interfaces/http/forecast-routes.js';
import { registerPredictionRoutes } from './predictions/interfaces/http/prediction-routes.js';
import { registerLeadRoutes } from './leads/interfaces/http/lead-routes.js';
import { registerAnalyticsRoutes } from './analytics/interfaces/http/analytics-routes.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function buildApp(input: {
  config: AppConfig;
  db: Db;
  logger?: boolean;
}): Promise<FastifyInstance> {
  const { config, db } = input;
  const app = Fastify({
    logger:
      input.logger === false
        ? false
        : {
            level: config.logLevel,
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.headers["x-sensor-signature"]',
                'req.headers["x-csrf-token"]',
                'req.headers["x-sensor-private-key"]',
                'res.headers["set-cookie"]',
                'password',
                'passwordHash',
                'csrfToken',
              ],
              censor: '[redacted]',
            },
          },
    bodyLimit: 64 * 1024,
    trustProxy: config.trustProxy,
    requestTimeout: 20_000,
    connectionTimeout: 10_000,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cookie);
  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'content-type',
      'x-csrf-token',
      'x-sensor-timestamp',
      'x-sensor-signature',
      'idempotency-key',
    ],
    maxAge: 600,
  });
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    strictTransportSecurity: config.isProduction
      ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
      : false,
    referrerPolicy: { policy: 'no-referrer' },
  });
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: (_request, context) => ({
      type: 'https://agroshield.example/problems/rate_limited',
      title: 'Demasiadas solicitudes',
      status: 429,
      detail: `Máximo ${context.max} solicitudes por minuto. Inténtalo más tarde.`,
      code: 'rate_limited',
    }),
  });

  await app.register(swagger, {
    transform: jsonSchemaTransform,
    openapi: {
      info: {
        title: 'AgroShield API',
        description:
          'Predictive soil and crop monitoring. Device readings are signed with Ed25519 keys. All tenant routes are scoped to the authenticated organization.',
        version: '0.1.0',
      },
      tags: [
        { name: 'auth', description: 'Sessions and account access' },
        { name: 'organizations', description: 'Tenant and members' },
        { name: 'farms', description: 'Farms and zones' },
        { name: 'sensors', description: 'Sensor enrollment and signed readings' },
        { name: 'alerts', description: 'Countdown alerts' },
        { name: 'soil-health', description: 'Soil life and nutrient health' },
        { name: 'forecast', description: 'Soil trend forecast' },
        { name: 'predictions', description: 'Zone risk and incident reports' },
        { name: 'leads', description: 'Public demo requests' },
        { name: 'analytics', description: 'Consent-gated first-party analytics' },
      ],
      components: {
        securitySchemes: {
          cookieAuth: { type: 'apiKey', in: 'cookie', name: SESSION_COOKIE },
        },
      },
    },
  });
  if (config.enableApiDocs) {
    app.get('/documentation/json', { schema: { hide: true } }, async () => app.swagger());
    await app.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: { docExpansion: 'list', deepLinking: false },
    });
  }

  app.decorateRequest('auth', null);

  const container = createContainer(config, db);

  app.addHook('onRequest', async (request) => {
    const origin = request.headers.origin;
    if (!SAFE_METHODS.has(request.method) && origin && !config.corsOrigins.includes(origin)) {
      throw AppError.forbidden('El origen de la petición no está permitido.');
    }

    const token = request.cookies[SESSION_COOKIE];
    if (token) {
      request.auth = await container.sessions.authenticate(token);
    }
    if (request.auth && !SAFE_METHODS.has(request.method)) {
      assertCsrf(request);
    }
  });

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (!request.url.startsWith('/docs') && !request.url.startsWith('/documentation')) {
      reply.header(
        'Content-Security-Policy',
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      );
    }
    if (reply.statusCode === 429) {
      reply.type('application/problem+json; charset=utf-8');
    }
    return payload;
  });

  await registerHealthRoutes(app, container);
  await registerAuthRoutes(app, container);
  await registerOrganizationRoutes(app, container);
  await registerFarmRoutes(app, container);
  await registerSensorRoutes(app, container);
  await registerAlertRoutes(app, container);
  await registerSoilHealthRoutes(app, container);
  await registerForecastRoutes(app, container);
  await registerPredictionRoutes(app, container);
  await registerLeadRoutes(app, container);
  await registerAnalyticsRoutes(app, container);

  app.setNotFoundHandler((request, reply) => {
    return sendProblem(
      reply,
      404,
      'not_found',
      'Ruta no encontrada',
      `No existe ${request.method} ${request.url}.`,
    );
  });

  app.setErrorHandler((error, request, reply) => {
    const err = error as Error & {
      statusCode?: number;
      validation?: Array<{ message?: string }>;
    };
    if (error instanceof AppError) {
      return sendProblem(reply, error.statusCode, error.code, error.title, error.detail);
    }
    if (error instanceof ZodError) {
      const issue = error.issues[0];
      return sendProblem(
        reply,
        400,
        'validation_error',
        'Solicitud inválida',
        issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'Datos inválidos.',
      );
    }
    if (err.name === 'InvalidCredentialsError') {
      return sendProblem(
        reply,
        401,
        'invalid_credentials',
        'Credenciales inválidas',
        'Correo o contraseña incorrectos.',
      );
    }
    if (err.name.endsWith('DomainError') || err.name === 'PasswordPolicyError') {
      return sendProblem(reply, 400, 'validation_error', 'Solicitud inválida', err.message);
    }

    const status = err.statusCode;
    if (status === 400) {
      return sendProblem(
        reply,
        400,
        'validation_error',
        'Solicitud inválida',
        err.validation?.[0]?.message ?? 'Revisa los datos enviados.',
      );
    }
    if (status === 413) {
      return sendProblem(
        reply,
        413,
        'validation_error',
        'Cuerpo demasiado grande',
        'La petición supera el límite de 64 KB.',
      );
    }
    if (status === 429) {
      return sendProblem(
        reply,
        429,
        'rate_limited',
        'Demasiadas solicitudes',
        'Inténtalo de nuevo más tarde.',
      );
    }

    request.log.error({ err: error }, 'unhandled_error');
    return sendProblem(
      reply,
      500,
      'internal_error',
      'Error interno',
      'No se pudo completar la operación. El equipo ha registrado el fallo.',
    );
  });

  return app;
}
