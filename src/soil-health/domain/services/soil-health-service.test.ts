import { describe, expect, it } from 'vitest';
import { SoilHealthService } from './soil-health-service.js';
import { SensorReading, type ReadingInput } from '../../../sensors/domain/model/sensor-reading.js';

function reading(overrides: Partial<ReadingInput> = {}): SensorReading {
  const input: ReadingInput = {
    clientReadingId: crypto.randomUUID(),
    recordedAt: new Date().toISOString(),
    soilTempC: 23,
    moisturePct: 45,
    ph: 6.7,
    nitrogenMgKg: 55,
    phosphorusMgKg: 30,
    potassiumMgKg: 190,
    conductivityMsCm: 1.1,
    pestIndex: 5,
    ...overrides,
  };
  return SensorReading.create({
    id: crypto.randomUUID(),
    sensorId: crypto.randomUUID(),
    organizationId: crypto.randomUUID(),
    zoneId: crypto.randomUUID(),
    reading: input,
  });
}

describe('SoilHealthService', () => {
  const service = new SoilHealthService();

  it('reports healthy soil and a maintenance recommendation', () => {
    const assessment = service.assess(reading());
    expect(assessment.status).toBe('healthy');
    expect(assessment.score).toBeGreaterThanOrEqual(70);
    expect(assessment.recommendation).toContain('plan actual');
  });

  it('identifies nitrogen as the limiting nutrient and a short life', () => {
    const assessment = service.assess(
      reading({ nitrogenMgKg: 4, phosphorusMgKg: 25, potassiumMgKg: 170 }),
    );
    expect(assessment.limitingNutrient).toBe('nitrogen');
    expect(assessment.daysRemaining).toBeLessThanOrEqual(10);
    expect(assessment.recommendation).toContain('nitrógeno');
  });

  it('recommends irrigation changes when moisture is out of range', () => {
    const dry = service.assess(reading({ moisturePct: 18 }));
    expect(dry.recommendation).toContain('Aumenta el riego');
    const wet = service.assess(reading({ moisturePct: 80 }));
    expect(wet.recommendation).toContain('Reduce el riego');
  });

  it('flags acidic soil when pH is the main constraint', () => {
    const assessment = service.assess(reading({ ph: 4.6 }));
    expect(assessment.recommendation).toContain('ácido');
    expect(assessment.factors.ph).toBeLessThan(60);
  });
});
