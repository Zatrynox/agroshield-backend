import type { Alert } from '../model/alert.js';

export interface AlertWithZone {
  alert: Alert;
  zoneName: string;
  farmName: string;
}

export interface AlertRepository {
  insertIfAbsent(alert: Alert): Promise<boolean>;
  update(alert: Alert): Promise<void>;
  findById(organizationId: string, alertId: string): Promise<AlertWithZone | null>;
  listOpen(organizationId: string, zoneId?: string): Promise<AlertWithZone[]>;
  countOpenByZone(organizationId: string, zoneId: string): Promise<number>;
}
