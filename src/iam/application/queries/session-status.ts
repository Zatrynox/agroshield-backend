import type { QueryHandler } from '../../../shared/kernel/query-bus.js';
import type { SessionService } from '../services/session-service.js';

export class SessionStatusQuery {
  constructor(readonly rawToken: string | undefined) {}
}

export class SessionStatusHandler implements QueryHandler<SessionStatusQuery, { authenticated: boolean }> {
  constructor(private readonly sessions: SessionService) {}

  async handle(query: SessionStatusQuery): Promise<{ authenticated: boolean }> {
    if (!query.rawToken) {
      return { authenticated: false };
    }
    const auth = await this.sessions.authenticate(query.rawToken);
    return { authenticated: auth !== null };
  }
}
