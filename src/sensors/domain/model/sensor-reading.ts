export interface ReadingInput {
  clientReadingId: string;
  recordedAt: string;
  soilTempC: number;
  moisturePct: number;
  ph: number;
  nitrogenMgKg: number;
  phosphorusMgKg: number;
  potassiumMgKg: number;
  conductivityMsCm: number;
  pestIndex: number;
}

export class SensorReading {
  private constructor(
    public readonly id: string,
    public readonly sensorId: string,
    public readonly organizationId: string,
    public readonly zoneId: string,
    public readonly clientReadingId: string,
    public readonly recordedAt: Date,
    public readonly soilTempC: number,
    public readonly moisturePct: number,
    public readonly ph: number,
    public readonly nitrogenMgKg: number,
    public readonly phosphorusMgKg: number,
    public readonly potassiumMgKg: number,
    public readonly conductivityMsCm: number,
    public readonly pestIndex: number,
    public readonly createdAt: Date,
  ) {}

  static create(input: {
    id: string;
    sensorId: string;
    organizationId: string;
    zoneId: string;
    reading: ReadingInput;
    createdAt?: Date;
  }): SensorReading {
    const reading = input.reading;
    const recordedAt = new Date(reading.recordedAt);
    if (Number.isNaN(recordedAt.getTime())) {
      throw new ReadingDomainError('La marca de tiempo de la lectura no es válida.');
    }
    const now = Date.now();
    if (recordedAt.getTime() > now + 5 * 60_000) {
      throw new ReadingDomainError('La lectura no puede estar en el futuro.');
    }
    if (recordedAt.getTime() < now - 30 * 24 * 3_600_000) {
      throw new ReadingDomainError('La lectura es demasiado antigua (máximo 30 días).');
    }
    if (reading.clientReadingId.length < 1 || reading.clientReadingId.length > 100) {
      throw new ReadingDomainError('clientReadingId debe tener entre 1 y 100 caracteres.');
    }

    assertRange('soilTempC', reading.soilTempC, -20, 100);
    assertRange('moisturePct', reading.moisturePct, 0, 100);
    assertRange('ph', reading.ph, 0, 14);
    assertRange('nitrogenMgKg', reading.nitrogenMgKg, 0, 10_000);
    assertRange('phosphorusMgKg', reading.phosphorusMgKg, 0, 10_000);
    assertRange('potassiumMgKg', reading.potassiumMgKg, 0, 10_000);
    assertRange('conductivityMsCm', reading.conductivityMsCm, 0, 100);
    assertRange('pestIndex', reading.pestIndex, 0, 100);

    return new SensorReading(
      input.id,
      input.sensorId,
      input.organizationId,
      input.zoneId,
      reading.clientReadingId,
      recordedAt,
      reading.soilTempC,
      reading.moisturePct,
      reading.ph,
      reading.nitrogenMgKg,
      reading.phosphorusMgKg,
      reading.potassiumMgKg,
      reading.conductivityMsCm,
      reading.pestIndex,
      input.createdAt ?? new Date(),
    );
  }

  static rehydrate(input: {
    id: string;
    sensorId: string;
    organizationId: string;
    zoneId: string;
    reading: ReadingInput;
    createdAt: Date;
  }): SensorReading {
    const reading = input.reading;
    return new SensorReading(
      input.id,
      input.sensorId,
      input.organizationId,
      input.zoneId,
      reading.clientReadingId,
      new Date(reading.recordedAt),
      reading.soilTempC,
      reading.moisturePct,
      reading.ph,
      reading.nitrogenMgKg,
      reading.phosphorusMgKg,
      reading.potassiumMgKg,
      reading.conductivityMsCm,
      reading.pestIndex,
      input.createdAt,
    );
  }
}

function assertRange(name: string, value: number, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new ReadingDomainError(`${name} debe estar entre ${min} y ${max}.`);
  }
}

export class ReadingDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReadingDomainError';
  }
}
