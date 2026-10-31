import { createHmac, createHash, randomBytes } from 'node:crypto';
import { safeEqual } from '../../shared/crypto.js';
import { AppError } from '../../shared/errors.js';
import type { Clock } from '../../shared/clock.js';

export interface CaptchaChallenge {
  challenge: string;
  difficulty: number;
  expiresAt: string;
}

/**
 * Self-hosted proof-of-work captcha. Friendly for humans (it runs in the
 * browser), server-validated, no third-party keys and no tracking.
 */
export class CaptchaService {
  constructor(
    private readonly secret: string,
    private readonly difficulty: number,
    private readonly clock: Clock,
    private readonly ttlMinutes = 10,
  ) {}

  issue(): CaptchaChallenge {
    const expiresAt = this.clock.now().getTime() + this.ttlMinutes * 60_000;
    const nonce = randomBytes(16).toString('base64url');
    const signature = this.sign(`${expiresAt}.${nonce}`);
    return {
      challenge: `${expiresAt}.${nonce}.${signature}`,
      difficulty: this.difficulty,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  verify(challenge: string, solution: string): { expiresAt: Date } {
    const parts = challenge.split('.');
    if (parts.length !== 3) {
      throw new AppError(400, 'captcha_invalid', 'Verificación anti-spam', 'El desafío no es válido.');
    }
    const [expiresRaw, nonce, signature] = parts as [string, string, string];
    const expiresAt = Number(expiresRaw);
    if (!Number.isFinite(expiresAt) || expiresAt < this.clock.now().getTime()) {
      throw new AppError(400, 'captcha_expired', 'Verificación anti-spam', 'El desafío expiró. Recarga la página.');
    }
    const expected = this.sign(`${expiresAt}.${nonce}`);
    if (!safeEqual(signature, expected)) {
      throw new AppError(400, 'captcha_invalid', 'Verificación anti-spam', 'El desafío no es válido.');
    }
    if (!/^[A-Za-z0-9]{1,64}$/.test(solution)) {
      throw new AppError(400, 'captcha_invalid', 'Verificación anti-spam', 'La solución no es válida.');
    }
    const hash = createHash('sha256').update(`${challenge}:${solution}`).digest('hex');
    if (!hash.startsWith('0'.repeat(this.difficulty))) {
      throw new AppError(400, 'captcha_invalid', 'Verificación anti-spam', 'La verificación no se completó.');
    }
    return { expiresAt: new Date(expiresAt) };
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('base64url');
  }
}
