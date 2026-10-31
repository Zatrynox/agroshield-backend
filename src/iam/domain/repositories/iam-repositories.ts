import type { Session } from '../model/session.js';
import type { User } from '../model/user.js';

export interface UserRepository {
  findByEmail(emailNormalized: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  insert(user: User): Promise<void>;
  update(user: User): Promise<void>;
  deleteById(id: string): Promise<void>;
}

export interface SessionRepository {
  insert(session: Session): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<Session | null>;
  revoke(sessionId: string, now: Date): Promise<void>;
  revokeAllForUser(userId: string, now: Date): Promise<void>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
  verifyDummy(password: string): Promise<void>;
}
