import type { Db } from '../../../shared/db/db.js';
import { asDate, asNullableDate } from '../../../shared/db/rows.js';
import { User } from '../../domain/model/user.js';
import type { UserRepository } from '../../domain/repositories/iam-repositories.js';

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  failed_attempts: number | string;
  locked_until: unknown;
  created_at: unknown;
}

function toUser(row: UserRow): User {
  return User.rehydrate({
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    failedAttempts: Number(row.failed_attempts),
    lockedUntil: asNullableDate(row.locked_until),
    createdAt: asDate(row.created_at),
  });
}

export class PgUserRepository implements UserRepository {
  constructor(private readonly db: Db) {}

  async findByEmail(emailNormalized: string): Promise<User | null> {
    const result = await this.db.query<UserRow>(
      'SELECT id, email, name, password_hash, failed_attempts, locked_until, created_at FROM users WHERE email_normalized = $1',
      [emailNormalized],
    );
    return result.rows[0] ? toUser(result.rows[0]) : null;
  }

  async findById(id: string): Promise<User | null> {
    const result = await this.db.query<UserRow>(
      'SELECT id, email, name, password_hash, failed_attempts, locked_until, created_at FROM users WHERE id = $1',
      [id],
    );
    return result.rows[0] ? toUser(result.rows[0]) : null;
  }

  async insert(user: User): Promise<void> {
    await this.db.query(
      `INSERT INTO users (id, email, email_normalized, name, password_hash, failed_attempts, locked_until, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        user.id,
        user.email,
        user.emailNormalized,
        user.name,
        user.passwordHash,
        user.failedAttempts,
        user.lockedUntil,
        user.createdAt,
      ],
    );
  }

  async update(user: User): Promise<void> {
    await this.db.query(
      `UPDATE users SET email = $2, name = $3, password_hash = $4, failed_attempts = $5, locked_until = $6 WHERE id = $1`,
      [user.id, user.email, user.name, user.passwordHash, user.failedAttempts, user.lockedUntil],
    );
  }

  async deleteById(id: string): Promise<void> {
    await this.db.query('DELETE FROM users WHERE id = $1', [id]);
  }
}
