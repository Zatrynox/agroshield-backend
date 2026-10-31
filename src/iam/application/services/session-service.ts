import { randomUUID } from 'node:crypto';
import type { Clock } from '../../../shared/clock.js';
import { sha256, randomToken } from '../../../shared/crypto.js';
import type { AppConfig } from '../../../config/env.js';
import type { AuthContext } from '../../../shared/http/auth.js';
import type {
  MembershipRepository,
  OrganizationRepository,
} from '../../../organizations/domain/repositories/organization-repositories.js';
import type { SessionRepository, UserRepository } from '../../domain/repositories/iam-repositories.js';
import { Session } from '../../domain/model/session.js';

export interface IssuedSession {
  token: string;
  session: Session;
}

export class SessionService {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly users: UserRepository,
    private readonly organizations: OrganizationRepository,
    private readonly memberships: MembershipRepository,
    private readonly config: AppConfig,
    private readonly clock: Clock,
  ) {}

  async issue(input: {
    userId: string;
    organizationId: string;
    userAgent?: string | null;
    ipHash?: string | null;
  }): Promise<IssuedSession> {
    const now = this.clock.now();
    const token = randomToken(32);
    const session = Session.issue({
      id: randomUUID(),
      tokenHash: sha256(token),
      csrfToken: randomToken(32),
      userId: input.userId,
      organizationId: input.organizationId,
      expiresAt: new Date(now.getTime() + this.config.sessionTtlHours * 3_600_000),
      createdAt: now,
      userAgent: input.userAgent?.slice(0, 300) ?? null,
      ipHash: input.ipHash ?? null,
    });
    await this.sessions.insert(session);
    return { token, session };
  }

  async authenticate(rawToken: string): Promise<AuthContext | null> {
    const session = await this.sessions.findByTokenHash(sha256(rawToken));
    if (!session || !session.isActive(this.clock.now())) {
      return null;
    }

    const [user, organization, membership] = await Promise.all([
      this.users.findById(session.userId),
      this.organizations.findById(session.organizationId),
      this.memberships.findForUser(session.userId, session.organizationId),
    ]);

    if (!user || !organization || !membership) {
      return null;
    }

    return {
      sessionId: session.id,
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      organizationId: organization.id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      organizationPlan: organization.plan,
      role: membership.role,
      csrfToken: session.csrfToken,
      sessionExpiresAt: session.expiresAt,
    };
  }
}
