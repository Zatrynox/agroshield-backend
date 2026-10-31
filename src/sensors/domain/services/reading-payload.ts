import type { ReadingInput } from '../model/sensor-reading.js';

/**
 * Canonical payload signed by a sensor. It is kept independent from JSON property
 * order so the device and the API can compute the same value.
 */
export function canonicalReadingPayload(
  sensorId: string,
  timestamp: string,
  reading: ReadingInput,
): string {
  return [
    'agroshield-readings-v1',
    sensorId,
    timestamp,
    reading.clientReadingId,
    reading.recordedAt,
    reading.soilTempC,
    reading.moisturePct,
    reading.ph,
    reading.nitrogenMgKg,
    reading.phosphorusMgKg,
    reading.potassiumMgKg,
    reading.conductivityMsCm,
    reading.pestIndex,
  ].join('|');
}
