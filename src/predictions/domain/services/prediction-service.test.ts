import { describe, expect, it } from 'vitest';
import { PredictionService } from './prediction-service.js';
import { SensorReading, type ReadingInput } from '../../../sensors/domain/model/sensor-reading.js';

function reading(overrides: Partial<ReadingInput> = {}): SensorReading {
  const input: ReadingInput = {
    clientReadingId: crypto.randomUUID(),
    recordedAt: new Date().toISOString(),
    soilTempC: 23,
    moisturePct: 45,
    ph: 6.8,
    nitrogenMgKg: 55,
    phosphorusMgKg: 30,
    potassiumMgKg: 180,
    conductivityMsCm: 1.1,
    pestIndex: 10,
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

describe('PredictionService', () => {
  const service = new PredictionService();

  it('marks a zone as unknown when there are no readings', () => {
    const result = service.predict({ readings: [], openAlerts: [] });
    expect(result.risk).toBe('unknown');
    expect(result.score).toBeNull();
    expect(result.demo).toBe(true);
  });

  it('detects an incident zone from critical alerts and depleted nutrients', () => {
    const result = service.predict({
      readings: [reading({ nitrogenMgKg: 4, phosphorusMgKg: 5, potassiumMgKg: 30, pestIndex: 80 })],
      openAlerts: [
        { severity: 'critical', type: 'temperature' },
        { severity: 'critical', type: 'pest' },
      ],
    });
    expect(result.incidentZone).toBe(true);
    expect(result.risk).toBe('high');
    expect(result.signals.length).toBeGreaterThan(2);
    expect(result.recommendation).toContain('Reporte de zona incidente');
  });

  it('keeps a healthy zone at low risk', () => {
    const result = service.predict({
      readings: [reading()],
      openAlerts: [],
    });
    expect(result.risk).toBe('low');
    expect(result.incidentZone).toBe(false);
  });
});
