import type { CommandHandler } from '../../../shared/kernel/command-bus.js';
import type { Clock } from '../../../shared/clock.js';
import { AppError } from '../../../shared/errors.js';
import type {
  MembershipRepository,
  OrganizationRepository,
} from '../../../organizations/domain/repositories/organization-repositories.js';
import type { PasswordHasher, UserRepository } from '../../domain/repositories/iam-repositories.js';
import { InvalidCredentialsError } from '../../domain/model/user.js';
import type { AuthResult } from '../dto.js';
import type { SessionService } from '../services/session-service.js';

export class LoginCommand {
  constructor(
    readonly input: { email: string; password: string },
    readonly meta: { userAgent?: string | null; ipHash?: string | null } = {},
  ) {}
}

export class LoginHandler implements CommandHandler<LoginCommand, AuthResult> {
  constructor(
    private readonly users: UserRepository,
    private readonly organizations: OrganizationRepository,
    private readonly memberships: MembershipRepository,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionService,
    private readonly clock: Clock,
  ) {}

  async handle(command: LoginCommand): Promise<AuthResult> {
    const email = command.input.email.trim().toLowerCase();
    const user = await this.users.findByEmail(email);
    if (!user) {
      await this.hasher.verifyDummy(command.input.password);
      throw new InvalidCredentialsError();
    }

    const now = this.clock.now();
    if (user.isLocked(now)) {
      throw new AppError(
        423,
        'account_locked',
        'Cuenta bloqueada',
        'Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.',
      );
    }

    const valid = await this.hasher.verify(user.passwordHash, command.input.password);
    if (!valid) {
      user.registerFailedLogin(now);
      await this.users.update(user);
      throw new InvalidCredentialsError();
    }

    user.resetLoginFailures();
    await this.users.update(user);

    const memberships = await this.memberships.listForUser(user.id);
    const membership = memberships[0];
    if (!membership) {
      throw AppError.forbidden('Tu cuenta no pertenece a ninguna organización activa.');
    }
    const organization = await this.organizations.findById(membership.organizationId);
    if (!organization) {
      throw AppError.forbidden('La organización no está disponible.');
    }

    const issued = await this.sessions.issue({
      userId: user.id,
      organizationId: organization.id,
      userAgent: command.meta.userAgent,
      ipHash: command.meta.ipHash,
    });

    return {
      user: { id: user.id, email: user.email, name: user.name },
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        plan: organization.plan,
      },
      role: membership.role,
      csrfToken: issued.session.csrfToken,
      expiresAt: issued.session.expiresAt.toISOString(),
      sessionToken: issued.token,
    };
  }
}
