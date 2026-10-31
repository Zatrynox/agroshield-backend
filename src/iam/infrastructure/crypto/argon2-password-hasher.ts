import { Algorithm, hash, verify } from '@node-rs/argon2';
import { randomToken } from '../../../shared/crypto.js';
import type { PasswordHasher } from '../../domain/repositories/iam-repositories.js';

const OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export class Argon2PasswordHasher implements PasswordHasher {
  private dummyHash: string | null = null;

  async hash(password: string): Promise<string> {
    return hash(password, OPTIONS);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password, OPTIONS);
    } catch {
      return false;
    }
  }

  async verifyDummy(password: string): Promise<void> {
    if (!this.dummyHash) {
      this.dummyHash = await this.hash(randomToken(24));
    }
    await this.verify(this.dummyHash, password);
  }
}
