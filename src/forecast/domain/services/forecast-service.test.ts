import { describe, expect, it } from 'vitest';
import { ForecastService } from './forecast-service.js';
import { SensorReading, type ReadingInput } from '../../../sensors/domain/model/sensor-reading.js';

const HOUR = 3_600_000;

function reading(recordedAt: Date, soilTempC: number, moisturePct: number): SensorReading {
  const input: ReadingInput = {
    clientReadingId: crypto.randomUUID(),
    recordedAt: recordedAt.toISOString(),
    soilTempC,
    moisturePct,
    ph: 6.8,
    nitrogenMgKg: 45,
    phosphorusMgKg: 24,
    potassiumMgKg: 160,
    conductivityMsCm: 1.1,
    pestIndex: 10,
  };
  return SensorReading.create({
    id: crypto.randomUUID(),
    sensorId: crypto.randomUUID(),
    organizationId: crypto.randomUUID(),
    zoneId: crypto.randomUUID(),
    reading: input,
  });
}

describe('ForecastService', () => {
  const now = new Date('2026-10-26T12:00:00.000Z');
  const service = new ForecastService();

  it('returns an explicitly labelled empty forecast without enough history', () => {
    const result = service.forecast([reading(now, 22, 40)], now);
    expect(result.demo).toBe(true);
    expect(result.source).toBe('demo-trend-model');
    expect(result.days).toEqual([]);
  });

  it('projects a seven-day trend from real readings', () => {
    const history = [
      reading(new Date(now.getTime() - 24 * HOUR), 20, 50),
      reading(new Date(now.getTime() - 12 * HOUR), 22, 46),
      reading(now, 24, 42),
    ];
    const result = service.forecast(history, now);
    expect(result.days).toHaveLength(7);
    expect(result.basisReadings).toBe(3);
    expect(result.days[0]?.soilTempC).toBeGreaterThan(24);
    expect(result.days[0]?.moisturePct).toBeLessThan(42);
    expect(result.days.every((day) => day.moisturePct >= 0 && day.moisturePct <= 100)).toBe(true);
  });

  it('stays inside physical bounds even for extreme slopes', () => {
    const history = [
      reading(new Date(now.getTime() - 2 * HOUR), 0, 100),
      reading(now, 50, 0),
    ];
    const result = service.forecast(history, now);
    expect(result.days.every((day) => day.soilTempC <= 55)).toBe(true);
    expect(result.days.every((day) => day.moisturePct >= 0)).toBe(true);
  });
});
