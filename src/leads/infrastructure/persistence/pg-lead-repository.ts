import type { Db } from '../../../shared/db/db.js';
import type { Lead } from '../../domain/model/lead.js';
import type { LeadRepository } from '../../domain/repositories/lead-repository.js';

export class PgLeadRepository implements LeadRepository {
  constructor(private readonly db: Db) {}

  async insert(lead: Lead): Promise<void> {
    await this.db.query(
      `INSERT INTO leads (id, name, email, company, phone, message, source, consent, ip_hash, user_agent, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        lead.id,
        lead.name,
        lead.email,
        lead.company,
        lead.phone,
        lead.message,
        lead.source,
        lead.consent,
        lead.ipHash,
        lead.userAgent,
        lead.createdAt,
      ],
    );
  }
}
