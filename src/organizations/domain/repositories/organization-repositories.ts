import type { Role } from '../../../shared/roles.js';
import type { Membership, Organization } from '../model/organization.js';

export interface OrganizationRepository {
  create(organization: Organization): Promise<void>;
  update(organization: Organization): Promise<void>;
  findById(id: string): Promise<Organization | null>;
  findBySlug(slug: string): Promise<Organization | null>;
  deleteById(id: string): Promise<void>;
  countMembers(organizationId: string): Promise<number>;
}

export interface MembershipRepository {
  add(membership: Membership): Promise<void>;
  findForUser(userId: string, organizationId: string): Promise<Membership | null>;
  listForUser(userId: string): Promise<Membership[]>;
  listForOrganization(organizationId: string): Promise<MembershipView[]>;
}

export interface MembershipView {
  userId: string;
  name: string;
  email: string;
  role: Role;
  createdAt: Date;
}
