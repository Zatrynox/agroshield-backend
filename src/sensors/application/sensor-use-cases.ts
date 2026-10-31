import { randomUUID } from 'node:crypto';
import type { CommandHandler } from '../../shared/kernel/command-bus.js';
import type { QueryHandler } from '../../shared/kernel/query-bus.js';
import type { AuthContext } from '../../shared/http/auth.js';
import { AppError } from '../../shared/errors.js';
import type { Clock } from '../../shared/clock.js';
import type { EventBus } from '../../shared/kernel/event-bus.js';
import { systemClock } from '../../shared/clock.js';
import type { AppConfig } from '../../config/env.js';
import type { ZoneRepository } from '../../farms/domain/repositories/farm-repositories.js';
import { Sensor, SensorDomainError } from '../domain/model/sensor.js';
import { SensorReading, ReadingDomainError, type ReadingInput } from '../domain/model/sensor-reading.js';
import type {
  ReadingRepository,
  SensorKeyService,
  SensorRepository,
} from '../domain/repositories/sensor-repositories.js';
import { canonicalReadingPayload } from '../domain/services/reading-payload.js';
import { SensorReadingReceived } from '../domain/events/sensor-reading-received.js';

export interface SensorDto {
  id: string;
  zoneId: string;
  name: string;
  status: 'active' | 'revoked';
  keyVersion: number;
  fingerprint: string;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
}

export interface SensorWithKeyDto {
  sensor: SensorDto;
  privateKeyPem: string;
  notice: string;
}

const KEY_NOTICE = 'Guarda esta clave privada ahora. No volverá a mostrarse. El servidor solo conserva la clave pública.';

function toSensorDto(sensor: Sensor): SensorDto {
  return {
    id: sensor.id,
    zoneId: sensor.zoneId,
    name: sensor.name,
    status: sensor.status,
    keyVersion: sensor.keyVersion,
    fingerprint: sensor.fingerprint,
    createdAt: sensor.createdAt.toISOString(),
    lastSeenAt: sensor.lastSeenAt?.toISOString() ?? null,
    revokedAt: sensor.revokedAt?.toISOString() ?? null,
  };
}

export class CreateSensorCommand {
  constructor(
    readonly auth: AuthContext,
    readonly zoneId: string,
    readonly name: string,
  ) {}
}

export class CreateSensorHandler implements CommandHandler<CreateSensorCommand, SensorWithKeyDto> {
  constructor(
    private readonly sensors: SensorRepository,
    private readonly zones: ZoneRepository,
    private readonly keys: SensorKeyService,
    private readonly clock: Clock,
  ) {}

  async handle(command: CreateSensorCommand): Promise<SensorWithKeyDto> {
    const zone = await this.zones.findById(command.auth.organizationId, command.zoneId);
    if (!zone) {
      throw AppError.notFound('La zona no existe o no pertenece a tu organización.');
    }
    const pair = this.keys.generate();
    try {
      const sensor = Sensor.register({
        id: randomUUID(),
        organizationId: command.auth.organizationId,
        zoneId: zone.id,
        name: command.name,
        publicKeyPem: pair.publicKeyPem,
        fingerprint: pair.fingerprint,
        createdAt: this.clock.now(),
      });
      await this.sensors.create(sensor);
      return { sensor: toSensorDto(sensor), privateKeyPem: pair.privateKeyPem, notice: KEY_NOTICE };
    } catch (error) {
      if (error instanceof SensorDomainError) {
        throw AppError.badRequest('validation_error', error.message);
      }
      throw error;
    }
  }
}

export class ListSensorsQuery {
  constructor(
    readonly auth: AuthContext,
    readonly zoneId: string,
  ) {}
}

export class ListSensorsHandler implements QueryHandler<ListSensorsQuery, SensorDto[]> {
  constructor(
    private readonly sensors: SensorRepository,
    private readonly zones: ZoneRepository,
  ) {}

  async handle(query: ListSensorsQuery): Promise<SensorDto[]> {
    const zone = await this.zones.findById(query.auth.organizationId, query.zoneId);
    if (!zone) {
      throw AppError.notFound('La zona no existe o no pertenece a tu organización.');
    }
    const sensors = await this.sensors.listByZone(query.auth.organizationId, query.zoneId);
    return sensors.map(toSensorDto);
  }
}

export class RotateSensorKeyCommand {
  constructor(
    readonly auth: AuthContext,
    readonly sensorId: string,
  ) {}
}

export class RotateSensorKeyHandler implements CommandHandler<RotateSensorKeyCommand, SensorWithKeyDto> {
  constructor(
    private readonly sensors: SensorRepository,
    private readonly keys: SensorKeyService,
  ) {}

  async handle(command: RotateSensorKeyCommand): Promise<SensorWithKeyDto> {
    const sensor = await this.sensors.findById(command.auth.organizationId, command.sensorId);
    if (!sensor) {
      throw AppError.notFound('El sensor no existe o no pertenece a tu organización.');
    }
    if (sensor.status === 'revoked') {
      throw AppError.conflict('sensor_revoked', 'El sensor está revocado y no puede rotar su clave.');
    }
    const pair = this.keys.generate();
    sensor.rotateKey(pair.publicKeyPem, pair.fingerprint);
    await this.sensors.update(sensor);
    return { sensor: toSensorDto(sensor), privateKeyPem: pair.privateKeyPem, notice: KEY_NOTICE };
  }
}

export class RevokeSensorCommand {
  constructor(
    readonly auth: AuthContext,
    readonly sensorId: string,
  ) {}
}

export class RevokeSensorHandler implements CommandHandler<RevokeSensorCommand, SensorDto> {
  constructor(
    private readonly sensors: SensorRepository,
    private readonly clock: Clock,
  ) {}

  async handle(command: RevokeSensorCommand): Promise<SensorDto> {
    const sensor = await this.sensors.findById(command.auth.organizationId, command.sensorId);
    if (!sensor) {
      throw AppError.notFound('El sensor no existe o no pertenece a tu organización.');
    }
    sensor.revoke(this.clock.now());
    await this.sensors.update(sensor);
    return toSensorDto(sensor);
  }
}

export class IngestReadingCommand {
  constructor(
    readonly sensorId: string,
    readonly timestamp: string,
    readonly signature: string,
    readonly reading: ReadingInput,
  ) {}
}

export interface IngestReadingResult {
  readingId: string;
  duplicate: boolean;
  acceptedAt: string;
}

export class IngestReadingHandler implements CommandHandler<IngestReadingCommand, IngestReadingResult> {
  constructor(
    private readonly sensors: SensorRepository,
    private readonly readings: ReadingRepository,
    private readonly zones: ZoneRepository,
    private readonly keys: SensorKeyService,
    private readonly events: EventBus,
    private readonly config: AppConfig,
    private readonly clock: Clock = systemClock,
  ) {}

  async handle(command: IngestReadingCommand): Promise<IngestReadingResult> {
    const sensor = await this.sensors.findByIdUnscoped(command.sensorId);
    if (!sensor) {
      throw new AppError(401, 'sensor_unauthorized', 'Sensor no autorizado', 'La firma o el dispositivo no son válidos.');
    }
    if (sensor.status === 'revoked') {
      throw new AppError(401, 'sensor_revoked', 'Sensor revocado', 'La clave del dispositivo fue revocada.');
    }

    const timestamp = new Date(command.timestamp);
    if (Number.isNaN(timestamp.getTime())) {
      throw new AppError(401, 'sensor_unauthorized', 'Sensor no autorizado', 'La marca de tiempo de la firma no es válida.');
    }
    const skew = Math.abs(this.clock.now().getTime() - timestamp.getTime()) / 1000;
    if (skew > this.config.sensorMaxSkewSeconds) {
      throw new AppError(
        401,
        'sensor_clock_skew',
        'Reloj del sensor fuera de rango',
        `La marca de tiempo debe estar dentro de ${this.config.sensorMaxSkewSeconds} segundos.`,
      );
    }

    const payload = canonicalReadingPayload(command.sensorId, command.timestamp, command.reading);
    if (!this.keys.verify(sensor.publicKeyPem, payload, command.signature)) {
      throw new AppError(401, 'sensor_unauthorized', 'Sensor no autorizado', 'La firma o el dispositivo no son válidos.');
    }

    let reading: SensorReading;
    try {
      reading = SensorReading.create({
        id: randomUUID(),
        sensorId: sensor.id,
        organizationId: sensor.organizationId,
        zoneId: sensor.zoneId,
        reading: command.reading,
        createdAt: this.clock.now(),
      });
    } catch (error) {
      if (error instanceof ReadingDomainError) {
        throw AppError.badRequest('validation_error', error.message);
      }
      throw error;
    }

    const { inserted, id: readingId } = await this.readings.insertIfAbsent(reading);
    if (!inserted) {
      return {
        readingId,
        duplicate: true,
        acceptedAt: this.clock.now().toISOString(),
      };
    }

    sensor.markSeen(this.clock.now());
    await this.sensors.update(sensor);

    const zone = await this.zones.findById(sensor.organizationId, sensor.zoneId);
    if (!zone) {
      throw AppError.notFound('La zona del sensor no está disponible.');
    }
    await this.events.publish(new SensorReadingReceived(reading, zone.cropType));

    return {
      readingId: reading.id,
      duplicate: false,
      acceptedAt: this.clock.now().toISOString(),
    };
  }
}

export interface ReadingDto {
  id: string;
  sensorId: string;
  clientReadingId: string;
  recordedAt: string;
  soilTempC: number;
  moisturePct: number;
  ph: number;
  nitrogenMgKg: number;
  phosphorusMgKg: number;
  potassiumMgKg: number;
  conductivityMsCm: number;
  pestIndex: number;
}

function toReadingDto(reading: SensorReading): ReadingDto {
  return {
    id: reading.id,
    sensorId: reading.sensorId,
    clientReadingId: reading.clientReadingId,
    recordedAt: reading.recordedAt.toISOString(),
    soilTempC: reading.soilTempC,
    moisturePct: reading.moisturePct,
    ph: reading.ph,
    nitrogenMgKg: reading.nitrogenMgKg,
    phosphorusMgKg: reading.phosphorusMgKg,
    potassiumMgKg: reading.potassiumMgKg,
    conductivityMsCm: reading.conductivityMsCm,
    pestIndex: reading.pestIndex,
  };
}

export class ListReadingsQuery {
  constructor(
    readonly auth: AuthContext,
    readonly zoneId: string,
    readonly limit: number,
  ) {}
}

export class ListReadingsHandler implements QueryHandler<ListReadingsQuery, ReadingDto[]> {
  constructor(
    private readonly readings: ReadingRepository,
    private readonly zones: ZoneRepository,
  ) {}

  async handle(query: ListReadingsQuery): Promise<ReadingDto[]> {
    const zone = await this.zones.findById(query.auth.organizationId, query.zoneId);
    if (!zone) {
      throw AppError.notFound('La zona no existe o no pertenece a tu organización.');
    }
    const readings = await this.readings.listRecentByZone(
      query.auth.organizationId,
      query.zoneId,
      Math.min(Math.max(query.limit, 1), 200),
    );
    return readings.map(toReadingDto);
  }
}
