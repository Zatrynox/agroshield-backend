import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { AppContainer } from '../../../container.js';
import { AppError } from '../../../shared/errors.js';
import { requireAuth, requireRole, WRITE_ROLES } from '../../../shared/http/auth.js';
import type { ReadingInput } from '../../domain/model/sensor-reading.js';
import {
  CreateSensorCommand,
  IngestReadingCommand,
  ListReadingsQuery,
  ListSensorsQuery,
  RevokeSensorCommand,
  RotateSensorKeyCommand,
} from '../../application/sensor-use-cases.js';

const zoneParams = z.object({ zoneId: z.string().uuid() }).strict();
const sensorParams = z.object({ sensorId: z.string().uuid() }).strict();

const readingBody = z
  .object({
    clientReadingId: z.string().min(1).max(100).optional(),
    recordedAt: z.string().datetime(),
    soilTempC: z.number().min(-20).max(100),
    moisturePct: z.number().min(0).max(100),
    ph: z.number().min(0).max(14),
    nitrogenMgKg: z.number().min(0).max(10_000),
    phosphorusMgKg: z.number().min(0).max(10_000),
    potassiumMgKg: z.number().min(0).max(10_000),
    conductivityMsCm: z.number().min(0).max(100),
    pestIndex: z.number().min(0).max(100),
  })
  .strict();

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export async function registerSensorRoutes(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/v1/zones/:zoneId/sensors',
    {
      schema: { tags: ['sensors'], summary: 'List sensors of a zone', params: zoneParams },
    },
    async (request) => {
      const auth = requireAuth(request);
      return container.queryBus.execute(new ListSensorsQuery(auth, request.params.zoneId));
    },
  );

  routes.post(
    '/v1/zones/:zoneId/sensors',
    {
      schema: {
        tags: ['sensors'],
        summary: 'Enroll a sensor and return its private key once',
        params: zoneParams,
        body: z.object({ name: z.string().trim().min(2).max(120) }).strict(),
      },
    },
    async (request, reply) => {
      const auth = requireRole(request, WRITE_ROLES);
      const result = await container.commandBus.execute(
        new CreateSensorCommand(auth, request.params.zoneId, request.body.name),
      );
      return reply
        .code(201)
        .header('cache-control', 'no-store')
        .send(result);
    },
  );

  routes.get(
    '/v1/zones/:zoneId/readings',
    {
      schema: {
        tags: ['sensors'],
        summary: 'Latest readings of a zone',
        params: zoneParams,
        querystring: z
          .object({ limit: z.coerce.number().int().min(1).max(200).default(24) })
          .strict(),
      },
    },
    async (request) => {
      const auth = requireAuth(request);
      return container.queryBus.execute(
        new ListReadingsQuery(auth, request.params.zoneId, request.query.limit),
      );
    },
  );

  routes.post(
    '/v1/sensors/:sensorId/readings',
    {
      schema: {
        tags: ['sensors'],
        summary: 'Ingest a signed sensor reading (device authentication)',
        params: sensorParams,
        body: readingBody,
        headers: z.object({
          'x-sensor-timestamp': z.string().optional(),
          'x-sensor-signature': z.string().optional(),
          'idempotency-key': z.string().max(100).optional(),
        }),
      },
      config: { rateLimit: { max: 240, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const timestamp = header(request, 'x-sensor-timestamp');
      const signature = header(request, 'x-sensor-signature');
      if (!timestamp || !signature) {
        throw new AppError(
          401,
          'sensor_unauthorized',
          'Sensor no autorizado',
          'Faltan las cabeceras de firma del dispositivo.',
        );
      }
      const clientReadingId =
        request.headers['idempotency-key'] ?? request.body.clientReadingId;
      if (!clientReadingId) {
        throw AppError.badRequest(
          'validation_error',
          'Se requiere clientReadingId o la cabecera Idempotency-Key.',
        );
      }
      const reading: ReadingInput = {
        ...request.body,
        clientReadingId: typeof clientReadingId === 'string' ? clientReadingId : clientReadingId[0]!,
      };
      const result = await container.commandBus.execute<
        import('../../application/sensor-use-cases.js').IngestReadingResult
      >(new IngestReadingCommand(request.params.sensorId, timestamp, signature, reading));
      return reply.code(result.duplicate ? 200 : 202).send(result);
    },
  );

  routes.post(
    '/v1/sensors/:sensorId/rotate-key',
    {
      schema: {
        tags: ['sensors'],
        summary: 'Rotate a sensor key, revoking the previous one',
        params: sensorParams,
      },
    },
    async (request) => {
      const auth = requireRole(request, WRITE_ROLES);
      return container.commandBus.execute(new RotateSensorKeyCommand(auth, request.params.sensorId));
    },
  );

  routes.delete(
    '/v1/sensors/:sensorId',
    {
      schema: {
        tags: ['sensors'],
        summary: 'Revoke a sensor key',
        params: sensorParams,
      },
    },
    async (request) => {
      const auth = requireRole(request, WRITE_ROLES);
      return container.commandBus.execute(new RevokeSensorCommand(auth, request.params.sensorId));
    },
  );
}
