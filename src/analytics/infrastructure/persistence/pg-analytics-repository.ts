import type { Db } from '../../../shared/db/db.js';
import type {
  AnalyticsEventName,
  AnalyticsRepository,
} from '../../application/record-event.js';

export class PgAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly db: Db) {}

  async insert(input: {
    id: string;
    name: AnalyticsEventName;
    path: string;
    props: Record<string, string | number | boolean>;
    createdAt: Date;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO analytics_events (id, name, path, props, created_at)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [input.id, input.name, input.path, JSON.stringify(input.props), input.createdAt],
    );
  }
}
