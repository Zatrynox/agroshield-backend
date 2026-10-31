import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { AppContainer } from '../../../container.js';
import { requireAuth } from '../../../shared/http/auth.js';
import { GetSoilHealthQuery } from '../../application/get-soil-health.js';

const params = z.object({ zoneId: z.string().uuid() }).strict();

export async function registerSoilHealthRoutes(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();
  routes.get(
    '/v1/zones/:zoneId/soil-health',
    {
      schema: {
        tags: ['soil-health'],
        summary: 'Current soil health assessment for a zone',
        params,
      },
    },
    async (request) => {
      const auth = requireAuth(request);
      return container.queryBus.execute(new GetSoilHealthQuery(auth, request.params.zoneId));
    },
  );
}
