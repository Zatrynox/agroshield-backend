export function asNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  if (typeof value === 'bigint') return Number(value);
  return Number(value ?? 0);
}

export function asDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

export function asNullableDate(value: unknown): Date | null {
  return value === null || value === undefined ? null : asDate(value);
}

export function asJsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return value as Record<string, unknown>;
}
