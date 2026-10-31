import type { QueryHandler } from '../../shared/kernel/query-bus.js';
import type { AuthContext } from '../../shared/http/auth.js';
import type { Clock } from '../../shared/clock.js';
import { AppError } from '../../shared/errors.js';
import type { ZoneRepository } from '../../farms/domain/repositories/farm-repositories.js';
import type { ReadingRepository } from '../../sensors/domain/repositories/sensor-repositories.js';
import { ForecastService, type SoilForecast } from '../domain/services/forecast-service.js';

export interface ZoneForecastDto extends SoilForecast {
  zoneId: string;
}

export class GetForecastQuery {
  constructor(
    readonly auth: AuthContext,
    readonly zoneId: string,
  ) {}
}

export class GetForecastHandler implements QueryHandler<GetForecastQuery, ZoneForecastDto> {
  private readonly service = new ForecastService();

  constructor(
    private readonly zones: ZoneRepository,
    private readonly readings: ReadingRepository,
    private readonly clock: Clock,
  ) {}

  async handle(query: GetForecastQuery): Promise<ZoneForecastDto> {
    const zone = await this.zones.findById(query.auth.organizationId, query.zoneId);
    if (!zone) {
      throw AppError.notFound('La zona no existe o no pertenece a tu organización.');
    }
    const now = this.clock.now();
    const history = await this.readings.listSince(
      query.auth.organizationId,
      query.zoneId,
      new Date(now.getTime() - 3 * 24 * 3_600_000),
      200,
    );
    return { zoneId: zone.id, ...this.service.forecast(history, now, 7) };
  }
}
