import { randomUUID } from 'node:crypto';
import type { CommandHandler } from '../../shared/kernel/command-bus.js';
import { AppError } from '../../shared/errors.js';
import type { Clock } from '../../shared/clock.js';
import { sha256 } from '../../shared/crypto.js';
import type { LeadRepository } from '../domain/repositories/lead-repository.js';
import { Lead, LeadDomainError } from '../domain/model/lead.js';
import type { CaptchaUseRepository } from '../infrastructure/persistence/pg-captcha-use-repository.js';
import type { CaptchaService } from './captcha-service.js';

export interface CreateLeadInput {
  name: string;
  email: string;
  company: string;
  phone?: string;
  message: string;
  consent: boolean;
  website?: string;
  captchaChallenge: string;
  captchaSolution: string;
}

export class CreateLeadCommand {
  constructor(
    readonly input: CreateLeadInput,
    readonly meta: { ipHash: string | null; userAgent: string | null },
  ) {}
}

export interface CreateLeadResult {
  id: string;
  receivedAt: string;
}

export class CreateLeadHandler implements CommandHandler<CreateLeadCommand, CreateLeadResult> {
  constructor(
    private readonly leads: LeadRepository,
    private readonly captcha: CaptchaService,
    private readonly captchaUses: CaptchaUseRepository,
    private readonly clock: Clock,
  ) {}

  async handle(command: CreateLeadCommand): Promise<CreateLeadResult> {
    if (command.input.website && command.input.website.trim() !== '') {
      throw AppError.badRequest('validation_error', 'No se pudo validar el formulario.');
    }

    const { expiresAt } = this.captcha.verify(
      command.input.captchaChallenge,
      command.input.captchaSolution,
    );
    const consumed = await this.captchaUses.consume(
      sha256(command.input.captchaChallenge),
      expiresAt,
    );
    if (!consumed) {
      throw AppError.badRequest(
        'captcha_invalid',
        'El desafío ya se utilizó. Recarga la página e inténtalo de nuevo.',
      );
    }

    try {
      const lead = Lead.create({
        id: randomUUID(),
        name: command.input.name,
        email: command.input.email,
        company: command.input.company,
        phone: command.input.phone,
        message: command.input.message,
        consent: command.input.consent,
        source: 'landing',
        ipHash: command.meta.ipHash,
        userAgent: command.meta.userAgent,
        createdAt: this.clock.now(),
      });
      await this.leads.insert(lead);
      return { id: lead.id, receivedAt: lead.createdAt.toISOString() };
    } catch (error) {
      if (error instanceof LeadDomainError) {
        throw AppError.badRequest('validation_error', error.message);
      }
      throw error;
    }
  }
}
