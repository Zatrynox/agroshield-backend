import type { Role } from '../../../shared/roles.js';

export class Organization {
  private constructor(
    public readonly id: string,
    public name: string,
    public readonly slug: string,
    public plan: string,
    public readonly createdAt: Date,
  ) {}

  static create(input: { id: string; name: string; slug: string; plan?: string; createdAt?: Date }): Organization {
    const name = input.name.trim();
    if (name.length < 2 || name.length > 160) {
      throw new DomainError('El nombre de la organización debe tener entre 2 y 160 caracteres.');
    }
    return new Organization(input.id, name, input.slug, input.plan ?? 'trial', input.createdAt ?? new Date());
  }

  static rehydrate(input: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    createdAt: Date;
  }): Organization {
    return new Organization(input.id, input.name, input.slug, input.plan, input.createdAt);
  }

  rename(name: string): void {
    const next = name.trim();
    if (next.length < 2 || next.length > 160) {
      throw new DomainError('El nombre de la organización debe tener entre 2 y 160 caracteres.');
    }
    this.name = next;
  }
}

export class Membership {
  private constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public role: Role,
    public readonly createdAt: Date,
  ) {}

  static create(input: {
    userId: string;
    organizationId: string;
    role: Role;
    createdAt?: Date;
  }): Membership {
    return new Membership(input.userId, input.organizationId, input.role, input.createdAt ?? new Date());
  }

  static rehydrate(input: {
    userId: string;
    organizationId: string;
    role: Role;
    createdAt: Date;
  }): Membership {
    return new Membership(input.userId, input.organizationId, input.role, input.createdAt);
  }
}

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}
