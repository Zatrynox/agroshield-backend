import type { QueryHandler } from '../../shared/kernel/query-bus.js';
import type { AuthContext } from '../../shared/http/auth.js';
import type { Clock } from '../../shared/clock.js';
import { AppError } from '../../shared/errors.js';
import type { ZoneRepository } from '../../farms/domain/repositories/farm-repositories.js';
import type { ReadingRepository } from '../../sensors/domain/repositories/sensor-repositories.js';
import { SoilHealthService, type SoilAssessment } from '../domain/services/soil-health-service.js';

export interface SoilHealthDto {
  zoneId: string;
  assessment: SoilAssessment | null;
  source: 'sensor-readings';
}

export class GetSoilHealthQuery {
  constructor(
    readonly auth: AuthContext,
    readonly zoneId: string,
  ) {}
}

export class GetSoilHealthHandler implements QueryHandler<GetSoilHealthQuery, SoilHealthDto> {
  private readonly service = new SoilHealthService();

  constructor(
    private readonly zones: ZoneRepository,
    private readonly readings: ReadingRepository,
    private readonly _clock: Clock,
  ) {}

  async handle(query: GetSoilHealthQuery): Promise<SoilHealthDto> {
    const zone = await this.zones.findById(query.auth.organizationId, query.zoneId);
    if (!zone) {
      throw AppError.notFound('La zona no existe o no pertenece a tu organización.');
    }
    const reading = await this.readings.latestByZone(query.auth.organizationId, query.zoneId);
    return {
      zoneId: zone.id,
      assessment: reading ? this.service.assess(reading) : null,
      source: 'sensor-readings',
    };
  }
}
