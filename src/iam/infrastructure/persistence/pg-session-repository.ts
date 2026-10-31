import type { Db } from '../../../shared/db/db.js';
import { asDate, asNullableDate } from '../../../shared/db/rows.js';
import { Session } from '../../domain/model/session.js';
import type { SessionRepository } from '../../domain/repositories/iam-repositories.js';

interface SessionRow {
  id: string;
  token_hash: string;
  csrf_token: string;
  user_id: string;
  organization_id: string;
  expires_at: unknown;
  created_at: unknown;
  revoked_at: unknown;
  user_agent: string | null;
  ip_hash: string | null;
}

function toSession(row: SessionRow): Session {
  return Session.rehydrate({
    id: row.id,
    tokenHash: row.token_hash,
    csrfToken: row.csrf_token,
    userId: row.user_id,
    organizationId: row.organization_id,
    expiresAt: asDate(row.expires_at),
    createdAt: asDate(row.created_at),
    revokedAt: asNullableDate(row.revoked_at),
    userAgent: row.user_agent,
    ipHash: row.ip_hash,
  });
}

export class PgSessionRepository implements SessionRepository {
  constructor(private readonly db: Db) {}

  async insert(session: Session): Promise<void> {
    await this.db.query(
      `INSERT INTO sessions (id, token_hash, csrf_token, user_id, organization_id, expires_at, created_at, user_agent, ip_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        session.id,
        session.tokenHash,
        session.csrfToken,
        session.userId,
        session.organizationId,
        session.expiresAt,
        session.createdAt,
        session.userAgent,
        session.ipHash,
      ],
    );
  }

  async findByTokenHash(tokenHash: string): Promise<Session | null> {
    const result = await this.db.query<SessionRow>(
      `SELECT id, token_hash, csrf_token, user_id, organization_id, expires_at, created_at, revoked_at, user_agent, ip_hash
       FROM sessions WHERE token_hash = $1`,
      [tokenHash],
    );
    return result.rows[0] ? toSession(result.rows[0]) : null;
  }

  async revoke(sessionId: string, now: Date): Promise<void> {
    await this.db.query('UPDATE sessions SET revoked_at = $2 WHERE id = $1 AND revoked_at IS NULL', [
      sessionId,
      now,
    ]);
  }

  async revokeAllForUser(userId: string, now: Date): Promise<void> {
    await this.db.query('UPDATE sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL', [
      userId,
      now,
    ]);
  }
}
