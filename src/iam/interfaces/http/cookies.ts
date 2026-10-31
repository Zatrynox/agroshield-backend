import type { FastifyReply } from 'fastify';
import type { AppConfig } from '../../../config/env.js';
import { SESSION_COOKIE } from '../../../shared/http/auth.js';

export function setSessionCookie(reply: FastifyReply, token: string, config: AppConfig): void {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    maxAge: config.sessionTtlHours * 3_600,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}
