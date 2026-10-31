import type { QueryHandler } from '../../shared/kernel/query-bus.js';
import type { AuthContext } from '../../shared/http/auth.js';
import { AppError } from '../../shared/errors.js';
import type { ZoneRepository } from '../../farms/domain/repositories/farm-repositories.js';
import type { ReadingRepository } from '../../sensors/domain/repositories/sensor-repositories.js';
import type { AlertRepository } from '../../alerts/domain/repositories/alert-repository.js';
import { PredictionService, type ZonePrediction } from '../domain/services/prediction-service.js';

export interface ZonePredictionDto extends ZonePrediction {
  zoneId: string;
}

export class GetPredictionQuery {
  constructor(
    readonly auth: AuthContext,
    readonly zoneId: string,
  ) {}
}

export class GetPredictionHandler implements QueryHandler<GetPredictionQuery, ZonePredictionDto> {
  private readonly service = new PredictionService();

  constructor(
    private readonly zones: ZoneRepository,
    private readonly readings: ReadingRepository,
    private readonly alerts: AlertRepository,
  ) {}

  async handle(query: GetPredictionQuery): Promise<ZonePredictionDto> {
    const zone = await this.zones.findById(query.auth.organizationId, query.zoneId);
    if (!zone) {
      throw AppError.notFound('La zona no existe o no pertenece a tu organización.');
    }
    const [readings, alerts] = await Promise.all([
      this.readings.listRecentByZone(query.auth.organizationId, query.zoneId, 60),
      this.alerts.listOpen(query.auth.organizationId, query.zoneId),
    ]);
    return {
      zoneId: zone.id,
      ...this.service.predict({
        readings,
        openAlerts: alerts.map((item) => ({ severity: item.alert.severity, type: item.alert.type })),
      }),
    };
  }
}
