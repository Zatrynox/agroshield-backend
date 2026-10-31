import type { CommandHandler } from '../../shared/kernel/command-bus.js';
import type { QueryHandler } from '../../shared/kernel/query-bus.js';
import type { AuthContext } from '../../shared/http/auth.js';
import { AppError } from '../../shared/errors.js';
import type { Role } from '../../shared/roles.js';
import type {
  MembershipRepository,
  OrganizationRepository,
} from '../domain/repositories/organization-repositories.js';

export interface OrganizationDetailDto {
  organization: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    createdAt: string;
    membersCount: number;
  };
  members: Array<{ userId: string; name: string; email: string; role: Role; createdAt: string }>;
}

export class GetOrganizationQuery {
  constructor(readonly auth: AuthContext) {}
}

export class GetOrganizationHandler implements QueryHandler<GetOrganizationQuery, OrganizationDetailDto> {
  constructor(
    private readonly organizations: OrganizationRepository,
    private readonly memberships: MembershipRepository,
  ) {}

  async handle(query: GetOrganizationQuery): Promise<OrganizationDetailDto> {
    const organization = await this.organizations.findById(query.auth.organizationId);
    if (!organization) {
      throw AppError.notFound();
    }
    const members = await this.memberships.listForOrganization(organization.id);
    return {
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        plan: organization.plan,
        createdAt: organization.createdAt.toISOString(),
        membersCount: members.length,
      },
      members: members.map((member) => ({
        userId: member.userId,
        name: member.name,
        email: member.email,
        role: member.role,
        createdAt: member.createdAt.toISOString(),
      })),
    };
  }
}

export class RenameOrganizationCommand {
  constructor(
    readonly auth: AuthContext,
    readonly name: string,
  ) {}
}

export class RenameOrganizationHandler
  implements CommandHandler<RenameOrganizationCommand, OrganizationDetailDto>
{
  constructor(
    private readonly organizations: OrganizationRepository,
    private readonly memberships: MembershipRepository,
  ) {}

  async handle(command: RenameOrganizationCommand): Promise<OrganizationDetailDto> {
    const organization = await this.organizations.findById(command.auth.organizationId);
    if (!organization) {
      throw AppError.notFound();
    }
    try {
      organization.rename(command.name);
    } catch (error) {
      throw AppError.badRequest('validation_error', (error as Error).message);
    }
    await this.organizations.update(organization);
    const members = await this.memberships.listForOrganization(organization.id);
    return {
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        plan: organization.plan,
        createdAt: organization.createdAt.toISOString(),
        membersCount: members.length,
      },
      members: members.map((member) => ({
        userId: member.userId,
        name: member.name,
        email: member.email,
        role: member.role,
        createdAt: member.createdAt.toISOString(),
      })),
    };
  }
}
