import type { DomainEvent } from '../../../shared/kernel/event-bus.js';
import type { Alert } from '../model/alert.js';

export class AlertRaised implements DomainEvent {
  readonly eventName = 'alerts.raised';
  readonly occurredAt = new Date();

  constructor(readonly alert: Alert) {}
}
