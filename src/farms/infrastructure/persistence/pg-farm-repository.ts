import type { Db } from '../../../shared/db/db.js';
import { asDate, asNumber } from '../../../shared/db/rows.js';
import { Farm, Zone } from '../../domain/model/farm.js';
import type { FarmRepository, ZoneRepository } from '../../domain/repositories/farm-repositories.js';

interface FarmRow {
  id: string;
  organization_id: string;
  name: string;
  location: string;
  area_hectares: string | number;
  created_at: unknown;
}

interface FarmSummaryRow extends FarmRow {
  zones_count: string | number;
}

interface ZoneRow {
  id: string;
  farm_id: string;
  organization_id: string;
  name: string;
  crop_type: string;
  area_hectares: string | number;
  created_at: unknown;
}

function toFarm(row: FarmRow): Farm {
  return Farm.rehydrate({
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    location: row.location,
    areaHectares: asNumber(row.area_hectares),
    createdAt: asDate(row.created_at),
  });
}

function toZone(row: ZoneRow): Zone {
  return Zone.rehydrate({
    id: row.id,
    farmId: row.farm_id,
    organizationId: row.organization_id,
    name: row.name,
    cropType: row.crop_type,
    areaHectares: asNumber(row.area_hectares),
    createdAt: asDate(row.created_at),
  });
}

export class PgFarmRepository implements FarmRepository {
  constructor(private readonly db: Db) {}

  async create(farm: Farm): Promise<void> {
    await this.db.query(
      'INSERT INTO farms (id, organization_id, name, location, area_hectares, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [farm.id, farm.organizationId, farm.name, farm.location, farm.areaHectares, farm.createdAt],
    );
  }

  async findById(organizationId: string, farmId: string): Promise<Farm | null> {
    const result = await this.db.query<FarmRow>(
      'SELECT id, organization_id, name, location, area_hectares, created_at FROM farms WHERE id = $1 AND organization_id = $2',
      [farmId, organizationId],
    );
    return result.rows[0] ? toFarm(result.rows[0]) : null;
  }

  async listSummaries(organizationId: string) {
    const result = await this.db.query<FarmSummaryRow>(
      `SELECT f.id, f.organization_id, f.name, f.location, f.area_hectares, f.created_at,
              COUNT(z.id)::int AS zones_count
       FROM farms f LEFT JOIN zones z ON z.farm_id = f.id
       WHERE f.organization_id = $1
       GROUP BY f.id
       ORDER BY f.created_at DESC`,
      [organizationId],
    );
    return result.rows.map((row) => ({ farm: toFarm(row), zonesCount: Number(row.zones_count) }));
  }
}

export class PgZoneRepository implements ZoneRepository {
  constructor(private readonly db: Db) {}

  async create(zone: Zone): Promise<void> {
    await this.db.query(
      'INSERT INTO zones (id, farm_id, organization_id, name, crop_type, area_hectares, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [zone.id, zone.farmId, zone.organizationId, zone.name, zone.cropType, zone.areaHectares, zone.createdAt],
    );
  }

  async findById(organizationId: string, zoneId: string): Promise<Zone | null> {
    const result = await this.db.query<ZoneRow>(
      'SELECT id, farm_id, organization_id, name, crop_type, area_hectares, created_at FROM zones WHERE id = $1 AND organization_id = $2',
      [zoneId, organizationId],
    );
    return result.rows[0] ? toZone(result.rows[0]) : null;
  }

  async listByFarm(organizationId: string, farmId: string): Promise<Zone[]> {
    const result = await this.db.query<ZoneRow>(
      'SELECT id, farm_id, organization_id, name, crop_type, area_hectares, created_at FROM zones WHERE farm_id = $1 AND organization_id = $2 ORDER BY created_at ASC',
      [farmId, organizationId],
    );
    return result.rows.map(toZone);
  }

  async countByFarm(organizationId: string, farmId: string): Promise<number> {
    const result = await this.db.query<{ count: string | number }>(
      'SELECT COUNT(*)::int AS count FROM zones WHERE farm_id = $1 AND organization_id = $2',
      [farmId, organizationId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }
}
