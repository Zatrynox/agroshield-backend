import { randomUUID } from 'node:crypto';
import type { CommandHandler } from '../../shared/kernel/command-bus.js';
import type { QueryHandler } from '../../shared/kernel/query-bus.js';
import type { AuthContext } from '../../shared/http/auth.js';
import { AppError } from '../../shared/errors.js';
import type { Clock } from '../../shared/clock.js';
import type { FarmRepository, ZoneRepository } from '../domain/repositories/farm-repositories.js';
import { Farm, FarmDomainError, Zone } from '../domain/model/farm.js';

export interface FarmDto {
  id: string;
  name: string;
  location: string;
  areaHectares: number;
  zonesCount: number;
  createdAt: string;
}

export interface ZoneDto {
  id: string;
  farmId: string;
  name: string;
  cropType: string;
  areaHectares: number;
  createdAt: string;
}

export interface FarmDetailDto {
  farm: FarmDto;
  zones: ZoneDto[];
}

function toFarmDto(farm: Farm, zonesCount: number): FarmDto {
  return {
    id: farm.id,
    name: farm.name,
    location: farm.location,
    areaHectares: farm.areaHectares,
    zonesCount,
    createdAt: farm.createdAt.toISOString(),
  };
}

function toZoneDto(zone: Zone): ZoneDto {
  return {
    id: zone.id,
    farmId: zone.farmId,
    name: zone.name,
    cropType: zone.cropType,
    areaHectares: zone.areaHectares,
    createdAt: zone.createdAt.toISOString(),
  };
}

export class CreateFarmCommand {
  constructor(
    readonly auth: AuthContext,
    readonly input: { name: string; location: string; areaHectares: number },
  ) {}
}

export class CreateFarmHandler implements CommandHandler<CreateFarmCommand, FarmDto> {
  constructor(
    private readonly farms: FarmRepository,
    private readonly clock: Clock,
  ) {}

  async handle(command: CreateFarmCommand): Promise<FarmDto> {
    try {
      const farm = Farm.create({
        id: randomUUID(),
        organizationId: command.auth.organizationId,
        name: command.input.name,
        location: command.input.location,
        areaHectares: command.input.areaHectares,
        createdAt: this.clock.now(),
      });
      await this.farms.create(farm);
      return toFarmDto(farm, 0);
    } catch (error) {
      if (error instanceof FarmDomainError) {
        throw AppError.badRequest('validation_error', error.message);
      }
      throw error;
    }
  }
}

export class CreateZoneCommand {
  constructor(
    readonly auth: AuthContext,
    readonly farmId: string,
    readonly input: { name: string; cropType: string; areaHectares: number },
  ) {}
}

export class CreateZoneHandler implements CommandHandler<CreateZoneCommand, ZoneDto> {
  constructor(
    private readonly farms: FarmRepository,
    private readonly zones: ZoneRepository,
    private readonly clock: Clock,
  ) {}

  async handle(command: CreateZoneCommand): Promise<ZoneDto> {
    const farm = await this.farms.findById(command.auth.organizationId, command.farmId);
    if (!farm) {
      throw AppError.notFound('El predio no existe o no pertenece a tu organización.');
    }
    try {
      const zone = Zone.create({
        id: randomUUID(),
        farmId: farm.id,
        organizationId: command.auth.organizationId,
        name: command.input.name,
        cropType: command.input.cropType,
        areaHectares: command.input.areaHectares,
        createdAt: this.clock.now(),
      });
      await this.zones.create(zone);
      return toZoneDto(zone);
    } catch (error) {
      if (error instanceof FarmDomainError) {
        throw AppError.badRequest('validation_error', error.message);
      }
      if ((error as { code?: string }).code === '23505') {
        throw AppError.conflict('conflict', 'Ya existe una zona con ese nombre en el predio.');
      }
      throw error;
    }
  }
}

export class ListFarmsQuery {
  constructor(readonly auth: AuthContext) {}
}

export class ListFarmsHandler implements QueryHandler<ListFarmsQuery, FarmDto[]> {
  constructor(private readonly farms: FarmRepository) {}

  async handle(query: ListFarmsQuery): Promise<FarmDto[]> {
    const summaries = await this.farms.listSummaries(query.auth.organizationId);
    return summaries.map(({ farm, zonesCount }) => toFarmDto(farm, zonesCount));
  }
}

export class GetFarmQuery {
  constructor(
    readonly auth: AuthContext,
    readonly farmId: string,
  ) {}
}

export class GetFarmHandler implements QueryHandler<GetFarmQuery, FarmDetailDto> {
  constructor(
    private readonly farms: FarmRepository,
    private readonly zones: ZoneRepository,
  ) {}

  async handle(query: GetFarmQuery): Promise<FarmDetailDto> {
    const farm = await this.farms.findById(query.auth.organizationId, query.farmId);
    if (!farm) {
      throw AppError.notFound('El predio no existe o no pertenece a tu organización.');
    }
    const zones = await this.zones.listByFarm(query.auth.organizationId, farm.id);
    return { farm: toFarmDto(farm, zones.length), zones: zones.map(toZoneDto) };
  }
}

export class GetZoneQuery {
  constructor(
    readonly auth: AuthContext,
    readonly zoneId: string,
  ) {}
}

export interface ZoneDetailDto {
  zone: ZoneDto;
  farm: { id: string; name: string; location: string };
}

export class GetZoneHandler implements QueryHandler<GetZoneQuery, ZoneDetailDto> {
  constructor(
    private readonly farms: FarmRepository,
    private readonly zones: ZoneRepository,
  ) {}

  async handle(query: GetZoneQuery): Promise<ZoneDetailDto> {
    const zone = await this.zones.findById(query.auth.organizationId, query.zoneId);
    if (!zone) {
      throw AppError.notFound('La zona no existe o no pertenece a tu organización.');
    }
    const farm = await this.farms.findById(query.auth.organizationId, zone.farmId);
    if (!farm) {
      throw AppError.notFound('El predio de la zona no está disponible.');
    }
    return {
      zone: toZoneDto(zone),
      farm: { id: farm.id, name: farm.name, location: farm.location },
    };
  }
}
