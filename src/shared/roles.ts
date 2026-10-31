export const ROLES = ['owner', 'admin', 'agronomist', 'operator', 'viewer'] as const;
export type Role = (typeof ROLES)[number];
export const WRITE_ROLES: readonly Role[] = ['owner', 'admin', 'agronomist'];
