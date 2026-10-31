import type { QueryHandler } from '../../../shared/kernel/query-bus.js';
import type { AuthContext } from '../../../shared/http/auth.js';
import type { SessionDto } from '../dto.js';

export class GetMeQuery {
  constructor(readonly auth: AuthContext) {}
}

export class GetMeHandler implements QueryHandler<GetMeQuery, SessionDto> {
  async handle(query: GetMeQuery): Promise<SessionDto> {
    const { auth } = query;
    return {
      user: { id: auth.userId, email: auth.userEmail, name: auth.userName },
      organization: {
        id: auth.organizationId,
        name: auth.organizationName,
        slug: auth.organizationSlug,
        plan: auth.organizationPlan,
      },
      role: auth.role,
      csrfToken: auth.csrfToken,
      expiresAt: auth.sessionExpiresAt.toISOString(),
    };
  }
}
