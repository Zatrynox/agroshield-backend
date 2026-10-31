export class Sensor {
  private constructor(
    public readonly id: string,
    public readonly organizationId: string,
    public readonly zoneId: string,
    public name: string,
    public publicKeyPem: string,
    public fingerprint: string,
    public status: 'active' | 'revoked',
    public keyVersion: number,
    public readonly createdAt: Date,
    public revokedAt: Date | null,
    public lastSeenAt: Date | null,
  ) {}

  static register(input: {
    id: string;
    organizationId: string;
    zoneId: string;
    name: string;
    publicKeyPem: string;
    fingerprint: string;
    createdAt?: Date;
  }): Sensor {
    const name = input.name.trim();
    if (name.length < 2 || name.length > 120) {
      throw new SensorDomainError('El nombre del sensor debe tener entre 2 y 120 caracteres.');
    }
    return new Sensor(
      input.id,
      input.organizationId,
      input.zoneId,
      name,
      input.publicKeyPem,
      input.fingerprint,
      'active',
      1,
      input.createdAt ?? new Date(),
      null,
      null,
    );
  }

  static rehydrate(input: {
    id: string;
    organizationId: string;
    zoneId: string;
    name: string;
    publicKeyPem: string;
    fingerprint: string;
    status: 'active' | 'revoked';
    keyVersion: number;
    createdAt: Date;
    revokedAt: Date | null;
    lastSeenAt: Date | null;
  }): Sensor {
    return new Sensor(
      input.id,
      input.organizationId,
      input.zoneId,
      input.name,
      input.publicKeyPem,
      input.fingerprint,
      input.status,
      input.keyVersion,
      input.createdAt,
      input.revokedAt,
      input.lastSeenAt,
    );
  }

  rotateKey(publicKeyPem: string, fingerprint: string): void {
    if (this.status === 'revoked') {
      throw new SensorDomainError('Un sensor revocado no puede rotar su clave.');
    }
    this.publicKeyPem = publicKeyPem;
    this.fingerprint = fingerprint;
    this.keyVersion += 1;
  }

  revoke(now: Date): void {
    this.status = 'revoked';
    this.revokedAt = now;
  }

  markSeen(now: Date): void {
    this.lastSeenAt = now;
  }
}

export class SensorDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SensorDomainError';
  }
}
