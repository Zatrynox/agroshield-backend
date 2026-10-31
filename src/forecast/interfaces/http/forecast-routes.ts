import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { AppContainer } from '../../../container.js';
import { requireAuth } from '../../../shared/http/auth.js';
import { GetForecastQuery } from '../../application/get-forecast.js';

const params = z.object({ zoneId: z.string().uuid() }).strict();

export async function registerForecastRoutes(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();
  routes.get(
    '/v1/zones/:zoneId/forecast',
    {
      schema: {
        tags: ['forecast'],
        summary: 'Seven-day soil trend forecast (demo model, labelled)',
        params,
      },
    },
    async (request) => {
      const auth = requireAuth(request);
      return container.queryBus.execute(new GetForecastQuery(auth, request.params.zoneId));
    },
  );
}
