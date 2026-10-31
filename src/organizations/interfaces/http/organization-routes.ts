import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { AppContainer } from '../../../container.js';
import { requireAuth, requireRole } from '../../../shared/http/auth.js';
import {
  GetOrganizationQuery,
  RenameOrganizationCommand,
} from '../../application/organization-use-cases.js';

const params = z.object({}).strict();

export async function registerOrganizationRoutes(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/v1/organizations/current',
    {
      schema: {
        tags: ['organizations'],
        summary: 'Current organization and its members',
        params,
      },
    },
    async (request) => {
      const auth = requireAuth(request);
      return container.queryBus.execute(new GetOrganizationQuery(auth));
    },
  );

  routes.patch(
    '/v1/organizations/current',
    {
      schema: {
        tags: ['organizations'],
        summary: 'Rename the current organization',
        body: z.object({ name: z.string().trim().min(2).max(160) }).strict(),
      },
    },
    async (request) => {
      const auth = requireRole(request, ['owner', 'admin']);
      return container.commandBus.execute(new RenameOrganizationCommand(auth, request.body.name));
    },
  );
}
