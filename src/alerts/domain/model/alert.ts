export type AlertType = 'temperature' | 'pest' | 'nutrients';
export type AlertSeverity = 'warning' | 'critical';

export interface AlertDraft {
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  deadlineAt: Date;
  context: Record<string, unknown>;
  dedupeKey: string;
}

export class Alert {
  private constructor(
    public readonly id: string,
    public readonly organizationId: string,
    public readonly zoneId: string,
    public readonly type: AlertType,
    public readonly severity: AlertSeverity,
    public readonly title: string,
    public readonly message: string,
    public readonly deadlineAt: Date,
    public readonly context: Record<string, unknown>,
    public readonly dedupeKey: string,
    public acknowledgedAt: Date | null,
    public readonly createdAt: Date,
  ) {}

  static create(input: {
    id: string;
    organizationId: string;
    zoneId: string;
    draft: AlertDraft;
    createdAt?: Date;
  }): Alert {
    return new Alert(
      input.id,
      input.organizationId,
      input.zoneId,
      input.draft.type,
      input.draft.severity,
      input.draft.title,
      input.draft.message,
      input.draft.deadlineAt,
      input.draft.context,
      input.draft.dedupeKey,
      null,
      input.createdAt ?? new Date(),
    );
  }

  static rehydrate(input: {
    id: string;
    organizationId: string;
    zoneId: string;
    type: AlertType;
    severity: AlertSeverity;
    title: string;
    message: string;
    deadlineAt: Date;
    context: Record<string, unknown>;
    dedupeKey: string;
    acknowledgedAt: Date | null;
    createdAt: Date;
  }): Alert {
    return new Alert(
      input.id,
      input.organizationId,
      input.zoneId,
      input.type,
      input.severity,
      input.title,
      input.message,
      input.deadlineAt,
      input.context,
      input.dedupeKey,
      input.acknowledgedAt,
      input.createdAt,
    );
  }

  acknowledge(now: Date): void {
    if (!this.acknowledgedAt) {
      this.acknowledgedAt = now;
    }
  }

  get isOpen(): boolean {
    return this.acknowledgedAt === null;
  }
}
