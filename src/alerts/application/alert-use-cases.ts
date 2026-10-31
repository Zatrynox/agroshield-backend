import type { CommandHandler } from '../../shared/kernel/command-bus.js';
import type { QueryHandler } from '../../shared/kernel/query-bus.js';
import type { AuthContext } from '../../shared/http/auth.js';
import { AppError } from '../../shared/errors.js';
import type { Clock } from '../../shared/clock.js';
import type { ZoneRepository } from '../../farms/domain/repositories/farm-repositories.js';
import type { AlertRepository, AlertWithZone } from '../domain/repositories/alert-repository.js';

export interface AlertDto {
  id: string;
  zoneId: string;
  zoneName: string;
  farmName: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  deadlineAt: string;
  createdAt: string;
  acknowledgedAt: string | null;
  isOverdue: boolean;
  context: Record<string, unknown>;
}

function toDto(item: AlertWithZone, now: Date): AlertDto {
  return {
    id: item.alert.id,
    zoneId: item.alert.zoneId,
    zoneName: item.zoneName,
    farmName: item.farmName,
    type: item.alert.type,
    severity: item.alert.severity,
    title: item.alert.title,
    message: item.alert.message,
    deadlineAt: item.alert.deadlineAt.toISOString(),
    createdAt: item.alert.createdAt.toISOString(),
    acknowledgedAt: item.alert.acknowledgedAt?.toISOString() ?? null,
    isOverdue: item.alert.acknowledgedAt === null && item.alert.deadlineAt.getTime() < now.getTime(),
    context: item.alert.context,
  };
}

export class ListAlertsQuery {
  constructor(
    readonly auth: AuthContext,
    readonly zoneId?: string,
  ) {}
}

export class ListAlertsHandler implements QueryHandler<ListAlertsQuery, AlertDto[]> {
  constructor(
    private readonly alerts: AlertRepository,
    private readonly zones: ZoneRepository,
    private readonly clock: Clock,
  ) {}

  async handle(query: ListAlertsQuery): Promise<AlertDto[]> {
    if (query.zoneId) {
      const zone = await this.zones.findById(query.auth.organizationId, query.zoneId);
      if (!zone) {
        throw AppError.notFound('La zona no existe o no pertenece a tu organización.');
      }
    }
    const alerts = await this.alerts.listOpen(query.auth.organizationId, query.zoneId);
    const now = this.clock.now();
    return alerts.map((item) => toDto(item, now));
  }
}

export class GetAlertQuery {
  constructor(
    readonly auth: AuthContext,
    readonly alertId: string,
  ) {}
}

export class GetAlertHandler implements QueryHandler<GetAlertQuery, AlertDto> {
  constructor(
    private readonly alerts: AlertRepository,
    private readonly clock: Clock,
  ) {}

  async handle(query: GetAlertQuery): Promise<AlertDto> {
    const alert = await this.alerts.findById(query.auth.organizationId, query.alertId);
    if (!alert) {
      throw AppError.notFound('La alerta no existe o no pertenece a tu organización.');
    }
    return toDto(alert, this.clock.now());
  }
}

export class AcknowledgeAlertCommand {
  constructor(
    readonly auth: AuthContext,
    readonly alertId: string,
  ) {}
}

export class AcknowledgeAlertHandler implements CommandHandler<AcknowledgeAlertCommand, AlertDto> {
  constructor(
    private readonly alerts: AlertRepository,
    private readonly clock: Clock,
  ) {}

  async handle(command: AcknowledgeAlertCommand): Promise<AlertDto> {
    const item = await this.alerts.findById(command.auth.organizationId, command.alertId);
    if (!item) {
      throw AppError.notFound('La alerta no existe o no pertenece a tu organización.');
    }
    const now = this.clock.now();
    item.alert.acknowledge(now);
    await this.alerts.update(item.alert);
    return toDto({ ...item, alert: item.alert }, now);
  }
}
