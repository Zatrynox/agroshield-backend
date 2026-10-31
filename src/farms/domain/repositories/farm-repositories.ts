import type { Farm, Zone } from '../model/farm.js';

export interface FarmSummary {
  farm: Farm;
  zonesCount: number;
}

export interface FarmRepository {
  create(farm: Farm): Promise<void>;
  findById(organizationId: string, farmId: string): Promise<Farm | null>;
  listSummaries(organizationId: string): Promise<FarmSummary[]>;
}

export interface ZoneRepository {
  create(zone: Zone): Promise<void>;
  findById(organizationId: string, zoneId: string): Promise<Zone | null>;
  listByFarm(organizationId: string, farmId: string): Promise<Zone[]>;
  countByFarm(organizationId: string, farmId: string): Promise<number>;
}
