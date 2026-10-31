import { randomUUID } from 'node:crypto';
import type { CommandHandler } from '../../shared/kernel/command-bus.js';
import { AppError } from '../../shared/errors.js';
import type { Clock } from '../../shared/clock.js';

export const ANALYTICS_EVENTS = [
  'page_view',
  'cta_demo_click',
  'lead_submitted',
  'consent_accepted',
  'consent_rejected',
  'whatsapp_click',
  'login_click',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export interface AnalyticsRepository {
  insert(input: {
    id: string;
    name: AnalyticsEventName;
    path: string;
    props: Record<string, string | number | boolean>;
    createdAt: Date;
  }): Promise<void>;
}

export class RecordAnalyticsEventCommand {
  constructor(
    readonly name: AnalyticsEventName,
    readonly path: string,
    readonly props: Record<string, string | number | boolean>,
    readonly consent: boolean,
  ) {}
}

export class RecordAnalyticsEventHandler implements CommandHandler<RecordAnalyticsEventCommand, void> {
  constructor(
    private readonly repository: AnalyticsRepository,
    private readonly clock: Clock,
  ) {}

  async handle(command: RecordAnalyticsEventCommand): Promise<void> {
    if (!command.consent) {
      throw AppError.badRequest('validation_error', 'La analítica requiere consentimiento explícito.');
    }
    if (!ANALYTICS_EVENTS.includes(command.name)) {
      throw AppError.badRequest('validation_error', 'Evento de analítica no permitido.');
    }
    const path = command.path.startsWith('/') ? command.path.slice(0, 300) : '/';
    await this.repository.insert({
      id: randomUUID(),
      name: command.name,
      path,
      props: command.props,
      createdAt: this.clock.now(),
    });
  }
}
