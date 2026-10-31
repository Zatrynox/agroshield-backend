import type { Lead } from '../model/lead.js';

export interface LeadRepository {
  insert(lead: Lead): Promise<void>;
}
