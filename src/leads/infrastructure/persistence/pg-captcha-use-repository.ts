import type { Db } from '../../../shared/db/db.js';

export interface CaptchaUseRepository {
  /** Returns false when the challenge was already consumed (replay). */
  consume(challengeHash: string, expiresAt: Date): Promise<boolean>;
}

export class PgCaptchaUseRepository implements CaptchaUseRepository {
  constructor(private readonly db: Db) {}

  async consume(challengeHash: string, expiresAt: Date): Promise<boolean> {
    const result = await this.db.query<{ challenge_hash: string }>(
      `INSERT INTO captcha_uses (challenge_hash, expires_at)
       VALUES ($1, $2)
       ON CONFLICT (challenge_hash) DO NOTHING
       RETURNING challenge_hash`,
      [challengeHash, expiresAt],
    );
    return result.rows.length > 0;
  }
}
