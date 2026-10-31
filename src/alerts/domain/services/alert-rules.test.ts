import { describe, expect, it } from 'vitest';
import { AlertRules } from './alert-rules.js';
import { SensorReading, type ReadingInput } from '../../../sensors/domain/model/sensor-reading.js';

const DAY = 24 * 3_600_000;

function reading(overrides: Partial<ReadingInput> = {}, recordedAt = new Date()): SensorReading {
  const input: ReadingInput = {
    clientReadingId: `reading-${Math.random().toString(16).slice(2)}`,
    recordedAt: recordedAt.toISOString(),
    soilTempC: 24,
    moisturePct: 45,
    ph: 6.8,
    nitrogenMgKg: 50,
    phosphorusMgKg: 28,
    potassiumMgKg: 180,
    conductivityMsCm: 1.2,
    pestIndex: 8,
    ...overrides,
  };
  return SensorReading.create({
    id: crypto.randomUUID(),
    sensorId: crypto.randomUUID(),
    organizationId: crypto.randomUUID(),
    zoneId: '00000000-0000-4000-8000-000000000001',
    reading: input,
    createdAt: recordedAt,
  });
}

describe('AlertRules', () => {
  const rules = new AlertRules();
  const now = new Date('2026-10-26T12:00:00.000Z');

  it('does not invent alerts for a healthy reading', () => {
    const drafts = rules.evaluate({ reading: reading({}, now), history: [], cropType: 'maíz', now });
    expect(drafts).toHaveLength(0);
  });

  it('raises a critical temperature alert with a near deadline', () => {
    const drafts = rules.evaluate({
      reading: reading({ soilTempC: 41 }, now),
      history: [],
      cropType: 'maíz',
      now,
    });
    const alert = drafts.find((draft) => draft.type === 'temperature');
    expect(alert).toBeDefined();
    expect(alert?.severity).toBe('critical');
    expect(alert!.deadlineAt.getTime()).toBeGreaterThan(now.getTime());
    expect(alert!.deadlineAt.getTime() - now.getTime()).toBeLessThanOrEqual(12 * 3_600_000);
    expect(alert?.message).toContain('maíz');
  });

  it('estimates exponential pest growth and a countdown', () => {
    const first = reading({ pestIndex: 10 }, new Date(now.getTime() - 2 * DAY));
    const last = reading({ pestIndex: 45 }, now);
    const drafts = rules.evaluate({
      reading: last,
      history: [first, last],
      cropType: 'tomate',
      now,
    });
    const alert = drafts.find((draft) => draft.type === 'pest');
    expect(alert).toBeDefined();
    expect(alert?.severity).toBe('critical');
    expect(alert?.context.daysToCritical).toBeGreaterThan(0);
    expect(alert?.message).toContain('crece');
  });

  it('warns when a nutrient reserve is being depleted', () => {
    const drafts = rules.evaluate({
      reading: reading({ nitrogenMgKg: 15, phosphorusMgKg: 18, potassiumMgKg: 140 }, now),
      history: [],
      cropType: 'lechuga',
      now,
    });
    const alert = drafts.find((draft) => draft.type === 'nutrients');
    expect(alert).toBeDefined();
    expect(alert?.context.limitingNutrient).toBe('nitrogen');
    expect(alert?.context.daysRemaining).toBeLessThan(15);
  });

  it('normalizes crop names with accents and unknown crops fall back safely', () => {
    const drafts = rules.evaluate({
      reading: reading({ soilTempC: 35 }, now),
      history: [],
      cropType: 'MAÍZ',
      now,
    });
    expect(drafts[0]?.context.cropType).toBe('maíz');
    const unknown = rules.evaluate({
      reading: reading({ soilTempC: 35 }, now),
      history: [],
      cropType: 'quinoa',
      now,
    });
    expect(unknown[0]?.context.cropType).toBe('cultivo');
  });
});
