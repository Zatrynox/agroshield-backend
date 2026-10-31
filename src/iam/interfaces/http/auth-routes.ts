import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { AppContainer } from '../../../container.js';
import { assertCsrf, requireAuth, SESSION_COOKIE } from '../../../shared/http/auth.js';
import { clearSessionCookie, setSessionCookie } from './cookies.js';
import { LoginCommand } from '../../application/commands/login.js';
import { LogoutCommand } from '../../application/commands/logout.js';
import { RegisterCommand } from '../../application/commands/register.js';
import { GetMeQuery } from '../../application/queries/get-me.js';
import { SessionStatusQuery } from '../../application/queries/session-status.js';

const registerSchema = z
  .object({
    email: z.string().trim().email().max(320),
    password: z.string().min(12).max(128),
    name: z.string().trim().min(2).max(120),
    organizationName: z.string().trim().min(2).max(160),
  })
  .strict();

const loginSchema = z
  .object({
    email: z.string().trim().email().max(320),
    password: z.string().min(1).max(128),
  })
  .strict();

export async function registerAuthRoutes(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.post(
    '/v1/auth/register',
    {
      schema: {
        tags: ['auth'],
        summary: 'Create an account and its first organization',
        body: registerSchema,
      },
      config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
    },
    async (request, reply) => {
      const result = await container.commandBus.execute<import('../../application/dto.js').AuthResult>(
        new RegisterCommand(request.body),
      );
      setSessionCookie(reply, result.sessionToken, container.config);
      reply.header('cache-control', 'no-store').code(201);
      const { sessionToken: _sessionToken, ...session } = result;
      return session;
    },
  );

  routes.post(
    '/v1/auth/login',
    {
      schema: {
        tags: ['auth'],
        summary: 'Start a session',
        body: loginSchema,
      },
      config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
    },
    async (request, reply) => {
      const result = await container.commandBus.execute<import('../../application/dto.js').AuthResult>(
        new LoginCommand(request.body, {
          userAgent: request.headers['user-agent'] ?? null,
          ipHash: null,
        }),
      );
      setSessionCookie(reply, result.sessionToken, container.config);
      reply.header('cache-control', 'no-store');
      const { sessionToken: _sessionToken, ...session } = result;
      return session;
    },
  );

  routes.post(
    '/v1/auth/logout',
    {
      schema: {
        tags: ['auth'],
        summary: 'Close the current session',
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      assertCsrf(request);
      await container.commandBus.execute(new LogoutCommand(auth.sessionId));
      clearSessionCookie(reply);
      return reply.header('cache-control', 'no-store').code(204).send();
    },
  );

  routes.get(
    '/v1/auth/me',
    {
      schema: {
        tags: ['auth'],
        summary: 'Current session, user and organization',
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      const session = await container.queryBus.execute<import('../../application/dto.js').SessionDto>(
        new GetMeQuery(auth),
      );
      return reply.header('cache-control', 'no-store').send(session);
    },
  );

  routes.get(
    '/v1/auth/session-status',
    {
      schema: {
        tags: ['auth'],
        summary: 'Non-sensitive session presence check used by the landing page',
      },
    },
    async (request, reply) => {
      const token = request.cookies[SESSION_COOKIE];
      const status = await container.queryBus.execute<{ authenticated: boolean }>(
        new SessionStatusQuery(token),
      );
      return reply.header('cache-control', 'no-store').send(status);
    },
  );

  routes.get(
    '/v1/captcha',
    {
      schema: {
        tags: ['leads'],
        summary: 'Issue a proof-of-work challenge for public forms',
      },
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (_request, reply) => {
      return reply.header('cache-control', 'no-store').send(container.captcha.issue());
    },
  );
}
