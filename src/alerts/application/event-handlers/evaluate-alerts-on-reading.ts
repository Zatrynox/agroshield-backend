import { randomUUID } from 'node:crypto';
import type { EventHandler, EventBus } from '../../../shared/kernel/event-bus.js';
import type { Clock } from '../../../shared/clock.js';
import type { SensorReadingReceived } from '../../../sensors/domain/events/sensor-reading-received.js';
import type { ReadingRepository } from '../../../sensors/domain/repositories/sensor-repositories.js';
import { Alert } from '../../domain/model/alert.js';
import type { AlertRepository } from '../../domain/repositories/alert-repository.js';
import { AlertRules } from '../../domain/services/alert-rules.js';
import { AlertRaised } from '../../domain/events/alert-raised.js';

export class EvaluateAlertsOnReading implements EventHandler<SensorReadingReceived> {
  private readonly rules = new AlertRules();

  constructor(
    private readonly readings: ReadingRepository,
    private readonly alerts: AlertRepository,
    private readonly events: EventBus,
    private readonly clock: Clock,
  ) {}

  async handle(event: SensorReadingReceived): Promise<void> {
    const history = await this.readings.listRecentByZone(
      event.reading.organizationId,
      event.reading.zoneId,
      40,
    );
    const drafts = this.rules.evaluate({
      reading: event.reading,
      history,
      cropType: event.cropType,
      now: this.clock.now(),
    });

    for (const draft of drafts) {
      const alert = Alert.create({
        id: randomUUID(),
        organizationId: event.reading.organizationId,
        zoneId: event.reading.zoneId,
        draft,
        createdAt: this.clock.now(),
      });
      const inserted = await this.alerts.insertIfAbsent(alert);
      if (inserted) {
        await this.events.publish(new AlertRaised(alert));
      }
    }
  }
}
