import type { SensorReading } from '../../../sensors/domain/model/sensor-reading.js';

export type ZoneRisk = 'low' | 'medium' | 'high' | 'unknown';

export interface ZonePrediction {
  risk: ZoneRisk;
  incidentZone: boolean;
  score: number | null;
  recommendation: string;
  signals: string[];
  source: 'rules-v1';
  demo: true;
}

export class PredictionService {
  predict(input: {
    readings: SensorReading[];
    openAlerts: Array<{ severity: string; type: string }>;
  }): ZonePrediction {
    const latest = input.readings
      .slice()
      .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())[0];

    if (!latest) {
      return {
        risk: 'unknown',
        incidentZone: false,
        score: null,
        recommendation: 'Aún no hay lecturas suficientes para evaluar esta zona.',
        signals: [],
        source: 'rules-v1',
        demo: true,
      };
    }

    const nutrients = Math.min(
      latest.nitrogenMgKg / 40,
      latest.phosphorusMgKg / 20,
      latest.potassiumMgKg / 150,
    );
    const criticalAlerts = input.openAlerts.filter((alert) => alert.severity === 'critical').length;
    const warnings = input.openAlerts.length - criticalAlerts;
    const score = Math.round(
      Math.max(0, Math.min(100, nutrients * 55 + (100 - latest.pestIndex) * 0.25 + (latest.moisturePct / 100) * 20)),
    );

    const signals: string[] = [];
    if (criticalAlerts > 0) signals.push(`${criticalAlerts} alerta(s) crítica(s) abierta(s)`);
    if (warnings > 0) signals.push(`${warnings} advertencia(s) abierta(s)`);
    if (nutrients < 0.6) signals.push('Reserva de nutrientes por debajo del 60 %');
    if (latest.pestIndex >= 40) signals.push('Índice de plagas elevado');
    if (latest.moisturePct < 30 || latest.moisturePct > 60) signals.push('Humedad fuera del rango óptimo');

    const incidentZone = criticalAlerts >= 2 || score < 35 || nutrients < 0.35;
    const risk: ZoneRisk =
      criticalAlerts > 0 || score < 40 ? 'high' : score < 65 || warnings > 0 ? 'medium' : 'low';

    const recommendation = incidentZone
      ? 'Reporte de zona incidente: revisa el historial, corrige la limitación principal y, si el problema se repite, evalúa cambiar de zona o de cultivo.'
      : risk === 'high'
        ? 'Prioriza una inspección en campo y aplica la recomendación de la alerta más urgente.'
        : risk === 'medium'
          ? 'Vigila la tendencia durante los próximos 7 días y ajusta riego o fertilización.'
          : 'La zona se mantiene estable. Conserva el plan actual y revisa las lecturas semanalmente.';

    return {
      risk,
      incidentZone,
      score,
      recommendation,
      signals,
      source: 'rules-v1',
      demo: true,
    };
  }
}
