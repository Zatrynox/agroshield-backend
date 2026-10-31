import type { Db } from '../../../shared/db/db.js';
import { asDate } from '../../../shared/db/rows.js';
import type { Role } from '../../../shared/roles.js';
import { Membership, Organization } from '../../domain/model/organization.js';
import type {
  MembershipRepository,
  MembershipView,
  OrganizationRepository,
} from '../../domain/repositories/organization-repositories.js';

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  created_at: unknown;
}

interface MembershipRow {
  user_id: string;
  organization_id: string;
  role: Role;
  created_at: unknown;
}

interface MembershipViewRow extends MembershipRow {
  name: string;
  email: string;
}

function toOrganization(row: OrganizationRow): Organization {
  return Organization.rehydrate({
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: row.plan,
    createdAt: asDate(row.created_at),
  });
}

function toMembership(row: MembershipRow): Membership {
  return Membership.rehydrate({
    userId: row.user_id,
    organizationId: row.organization_id,
    role: row.role,
    createdAt: asDate(row.created_at),
  });
}

export class PgOrganizationRepository implements OrganizationRepository {
  constructor(private readonly db: Db) {}

  async create(organization: Organization): Promise<void> {
    await this.db.query(
      'INSERT INTO organizations (id, name, slug, plan, created_at) VALUES ($1, $2, $3, $4, $5)',
      [organization.id, organization.name, organization.slug, organization.plan, organization.createdAt],
    );
  }

  async update(organization: Organization): Promise<void> {
    await this.db.query('UPDATE organizations SET name = $2, plan = $3 WHERE id = $1', [
      organization.id,
      organization.name,
      organization.plan,
    ]);
  }

  async findById(id: string): Promise<Organization | null> {
    const result = await this.db.query<OrganizationRow>(
      'SELECT id, name, slug, plan, created_at FROM organizations WHERE id = $1',
      [id],
    );
    return result.rows[0] ? toOrganization(result.rows[0]) : null;
  }

  async findBySlug(slug: string): Promise<Organization | null> {
    const result = await this.db.query<OrganizationRow>(
      'SELECT id, name, slug, plan, created_at FROM organizations WHERE slug = $1',
      [slug],
    );
    return result.rows[0] ? toOrganization(result.rows[0]) : null;
  }

  async deleteById(id: string): Promise<void> {
    await this.db.query('DELETE FROM organizations WHERE id = $1', [id]);
  }

  async countMembers(organizationId: string): Promise<number> {
    const result = await this.db.query<{ count: string | number }>(
      'SELECT COUNT(*)::int AS count FROM memberships WHERE organization_id = $1',
      [organizationId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }
}

export class PgMembershipRepository implements MembershipRepository {
  constructor(private readonly db: Db) {}

  async add(membership: Membership): Promise<void> {
    await this.db.query(
      'INSERT INTO memberships (user_id, organization_id, role, created_at) VALUES ($1, $2, $3, $4)',
      [membership.userId, membership.organizationId, membership.role, membership.createdAt],
    );
  }

  async findForUser(userId: string, organizationId: string): Promise<Membership | null> {
    const result = await this.db.query<MembershipRow>(
      'SELECT user_id, organization_id, role, created_at FROM memberships WHERE user_id = $1 AND organization_id = $2',
      [userId, organizationId],
    );
    return result.rows[0] ? toMembership(result.rows[0]) : null;
  }

  async listForUser(userId: string): Promise<Membership[]> {
    const result = await this.db.query<MembershipRow>(
      'SELECT user_id, organization_id, role, created_at FROM memberships WHERE user_id = $1 ORDER BY created_at ASC',
      [userId],
    );
    return result.rows.map(toMembership);
  }

  async listForOrganization(organizationId: string): Promise<MembershipView[]> {
    const result = await this.db.query<MembershipViewRow>(
      `SELECT m.user_id, m.organization_id, m.role, m.created_at, u.name, u.email
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = $1 ORDER BY m.created_at ASC`,
      [organizationId],
    );
    return result.rows.map((row) => ({
      userId: row.user_id,
      name: row.name,
      email: row.email,
      role: row.role,
      createdAt: asDate(row.created_at),
    }));
  }
}
