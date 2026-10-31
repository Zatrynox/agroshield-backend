export class Session {
  private constructor(
    public readonly id: string,
    public readonly tokenHash: string,
    public readonly csrfToken: string,
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly expiresAt: Date,
    public readonly createdAt: Date,
    public revokedAt: Date | null,
    public readonly userAgent: string | null,
    public readonly ipHash: string | null,
  ) {}

  static issue(input: {
    id: string;
    tokenHash: string;
    csrfToken: string;
    userId: string;
    organizationId: string;
    expiresAt: Date;
    createdAt?: Date;
    userAgent?: string | null;
    ipHash?: string | null;
  }): Session {
    return new Session(
      input.id,
      input.tokenHash,
      input.csrfToken,
      input.userId,
      input.organizationId,
      input.expiresAt,
      input.createdAt ?? new Date(),
      null,
      input.userAgent ?? null,
      input.ipHash ?? null,
    );
  }

  static rehydrate(input: {
    id: string;
    tokenHash: string;
    csrfToken: string;
    userId: string;
    organizationId: string;
    expiresAt: Date;
    createdAt: Date;
    revokedAt: Date | null;
    userAgent: string | null;
    ipHash: string | null;
  }): Session {
    return new Session(
      input.id,
      input.tokenHash,
      input.csrfToken,
      input.userId,
      input.organizationId,
      input.expiresAt,
      input.createdAt,
      input.revokedAt,
      input.userAgent,
      input.ipHash,
    );
  }

  isActive(now: Date): boolean {
    return this.revokedAt === null && this.expiresAt.getTime() > now.getTime();
  }
}
