import { randomUUID } from 'node:crypto';
import type { CommandHandler } from '../../../shared/kernel/command-bus.js';
import type { Clock } from '../../../shared/clock.js';
import { AppError } from '../../../shared/errors.js';
import { randomToken } from '../../../shared/crypto.js';
import type { OrganizationRepository, MembershipRepository } from '../../../organizations/domain/repositories/organization-repositories.js';
import { Membership, Organization } from '../../../organizations/domain/model/organization.js';
import type { PasswordHasher, UserRepository } from '../../domain/repositories/iam-repositories.js';
import { PasswordPolicy, PasswordPolicyError, User } from '../../domain/model/user.js';
import type { AuthResult } from '../dto.js';
import type { SessionService } from '../services/session-service.js';

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  organizationName: string;
}

export class RegisterCommand {
  constructor(readonly input: RegisterInput) {}
}

export class RegisterHandler implements CommandHandler<RegisterCommand, AuthResult> {
  constructor(
    private readonly users: UserRepository,
    private readonly organizations: OrganizationRepository,
    private readonly memberships: MembershipRepository,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionService,
    private readonly clock: Clock,
  ) {}

  async handle(command: RegisterCommand): Promise<AuthResult> {
    const email = command.input.email.trim().toLowerCase();
    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new AppError(409, 'email_taken', 'Correo ya registrado', 'Ya existe una cuenta con ese correo.');
    }

    try {
      PasswordPolicy.validate(command.input.password);
    } catch (error) {
      if (error instanceof PasswordPolicyError) {
        throw AppError.badRequest('validation_error', error.message);
      }
      throw error;
    }

    const passwordHash = await this.hasher.hash(command.input.password);
    const organization = await this.buildOrganization(command.input.organizationName);
    const user = User.register({
      id: randomUUID(),
      email,
      name: command.input.name,
      passwordHash,
      createdAt: this.clock.now(),
    });

    await this.organizations.create(organization);
    try {
      await this.users.insert(user);
      const membership = Membership.create({
        userId: user.id,
        organizationId: organization.id,
        role: 'owner',
        createdAt: this.clock.now(),
      });
      await this.memberships.add(membership);
      const issued = await this.sessions.issue({
        userId: user.id,
        organizationId: organization.id,
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
    } catch (error) {
      await this.users.deleteById(user.id).catch(() => undefined);
      await this.organizations.deleteById(organization.id).catch(() => undefined);
      throw error;
    }
  }

  private async buildOrganization(name: string): Promise<Organization> {
    const base = slugify(name).slice(0, 60) || 'organizacion';
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const slug = `${base}-${randomToken(3).toLowerCase()}`;
      if (!(await this.organizations.findBySlug(slug))) {
        return Organization.create({
          id: randomUUID(),
          name,
          slug,
          createdAt: this.clock.now(),
        });
      }
    }
    throw new AppError(500, 'internal_error', 'Error interno', 'No se pudo crear la organización.');
  }
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
