import type { SensorReading } from '../../../sensors/domain/model/sensor-reading.js';

export type SoilStatus = 'healthy' | 'watch' | 'depleted';

export interface SoilAssessment {
  score: number;
  status: SoilStatus;
  limitingNutrient: 'nitrogen' | 'phosphorus' | 'potassium' | null;
  daysRemaining: number;
  factors: {
    moisture: number;
    ph: number;
    nutrients: number;
    pest: number;
  };
  recommendation: string;
  readingAt: string;
}

const TARGETS = { nitrogen: 40, phosphorus: 20, potassium: 150 } as const;

export class SoilHealthService {
  assess(reading: SensorReading): SoilAssessment {
    const moisture =
      reading.moisturePct < 35
        ? clamp(100 - (35 - reading.moisturePct) * 4, 0, 100)
        : reading.moisturePct > 55
          ? clamp(100 - (reading.moisturePct - 55) * 4, 0, 100)
          : 100;
    const ph =
      reading.ph < 6
        ? clamp(100 - (6 - reading.ph) * 35, 0, 100)
        : reading.ph > 7.5
          ? clamp(100 - (reading.ph - 7.5) * 35, 0, 100)
          : 100;

    const ratios = {
      nitrogen: reading.nitrogenMgKg / TARGETS.nitrogen,
      phosphorus: reading.phosphorusMgKg / TARGETS.phosphorus,
      potassium: reading.potassiumMgKg / TARGETS.potassium,
    };
    const entries = Object.entries(ratios) as Array<['nitrogen' | 'phosphorus' | 'potassium', number]>;
    const [limitingNutrient, minRatio] = entries.reduce((lowest, current) =>
      current[1] < lowest[1] ? current : lowest,
    );
    const nutrients = clamp(minRatio * 100, 0, 100);
    const pest = clamp(100 - reading.pestIndex, 0, 100);

    const score = Math.round(moisture * 0.3 + ph * 0.2 + nutrients * 0.3 + pest * 0.2);
    const weakestFactor = Math.min(moisture, ph, nutrients, pest);
    const status: SoilStatus =
      score < 45 || nutrients < 25
        ? 'depleted'
        : score < 70 || weakestFactor < 60
          ? 'watch'
          : 'healthy';
    const daysRemaining = clamp(Math.round(30 * minRatio), 1, 90);
    const labels = { nitrogen: 'nitrógeno', phosphorus: 'fósforo', potassium: 'potasio' } as const;

    let recommendation: string;
    if (status === 'healthy') {
      recommendation = 'Mantén el plan actual de riego y fertilización. Revisa la tendencia semanal.';
    } else if (nutrients <= moisture && nutrients <= ph) {
      recommendation = `Prioriza ${labels[limitingNutrient]}: la reserva alcanza para unos ${daysRemaining} días. Fertiliza o rota el cultivo antes de esa fecha.`;
    } else if (moisture <= ph) {
      recommendation =
        reading.moisturePct < 35
          ? 'Aumenta el riego: la humedad está por debajo del rango óptimo de 35–55 %.'
          : 'Reduce el riego: la humedad supera el rango óptimo y puede favorecer enfermedades.';
    } else {
      recommendation =
        reading.ph < 6
          ? 'El pH es demasiado ácido. Aplica enmienda calcárea y vuelve a medir en 7 días.'
          : 'El pH es demasiado alcalino. Revisa fertilizantes y aplica azufre si el cultivo lo admite.';
    }

    return {
      score,
      status,
      limitingNutrient,
      daysRemaining,
      factors: {
        moisture: Math.round(moisture),
        ph: Math.round(ph),
        nutrients: Math.round(nutrients),
        pest: Math.round(pest),
      },
      recommendation,
      readingAt: reading.recordedAt.toISOString(),
    };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
