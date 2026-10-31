import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { AppContainer } from '../../../container.js';
import {
  ANALYTICS_EVENTS,
  RecordAnalyticsEventCommand,
} from '../../application/record-event.js';

const eventSchema = z
  .object({
    name: z.enum(ANALYTICS_EVENTS),
    path: z.string().min(1).max(300),
    props: z
      .record(z.union([z.string().max(120), z.number(), z.boolean()]))
      .default({})
      .refine((props) => Object.keys(props).length <= 10, 'Too many properties'),
    consent: z.boolean(),
  })
  .strict();

export async function registerAnalyticsRoutes(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.post(
    '/v1/analytics/events',
    {
      schema: {
        tags: ['analytics'],
        summary: 'Record a first-party, consent-gated analytics event',
        body: eventSchema,
      },
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      await container.commandBus.execute(
        new RecordAnalyticsEventCommand(
          request.body.name,
          request.body.path,
          request.body.props,
          request.body.consent,
        ),
      );
      return reply.code(204).send();
    },
  );
}
