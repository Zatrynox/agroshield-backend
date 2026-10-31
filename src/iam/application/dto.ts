import type { Role } from '../../shared/roles.js';

export interface UserDto {
  id: string;
  email: string;
  name: string;
}

export interface OrganizationDto {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

export interface SessionDto {
  user: UserDto;
  organization: OrganizationDto;
  role: Role;
  csrfToken: string;
  expiresAt: string;
}

export interface AuthResult extends SessionDto {
  sessionToken: string;
}
