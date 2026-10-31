import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { AppContainer } from '../../../container.js';
import { assertCsrf, requireAuth, requireRole } from '../../../shared/http/auth.js';
import {
  AcknowledgeAlertCommand,
  GetAlertQuery,
  ListAlertsQuery,
} from '../../application/alert-use-cases.js';

const alertParams = z.object({ alertId: z.string().uuid() }).strict();

export async function registerAlertRoutes(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/v1/alerts',
    {
      schema: {
        tags: ['alerts'],
        summary: 'Open alerts of the current organization',
        querystring: z.object({ zoneId: z.string().uuid().optional() }).strict(),
      },
    },
    async (request) => {
      const auth = requireAuth(request);
      return container.queryBus.execute(new ListAlertsQuery(auth, request.query.zoneId));
    },
  );

  routes.get(
    '/v1/alerts/:alertId',
    {
      schema: { tags: ['alerts'], summary: 'Alert detail', params: alertParams },
    },
    async (request) => {
      const auth = requireAuth(request);
      return container.queryBus.execute(new GetAlertQuery(auth, request.params.alertId));
    },
  );

  routes.post(
    '/v1/alerts/:alertId/acknowledge',
    {
      schema: {
        tags: ['alerts'],
        summary: 'Acknowledge an alert',
        params: alertParams,
      },
    },
    async (request) => {
      const auth = requireRole(request, ['owner', 'admin', 'agronomist', 'operator']);
      assertCsrf(request);
      return container.commandBus.execute(new AcknowledgeAlertCommand(auth, request.params.alertId));
    },
  );
}
