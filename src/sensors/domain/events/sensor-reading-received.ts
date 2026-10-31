import type { DomainEvent } from '../../../shared/kernel/event-bus.js';
import type { SensorReading } from '../../domain/model/sensor-reading.js';

export class SensorReadingReceived implements DomainEvent {
  readonly eventName = 'sensors.reading.received';
  readonly occurredAt: Date;

  constructor(
    readonly reading: SensorReading,
    readonly cropType: string,
  ) {
    this.occurredAt = new Date();
  }
}
