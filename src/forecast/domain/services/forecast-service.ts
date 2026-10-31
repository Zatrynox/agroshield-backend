import type { SensorReading } from '../../../sensors/domain/model/sensor-reading.js';

export interface ForecastDay {
  date: string;
  soilTempC: number;
  moisturePct: number;
}

export interface SoilForecast {
  source: 'demo-trend-model';
  demo: true;
  basisReadings: number;
  generatedAt: string;
  days: ForecastDay[];
}

const DAY = 24 * 3_600_000;

export class ForecastService {
  forecast(readings: SensorReading[], now: Date, days = 7): SoilForecast {
    const history = readings
      .filter((reading) => reading.recordedAt.getTime() >= now.getTime() - 3 * DAY)
      .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

    if (history.length < 2) {
      return {
        source: 'demo-trend-model',
        demo: true,
        basisReadings: history.length,
        generatedAt: now.toISOString(),
        days: [],
      };
    }

    const base = history[0]!;
    const x = history.map((reading) => (reading.recordedAt.getTime() - base.recordedAt.getTime()) / 3_600_000);
    const tempSlope = slope(x, history.map((reading) => reading.soilTempC));
    const moistureSlope = slope(x, history.map((reading) => reading.moisturePct));
    const latest = history[history.length - 1]!;
    const latestHours = (latest.recordedAt.getTime() - base.recordedAt.getTime()) / 3_600_000;

    const forecast: ForecastDay[] = [];
    for (let day = 1; day <= days; day += 1) {
      const hours = latestHours + day * 24;
      forecast.push({
        date: new Date(now.getTime() + day * DAY).toISOString().slice(0, 10),
        soilTempC: round(clamp(latest.soilTempC + tempSlope * (hours - latestHours), -10, 55)),
        moisturePct: round(clamp(latest.moisturePct + moistureSlope * (hours - latestHours), 0, 100)),
      });
    }

    return {
      source: 'demo-trend-model',
      demo: true,
      basisReadings: history.length,
      generatedAt: now.toISOString(),
      days: forecast,
    };
  }
}

function slope(x: number[], y: number[]): number {
  const count = x.length;
  const sumX = x.reduce((sum, value) => sum + value, 0);
  const sumY = y.reduce((sum, value) => sum + value, 0);
  const sumXY = x.reduce((sum, value, index) => sum + value * y[index]!, 0);
  const sumXX = x.reduce((sum, value) => sum + value * value, 0);
  const denominator = count * sumXX - sumX * sumX;
  if (Math.abs(denominator) < 1e-9) {
    return 0;
  }
  return (count * sumXY - sumX * sumY) / denominator;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
