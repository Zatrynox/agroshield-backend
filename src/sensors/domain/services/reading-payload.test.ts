import { describe, expect, it } from 'vitest';
import { canonicalReadingPayload } from './reading-payload.js';
import type { ReadingInput } from '../model/sensor-reading.js';

const reading: ReadingInput = {
  clientReadingId: 'sensor-1-reading-1',
  recordedAt: '2026-10-26T10:00:00.000Z',
  soilTempC: 22.5,
  moisturePct: 44,
  ph: 6.8,
  nitrogenMgKg: 42,
  phosphorusMgKg: 22,
  potassiumMgKg: 160,
  conductivityMsCm: 1.1,
  pestIndex: 12,
};

describe('canonicalReadingPayload', () => {
  it('is deterministic and independent of object property order', () => {
    const reordered: ReadingInput = {
      pestIndex: reading.pestIndex,
      conductivityMsCm: reading.conductivityMsCm,
      potassiumMgKg: reading.potassiumMgKg,
      phosphorusMgKg: reading.phosphorusMgKg,
      nitrogenMgKg: reading.nitrogenMgKg,
      ph: reading.ph,
      moisturePct: reading.moisturePct,
      soilTempC: reading.soilTempC,
      recordedAt: reading.recordedAt,
      clientReadingId: reading.clientReadingId,
    };
    expect(canonicalReadingPayload('sensor-1', '2026-10-26T10:00:05.000Z', reading)).toBe(
      canonicalReadingPayload('sensor-1', '2026-10-26T10:00:05.000Z', reordered),
    );
  });

  it('binds the payload to the sensor and signature timestamp', () => {
    const base = canonicalReadingPayload('sensor-1', '2026-10-26T10:00:05.000Z', reading);
    expect(base).not.toBe(
      canonicalReadingPayload('sensor-2', '2026-10-26T10:00:05.000Z', reading),
    );
    expect(base).not.toBe(
      canonicalReadingPayload('sensor-1', '2026-10-26T10:00:06.000Z', reading),
    );
    expect(base.startsWith('agroshield-readings-v1|sensor-1|')).toBe(true);
  });
});
