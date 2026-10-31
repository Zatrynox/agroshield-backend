import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { AppContainer } from '../../../container.js';
import { requireAuth } from '../../../shared/http/auth.js';
import { GetPredictionQuery } from '../../application/get-prediction.js';

const params = z.object({ zoneId: z.string().uuid() }).strict();

export async function registerPredictionRoutes(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();
  routes.get(
    '/v1/zones/:zoneId/prediction',
    {
      schema: {
        tags: ['predictions'],
        summary: 'Rule-based zone risk and incident-zone report (labelled demo)',
        params,
      },
    },
    async (request) => {
      const auth = requireAuth(request);
      return container.queryBus.execute(new GetPredictionQuery(auth, request.params.zoneId));
    },
  );
}
