import { createPrivateKey, randomUUID, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { canonicalReadingPayload } from '../sensors/domain/services/reading-payload.js';
import type { ReadingInput } from '../sensors/domain/model/sensor-reading.js';

interface DemoKeyFile {
  sensors: Array<{
    sensorId: string;
    sensorName: string;
    zoneId: string;
    zoneName: string;
    privateKeyPem: string;
  }>;
}

const envFile = resolve(import.meta.dirname, '../../../.env');
try {
  loadDotenv({ path: envFile });
} catch {
  // The process may already have environment variables (Docker).
}

const apiUrl = (process.env.PUBLIC_API_URL ?? process.env.API_URL ?? 'http://localhost:3000')
  .replace(/\/$/, '');
const intervalMs = Number(process.env.SIMULATOR_INTERVAL_MS ?? 15_000);
const once = process.env.SIMULATOR_ONCE === 'true';
const keyDirectory = resolve(process.env.DEMO_SENSOR_KEY_DIR ?? './.data/demo-keys');

function randomBetween(min: number, max: number, decimals = 1): number {
  const value = min + Math.random() * (max - min);
  return Number(value.toFixed(decimals));
}

function makeReading(sensorName: string): ReadingInput {
  const stress = Math.random() < 0.06;
  return {
    clientReadingId: `${sensorName.replace(/\s+/g, '-').toLowerCase()}-${randomUUID()}`,
    recordedAt: new Date().toISOString(),
    soilTempC: stress ? randomBetween(35, 43) : randomBetween(20, 29),
    moisturePct: stress ? randomBetween(18, 27) : randomBetween(38, 54),
    ph: randomBetween(6.3, 7.3, 2),
    nitrogenMgKg: stress ? randomBetween(5, 18) : randomBetween(38, 58),
    phosphorusMgKg: stress ? randomBetween(4, 12) : randomBetween(20, 32),
    potassiumMgKg: stress ? randomBetween(40, 100) : randomBetween(145, 210),
    conductivityMsCm: randomBetween(0.8, 1.8, 2),
    pestIndex: stress ? randomBetween(58, 88) : randomBetween(4, 21),
  };
}

async function sendReading(sensor: DemoKeyFile['sensors'][number], key: ReturnType<typeof createPrivateKey>): Promise<void> {
  const reading = makeReading(sensor.sensorName);
  const timestamp = new Date().toISOString();
  const payload = canonicalReadingPayload(sensor.sensorId, timestamp, reading);
  const signature = sign(null, Buffer.from(payload, 'utf8'), key).toString('base64');

  const response = await fetch(`${apiUrl}/v1/sensors/${sensor.sensorId}/readings`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-sensor-timestamp': timestamp,
      'x-sensor-signature': signature,
      'idempotency-key': reading.clientReadingId,
    },
    body: JSON.stringify(reading),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body.slice(0, 300)}`);
  }

  const result = (await response.json()) as { duplicate: boolean };
  console.info(
    `[${new Date().toISOString()}] ${sensor.zoneName} / ${sensor.sensorName}: reading ${result.duplicate ? 'already stored' : 'accepted'} (${reading.soilTempC} °C, pests ${reading.pestIndex}/100)`,
  );
}

async function main(): Promise<void> {
  const raw = await readFile(resolve(keyDirectory, 'sensors.json'), 'utf8');
  const keys = JSON.parse(raw) as DemoKeyFile;
  if (!keys.sensors?.length) {
    throw new Error('The demo key file contains no sensors. Run `pnpm seed` first.');
  }

  const sensors = keys.sensors.map((sensor) => ({
    ...sensor,
    key: createPrivateKey(sensor.privateKeyPem),
  }));

  console.info(`Sending signed readings to ${apiUrl} every ${intervalMs} ms`);
  console.info('Press Ctrl+C to stop.');

  const tick = async (): Promise<void> => {
    for (const sensor of sensors) {
      try {
        await sendReading(sensor, sensor.key);
      } catch (error) {
        console.error(`Sensor ${sensor.sensorName} failed:`, (error as Error).message);
      }
    }
  };

  await tick();
  if (once) {
    return;
  }

  await new Promise<void>((resolvePromise) => {
    const timer = setInterval(() => void tick(), intervalMs);
    const stop = (): void => {
      clearInterval(timer);
      resolvePromise();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
