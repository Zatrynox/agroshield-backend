import type { Sensor } from '../model/sensor.js';
import type { SensorReading } from '../model/sensor-reading.js';

export interface SensorKeyPair {
  publicKeyPem: string;
  privateKeyPem: string;
  fingerprint: string;
}

export interface SensorKeyService {
  generate(): SensorKeyPair;
  verify(publicKeyPem: string, payload: string, signatureBase64: string): boolean;
}

export interface SensorRepository {
  create(sensor: Sensor): Promise<void>;
  update(sensor: Sensor): Promise<void>;
  findById(organizationId: string, sensorId: string): Promise<Sensor | null>;
  findByIdUnscoped(sensorId: string): Promise<Sensor | null>;
  listByZone(organizationId: string, zoneId: string): Promise<Sensor[]>;
  countByZone(organizationId: string, zoneId: string): Promise<number>;
}

export interface ReadingRepository {
  insertIfAbsent(reading: SensorReading): Promise<{ inserted: boolean; id: string }>;
  latestByZone(organizationId: string, zoneId: string): Promise<SensorReading | null>;
  listRecentByZone(organizationId: string, zoneId: string, limit: number): Promise<SensorReading[]>;
  listSince(organizationId: string, zoneId: string, since: Date, limit: number): Promise<SensorReading[]>;
}
