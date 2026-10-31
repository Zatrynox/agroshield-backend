import type { FastifyInstance } from 'fastify';
import type { AppContainer } from './container.js';

export async function registerHealthRoutes(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  app.get(
    '/health',
    {
      schema: {
        tags: ['system'],
        summary: 'Liveness and database readiness',
      },
      config: { rateLimit: false },
    },
    async (_request, reply) => {
      try {
        await container.db.query('SELECT 1 AS ok');
        return reply.send({
          status: 'ok',
          database: 'ok',
          demoMode: container.config.demoMode,
          version: '0.1.0',
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        app.log.error({ err: error }, 'healthcheck_failed');
        return reply.code(503).send({
          status: 'degraded',
          database: 'unavailable',
          demoMode: container.config.demoMode,
          version: '0.1.0',
          timestamp: new Date().toISOString(),
        });
      }
    },
  );
}
