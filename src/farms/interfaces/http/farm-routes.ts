import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { AppContainer } from '../../../container.js';
import { requireAuth, requireRole, WRITE_ROLES } from '../../../shared/http/auth.js';
import {
  CreateFarmCommand,
  CreateZoneCommand,
  GetFarmQuery,
  GetZoneQuery,
  ListFarmsQuery,
  type FarmDetailDto,
} from '../../application/farm-use-cases.js';

const farmParams = z.object({ farmId: z.string().uuid() }).strict();
const zoneParams = z.object({ zoneId: z.string().uuid() }).strict();
const area = z.number().min(0).max(1_000_000);

export async function registerFarmRoutes(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/v1/farms',
    {
      schema: { tags: ['farms'], summary: 'List farms of the current organization' },
    },
    async (request) => {
      const auth = requireAuth(request);
      return container.queryBus.execute(new ListFarmsQuery(auth));
    },
  );

  routes.post(
    '/v1/farms',
    {
      schema: {
        tags: ['farms'],
        summary: 'Create a farm',
        body: z
          .object({
            name: z.string().trim().min(2).max(160),
            location: z.string().trim().max(200).default(''),
            areaHectares: area,
          })
          .strict(),
      },
    },
    async (request, reply) => {
      const auth = requireRole(request, WRITE_ROLES);
      const farm = await container.commandBus.execute(
        new CreateFarmCommand(auth, request.body),
      );
      return reply.code(201).send(farm);
    },
  );

  routes.get(
    '/v1/farms/:farmId',
    {
      schema: { tags: ['farms'], summary: 'Farm detail with its zones', params: farmParams },
    },
    async (request) => {
      const auth = requireAuth(request);
      return container.queryBus.execute(new GetFarmQuery(auth, request.params.farmId));
    },
  );

  routes.get(
    '/v1/farms/:farmId/zones',
    {
      schema: { tags: ['farms'], summary: 'Zones of a farm', params: farmParams },
    },
    async (request) => {
      const auth = requireAuth(request);
      const detail = await container.queryBus.execute<FarmDetailDto>(
        new GetFarmQuery(auth, request.params.farmId),
      );
      return detail.zones;
    },
  );

  routes.post(
    '/v1/farms/:farmId/zones',
    {
      schema: {
        tags: ['farms'],
        summary: 'Create a zone inside a farm',
        params: farmParams,
        body: z
          .object({
            name: z.string().trim().min(2).max(160),
            cropType: z.string().trim().min(2).max(80),
            areaHectares: area,
          })
          .strict(),
      },
    },
    async (request, reply) => {
      const auth = requireRole(request, WRITE_ROLES);
      const zone = await container.commandBus.execute(
        new CreateZoneCommand(auth, request.params.farmId, request.body),
      );
      return reply.code(201).send(zone);
    },
  );

  routes.get(
    '/v1/zones/:zoneId',
    {
      schema: { tags: ['farms'], summary: 'Zone detail', params: zoneParams },
    },
    async (request) => {
      const auth = requireAuth(request);
      return container.queryBus.execute(new GetZoneQuery(auth, request.params.zoneId));
    },
  );
}
