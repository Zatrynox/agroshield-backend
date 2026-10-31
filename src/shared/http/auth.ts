import type { FastifyRequest } from 'fastify';
import { AppError } from '../errors.js';
import { safeEqual } from '../crypto.js';
import type { Role } from '../roles.js';

export const SESSION_COOKIE = 'agroshield_session';

export type { Role } from '../roles.js';
export { WRITE_ROLES } from '../roles.js';

export interface AuthContext {
  sessionId: string;
  userId: string;
  userEmail: string;
  userName: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  organizationPlan: string;
  role: Role;
  csrfToken: string;
  sessionExpiresAt: Date;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

export function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) {
    throw AppError.unauthorized();
  }
  return request.auth;
}

export function requireRole(request: FastifyRequest, roles: readonly Role[]): AuthContext {
  const auth = requireAuth(request);
  if (!roles.includes(auth.role)) {
    throw AppError.forbidden();
  }
  return auth;
}

export function assertCsrf(request: FastifyRequest): void {
  const auth = requireAuth(request);
  const header = request.headers['x-csrf-token'];
  const token = Array.isArray(header) ? header[0] : header;
  if (!token || !safeEqual(token, auth.csrfToken)) {
    throw new AppError(403, 'csrf_invalid', 'Token CSRF inválido', 'Recarga la página e inténtalo de nuevo.');
  }
}
