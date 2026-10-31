import type { Db } from '../../../shared/db/db.js';
import { asDate, asNullableDate, asJsonObject } from '../../../shared/db/rows.js';
import { Alert, type AlertSeverity, type AlertType } from '../../domain/model/alert.js';
import type { AlertRepository, AlertWithZone } from '../../domain/repositories/alert-repository.js';

interface AlertRow {
  id: string;
  organization_id: string;
  zone_id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  deadline_at: unknown;
  context: unknown;
  dedupe_key: string;
  acknowledged_at: unknown;
  created_at: unknown;
  zone_name: string;
  farm_name: string;
}

function toAlertWithZone(row: AlertRow): AlertWithZone {
  return {
    alert: Alert.rehydrate({
      id: row.id,
      organizationId: row.organization_id,
      zoneId: row.zone_id,
      type: row.type,
      severity: row.severity,
      title: row.title,
      message: row.message,
      deadlineAt: asDate(row.deadline_at),
      context: asJsonObject(row.context),
      dedupeKey: row.dedupe_key,
      acknowledgedAt: asNullableDate(row.acknowledged_at),
      createdAt: asDate(row.created_at),
    }),
    zoneName: row.zone_name,
    farmName: row.farm_name,
  };
}

const SELECT_ALERT = `
  SELECT a.id, a.organization_id, a.zone_id, a.type, a.severity, a.title, a.message, a.deadline_at,
         a.context, a.dedupe_key, a.acknowledged_at, a.created_at, z.name AS zone_name, f.name AS farm_name
  FROM alerts a
  JOIN zones z ON z.id = a.zone_id
  JOIN farms f ON f.id = z.farm_id
`;

export class PgAlertRepository implements AlertRepository {
  constructor(private readonly db: Db) {}

  async insertIfAbsent(alert: Alert): Promise<boolean> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO alerts
       (id, organization_id, zone_id, type, severity, title, message, deadline_at, context, dedupe_key, acknowledged_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12)
       ON CONFLICT (dedupe_key) DO NOTHING
       RETURNING id`,
      [
        alert.id,
        alert.organizationId,
        alert.zoneId,
        alert.type,
        alert.severity,
        alert.title,
        alert.message,
        alert.deadlineAt,
        JSON.stringify(alert.context),
        alert.dedupeKey,
        alert.acknowledgedAt,
        alert.createdAt,
      ],
    );
    return result.rows.length > 0;
  }

  async update(alert: Alert): Promise<void> {
    await this.db.query('UPDATE alerts SET acknowledged_at = $2 WHERE id = $1', [
      alert.id,
      alert.acknowledgedAt,
    ]);
  }

  async findById(organizationId: string, alertId: string): Promise<AlertWithZone | null> {
    const result = await this.db.query<AlertRow>(
      `${SELECT_ALERT} WHERE a.id = $1 AND a.organization_id = $2`,
      [alertId, organizationId],
    );
    return result.rows[0] ? toAlertWithZone(result.rows[0]) : null;
  }

  async listOpen(organizationId: string, zoneId?: string): Promise<AlertWithZone[]> {
    const params: unknown[] = [organizationId];
    let filter = 'a.organization_id = $1 AND a.acknowledged_at IS NULL';
    if (zoneId) {
      params.push(zoneId);
      filter += ' AND a.zone_id = $2';
    }
    const result = await this.db.query<AlertRow>(
      `${SELECT_ALERT} WHERE ${filter} ORDER BY a.deadline_at ASC, a.created_at DESC`,
      params,
    );
    return result.rows.map(toAlertWithZone);
  }

  async countOpenByZone(organizationId: string, zoneId: string): Promise<number> {
    const result = await this.db.query<{ count: string | number }>(
      'SELECT COUNT(*)::int AS count FROM alerts WHERE organization_id = $1 AND zone_id = $2 AND acknowledged_at IS NULL',
      [organizationId, zoneId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }
}
