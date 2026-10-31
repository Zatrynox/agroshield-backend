export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

export class User {
  private constructor(
    public readonly id: string,
    public readonly email: string,
    public name: string,
    public passwordHash: string,
    public failedAttempts: number,
    public lockedUntil: Date | null,
    public readonly createdAt: Date,
  ) {}

  static register(input: {
    id: string;
    email: string;
    name: string;
    passwordHash: string;
    createdAt?: Date;
  }): User {
    return new User(
      input.id,
      input.email.trim().toLowerCase(),
      input.name.trim(),
      input.passwordHash,
      0,
      null,
      input.createdAt ?? new Date(),
    );
  }

  static rehydrate(input: {
    id: string;
    email: string;
    name: string;
    passwordHash: string;
    failedAttempts: number;
    lockedUntil: Date | null;
    createdAt: Date;
  }): User {
    return new User(
      input.id,
      input.email,
      input.name,
      input.passwordHash,
      input.failedAttempts,
      input.lockedUntil,
      input.createdAt,
    );
  }

  get emailNormalized(): string {
    return this.email.toLowerCase();
  }

  isLocked(now: Date): boolean {
    return this.lockedUntil !== null && this.lockedUntil.getTime() > now.getTime();
  }

  registerFailedLogin(now: Date): void {
    this.failedAttempts += 1;
    if (this.failedAttempts >= MAX_LOGIN_ATTEMPTS) {
      this.lockedUntil = new Date(now.getTime() + LOCK_MINUTES * 60_000);
    }
  }

  resetLoginFailures(): void {
    this.failedAttempts = 0;
    this.lockedUntil = null;
  }

  rename(name: string): void {
    const next = name.trim();
    if (next.length < 2 || next.length > 120) {
      throw new PasswordPolicyError('El nombre debe tener entre 2 y 120 caracteres.');
    }
    this.name = next;
  }
}

export class PasswordPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasswordPolicyError';
  }
}

export class PasswordPolicy {
  static validate(password: string): void {
    if (password.length < 12) {
      throw new PasswordPolicyError('La contraseña debe tener al menos 12 caracteres.');
    }
    if (password.length > 128) {
      throw new PasswordPolicyError('La contraseña no puede superar 128 caracteres.');
    }
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
      throw new PasswordPolicyError('La contraseña debe incluir mayúsculas y minúsculas.');
    }
    if (!/[0-9]/.test(password)) {
      throw new PasswordPolicyError('La contraseña debe incluir al menos un número.');
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
      throw new PasswordPolicyError('La contraseña debe incluir al menos un símbolo.');
    }
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Correo o contraseña incorrectos.');
    this.name = 'InvalidCredentialsError';
  }
}
