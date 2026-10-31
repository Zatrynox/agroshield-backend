import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { sha256 } from '../../../shared/crypto.js';
import type { AppContainer } from '../../../container.js';
import { CreateLeadCommand } from '../../application/create-lead.js';

const leadSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(320),
    company: z.string().trim().min(2).max(160),
    phone: z.string().trim().max(40).optional().default(''),
    message: z.string().trim().min(10).max(2000),
    consent: z.boolean(),
    website: z.string().max(200).optional().default(''),
    captchaChallenge: z.string().min(10).max(500),
    captchaSolution: z.string().min(1).max(64),
  })
  .strict();

export async function registerLeadRoutes(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.post(
    '/v1/leads',
    {
      schema: {
        tags: ['leads'],
        summary: 'Create a demo request from the public landing',
        body: leadSchema,
      },
      config: {
        rateLimit: {
          max: container.config.leadRateLimitPerHour,
          timeWindow: '1 hour',
        },
      },
    },
    async (request, reply) => {
      const ipHash = sha256(`${request.ip}:${container.config.sessionSecret}`);
      const result = await container.commandBus.execute(
        new CreateLeadCommand(request.body, {
          ipHash,
          userAgent: request.headers['user-agent'] ?? null,
        }),
      );
      return reply.code(201).send(result);
    },
  );
}
