import type { SensorReading } from '../../../sensors/domain/model/sensor-reading.js';
import type { AlertDraft, AlertSeverity } from '../model/alert.js';

interface CropProfile {
  temperatureThreshold: number;
  label: string;
}

const CROP_PROFILES: Record<string, CropProfile> = {
  maiz: { temperatureThreshold: 34, label: 'maíz' },
  trigo: { temperatureThreshold: 30, label: 'trigo' },
  tomate: { temperatureThreshold: 30, label: 'tomate' },
  lechuga: { temperatureThreshold: 26, label: 'lechuga' },
  olivo: { temperatureThreshold: 36, label: 'olivo' },
  vid: { temperatureThreshold: 34, label: 'vid' },
  soja: { temperatureThreshold: 32, label: 'soja' },
  otro: { temperatureThreshold: 32, label: 'cultivo' },
};

const NUTRIENT_TARGETS = { nitrogen: 40, phosphorus: 20, potassium: 150 } as const;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export class AlertRules {
  evaluate(input: {
    reading: SensorReading;
    history: SensorReading[];
    cropType: string;
    now: Date;
  }): AlertDraft[] {
    const profile = resolveCrop(input.cropType);
    const drafts: AlertDraft[] = [];
    drafts.push(...this.temperature(input.reading, profile, input.now));
    drafts.push(...this.pest(input.reading, input.history, profile, input.now));
    drafts.push(...this.nutrients(input.reading, profile, input.now));
    return drafts;
  }

  private temperature(reading: SensorReading, profile: CropProfile, now: Date): AlertDraft[] {
    const threshold = profile.temperatureThreshold;
    if (reading.soilTempC < threshold) {
      return [];
    }
    const excess = reading.soilTempC - threshold;
    const hours = clamp(Math.round(24 * Math.exp(-excess / 5)), 1, 36);
    const severity: AlertSeverity = excess >= 5 ? 'critical' : 'warning';
    const deadline = new Date(now.getTime() + hours * HOUR);
    return [
      {
        type: 'temperature',
        severity,
        title:
          severity === 'critical'
            ? 'Temperatura del suelo crítica'
            : 'Temperatura del suelo elevada',
        message: `El suelo de ${profile.label} está a ${format(reading.soilTempC)} °C, ${format(excess)} °C por encima del umbral de ${threshold} °C. Si no se corrige, la zona puede perder viabilidad en unas ${hours} horas.`,
        deadlineAt: deadline,
        context: {
          soilTempC: reading.soilTempC,
          thresholdC: threshold,
          hoursToLoss: hours,
          cropType: profile.label,
        },
        dedupeKey: `temperature:${reading.zoneId}:${Math.floor(now.getTime() / (6 * HOUR))}`,
      },
    ];
  }

  private pest(
    reading: SensorReading,
    history: SensorReading[],
    profile: CropProfile,
    now: Date,
  ): AlertDraft[] {
    const recent = history
      .filter((item) => item.recordedAt.getTime() >= reading.recordedAt.getTime() - 2 * DAY)
      .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
    const first = recent[0];
    const last = recent[recent.length - 1];

    if (reading.pestIndex < 20) {
      return [];
    }

    let daysToCritical: number | null = null;
    let growthPerDay = 0;
    if (first && last && first.id !== last.id) {
      const days = (last.recordedAt.getTime() - first.recordedAt.getTime()) / DAY;
      if (days >= 0.04 && first.pestIndex > 0 && last.pestIndex > first.pestIndex) {
        growthPerDay = Math.log(last.pestIndex / first.pestIndex) / days;
        if (growthPerDay > 0.02) {
          daysToCritical = Math.log(90 / Math.min(89, last.pestIndex)) / growthPerDay;
        }
      }
    }

    if (daysToCritical === null && reading.pestIndex >= 55) {
      daysToCritical = reading.pestIndex >= 75 ? 1 : 4;
      growthPerDay = 0.15;
    }
    if (daysToCritical === null || !Number.isFinite(daysToCritical)) {
      return [];
    }

    daysToCritical = clamp(daysToCritical, 0.25, 30);
    const severity: AlertSeverity = daysToCritical <= 3 ? 'critical' : 'warning';
    const deadline = new Date(now.getTime() + daysToCritical * DAY);
    const growthPercent = Math.round((Math.exp(growthPerDay) - 1) * 100);
    return [
      {
        type: 'pest',
        severity,
        title: 'Plaga en crecimiento exponencial',
        message: `El índice de plagas en ${profile.label} es ${format(reading.pestIndex)}/100 y crece aproximadamente un ${growthPercent} % al día. Sin tratamiento, la cosecha entra en riesgo en ${format(daysToCritical)} días.`,
        deadlineAt: deadline,
        context: {
          pestIndex: reading.pestIndex,
          growthPerDay,
          daysToCritical: Number(daysToCritical.toFixed(2)),
          cropType: profile.label,
        },
        dedupeKey: `pest:${reading.zoneId}:${Math.floor(now.getTime() / DAY)}`,
      },
    ];
  }

  private nutrients(reading: SensorReading, profile: CropProfile, now: Date): AlertDraft[] {
    const ratios = {
      nitrogen: reading.nitrogenMgKg / NUTRIENT_TARGETS.nitrogen,
      phosphorus: reading.phosphorusMgKg / NUTRIENT_TARGETS.phosphorus,
      potassium: reading.potassiumMgKg / NUTRIENT_TARGETS.potassium,
    };
    const entries = Object.entries(ratios) as Array<[keyof typeof ratios, number]>;
    const [limiting, ratio] = entries.reduce((lowest, current) =>
      current[1] < lowest[1] ? current : lowest,
    );
    if (ratio >= 0.6) {
      return [];
    }

    const days = clamp(Math.round(30 * ratio), 1, 30);
    const severity: AlertSeverity = days <= 7 ? 'critical' : 'warning';
    const labels = { nitrogen: 'nitrógeno', phosphorus: 'fósforo', potassium: 'potasio' } as const;
    const deadline = new Date(now.getTime() + days * DAY);
    return [
      {
        type: 'nutrients',
        severity,
        title: 'Vida útil del suelo baja',
        message: `El ${labels[limiting]} está al ${Math.round(ratio * 100)} % del nivel objetivo para ${profile.label}. Vida útil estimada: ${days} días. Planifica fertilización o rotación de cultivo antes de esa fecha.`,
        deadlineAt: deadline,
        context: {
          limitingNutrient: limiting,
          ratio: Number(ratio.toFixed(3)),
          daysRemaining: days,
          cropType: profile.label,
        },
        dedupeKey: `nutrients:${reading.zoneId}:${Math.floor(now.getTime() / DAY)}`,
      },
    ];
  }
}

export function resolveCrop(cropType: string): CropProfile {
  const normalized = cropType
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  return CROP_PROFILES[normalized] ?? CROP_PROFILES.otro!;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function format(value: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(value);
}
