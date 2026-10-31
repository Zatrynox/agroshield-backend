import type { Db } from '../../../shared/db/db.js';
import { asDate, asNullableDate, asNumber } from '../../../shared/db/rows.js';
import { Sensor } from '../../domain/model/sensor.js';
import { SensorReading, type ReadingInput } from '../../domain/model/sensor-reading.js';
import type { ReadingRepository, SensorRepository } from '../../domain/repositories/sensor-repositories.js';

interface SensorRow {
  id: string;
  organization_id: string;
  zone_id: string;
  name: string;
  public_key_pem: string;
  fingerprint: string;
  status: 'active' | 'revoked';
  key_version: number;
  created_at: unknown;
  revoked_at: unknown;
  last_seen_at: unknown;
}

interface ReadingRow {
  id: string;
  sensor_id: string;
  organization_id: string;
  zone_id: string;
  client_reading_id: string;
  recorded_at: unknown;
  soil_temp_c: string | number;
  moisture_pct: string | number;
  ph: string | number;
  nitrogen_mg_kg: string | number;
  phosphorus_mg_kg: string | number;
  potassium_mg_kg: string | number;
  conductivity_ms_cm: string | number;
  pest_index: string | number;
  created_at: unknown;
}

function toSensor(row: SensorRow): Sensor {
  return Sensor.rehydrate({
    id: row.id,
    organizationId: row.organization_id,
    zoneId: row.zone_id,
    name: row.name,
    publicKeyPem: row.public_key_pem,
    fingerprint: row.fingerprint,
    status: row.status,
    keyVersion: Number(row.key_version),
    createdAt: asDate(row.created_at),
    revokedAt: asNullableDate(row.revoked_at),
    lastSeenAt: asNullableDate(row.last_seen_at),
  });
}

function toReading(row: ReadingRow): SensorReading {
  const reading: ReadingInput = {
    clientReadingId: row.client_reading_id,
    recordedAt: asDate(row.recorded_at).toISOString(),
    soilTempC: asNumber(row.soil_temp_c),
    moisturePct: asNumber(row.moisture_pct),
    ph: asNumber(row.ph),
    nitrogenMgKg: asNumber(row.nitrogen_mg_kg),
    phosphorusMgKg: asNumber(row.phosphorus_mg_kg),
    potassiumMgKg: asNumber(row.potassium_mg_kg),
    conductivityMsCm: asNumber(row.conductivity_ms_cm),
    pestIndex: asNumber(row.pest_index),
  };
  return SensorReading.rehydrate({
    id: row.id,
    sensorId: row.sensor_id,
    organizationId: row.organization_id,
    zoneId: row.zone_id,
    reading,
    createdAt: asDate(row.created_at),
  });
}

const SENSOR_COLUMNS =
  'id, organization_id, zone_id, name, public_key_pem, fingerprint, status, key_version, created_at, revoked_at, last_seen_at';
const READING_COLUMNS =
  'id, sensor_id, organization_id, zone_id, client_reading_id, recorded_at, soil_temp_c, moisture_pct, ph, nitrogen_mg_kg, phosphorus_mg_kg, potassium_mg_kg, conductivity_ms_cm, pest_index, created_at';

export class PgSensorRepository implements SensorRepository {
  constructor(private readonly db: Db) {}

  async create(sensor: Sensor): Promise<void> {
    await this.db.query(
      `INSERT INTO sensors (id, organization_id, zone_id, name, public_key_pem, fingerprint, status, key_version, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        sensor.id,
        sensor.organizationId,
        sensor.zoneId,
        sensor.name,
        sensor.publicKeyPem,
        sensor.fingerprint,
        sensor.status,
        sensor.keyVersion,
        sensor.createdAt,
      ],
    );
  }

  async update(sensor: Sensor): Promise<void> {
    await this.db.query(
      `UPDATE sensors
       SET name = $2, public_key_pem = $3, fingerprint = $4, status = $5, key_version = $6, revoked_at = $7, last_seen_at = $8
       WHERE id = $1`,
      [
        sensor.id,
        sensor.name,
        sensor.publicKeyPem,
        sensor.fingerprint,
        sensor.status,
        sensor.keyVersion,
        sensor.revokedAt,
        sensor.lastSeenAt,
      ],
    );
  }

  async findById(organizationId: string, sensorId: string): Promise<Sensor | null> {
    const result = await this.db.query<SensorRow>(
      `SELECT ${SENSOR_COLUMNS} FROM sensors WHERE id = $1 AND organization_id = $2`,
      [sensorId, organizationId],
    );
    return result.rows[0] ? toSensor(result.rows[0]) : null;
  }

  async findByIdUnscoped(sensorId: string): Promise<Sensor | null> {
    const result = await this.db.query<SensorRow>(
      `SELECT ${SENSOR_COLUMNS} FROM sensors WHERE id = $1`,
      [sensorId],
    );
    return result.rows[0] ? toSensor(result.rows[0]) : null;
  }

  async listByZone(organizationId: string, zoneId: string): Promise<Sensor[]> {
    const result = await this.db.query<SensorRow>(
      `SELECT ${SENSOR_COLUMNS} FROM sensors WHERE zone_id = $1 AND organization_id = $2 ORDER BY created_at ASC`,
      [zoneId, organizationId],
    );
    return result.rows.map(toSensor);
  }

  async countByZone(organizationId: string, zoneId: string): Promise<number> {
    const result = await this.db.query<{ count: string | number }>(
      'SELECT COUNT(*)::int AS count FROM sensors WHERE zone_id = $1 AND organization_id = $2',
      [zoneId, organizationId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }
}

export class PgReadingRepository implements ReadingRepository {
  constructor(private readonly db: Db) {}

  async insertIfAbsent(reading: SensorReading): Promise<{ inserted: boolean; id: string }> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO sensor_readings
       (id, sensor_id, organization_id, zone_id, client_reading_id, recorded_at, soil_temp_c, moisture_pct, ph, nitrogen_mg_kg, phosphorus_mg_kg, potassium_mg_kg, conductivity_ms_cm, pest_index, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (sensor_id, client_reading_id) DO NOTHING
       RETURNING id`,
      [
        reading.id,
        reading.sensorId,
        reading.organizationId,
        reading.zoneId,
        reading.clientReadingId,
        reading.recordedAt,
        reading.soilTempC,
        reading.moisturePct,
        reading.ph,
        reading.nitrogenMgKg,
        reading.phosphorusMgKg,
        reading.potassiumMgKg,
        reading.conductivityMsCm,
        reading.pestIndex,
        reading.createdAt,
      ],
    );
    if (result.rows[0]) {
      return { inserted: true, id: result.rows[0].id };
    }
    const existing = await this.db.query<{ id: string }>(
      `SELECT id FROM sensor_readings WHERE sensor_id = $1 AND client_reading_id = $2`,
      [reading.sensorId, reading.clientReadingId],
    );
    const id = existing.rows[0]?.id;
    if (!id) {
      throw new Error('A conflicting reading could not be resolved');
    }
    return { inserted: false, id };
  }

  async latestByZone(organizationId: string, zoneId: string): Promise<SensorReading | null> {
    const result = await this.db.query<ReadingRow>(
      `SELECT ${READING_COLUMNS} FROM sensor_readings
       WHERE organization_id = $1 AND zone_id = $2 ORDER BY recorded_at DESC LIMIT 1`,
      [organizationId, zoneId],
    );
    return result.rows[0] ? toReading(result.rows[0]) : null;
  }

  async listRecentByZone(organizationId: string, zoneId: string, limit: number): Promise<SensorReading[]> {
    const result = await this.db.query<ReadingRow>(
      `SELECT ${READING_COLUMNS} FROM sensor_readings
       WHERE organization_id = $1 AND zone_id = $2 ORDER BY recorded_at DESC LIMIT $3`,
      [organizationId, zoneId, limit],
    );
    return result.rows.map(toReading);
  }

  async listSince(
    organizationId: string,
    zoneId: string,
    since: Date,
    limit: number,
  ): Promise<SensorReading[]> {
    const result = await this.db.query<ReadingRow>(
      `SELECT ${READING_COLUMNS} FROM sensor_readings
       WHERE organization_id = $1 AND zone_id = $2 AND recorded_at >= $3
       ORDER BY recorded_at DESC LIMIT $4`,
      [organizationId, zoneId, since, limit],
    );
    return result.rows.map(toReading);
  }
}
