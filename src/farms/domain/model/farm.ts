export class Farm {
  private constructor(
    public readonly id: string,
    public readonly organizationId: string,
    public name: string,
    public location: string,
    public areaHectares: number,
    public readonly createdAt: Date,
  ) {}

  static create(input: {
    id: string;
    organizationId: string;
    name: string;
    location?: string;
    areaHectares: number;
    createdAt?: Date;
  }): Farm {
    const name = input.name.trim();
    if (name.length < 2 || name.length > 160) {
      throw new FarmDomainError('El nombre del predio debe tener entre 2 y 160 caracteres.');
    }
    if (!Number.isFinite(input.areaHectares) || input.areaHectares < 0 || input.areaHectares > 1_000_000) {
      throw new FarmDomainError('La superficie debe estar entre 0 y 1.000.000 hectáreas.');
    }
    const location = (input.location ?? '').trim();
    if (location.length > 200) {
      throw new FarmDomainError('La ubicación no puede superar 200 caracteres.');
    }
    return new Farm(
      input.id,
      input.organizationId,
      name,
      location,
      input.areaHectares,
      input.createdAt ?? new Date(),
    );
  }

  static rehydrate(input: {
    id: string;
    organizationId: string;
    name: string;
    location: string;
    areaHectares: number;
    createdAt: Date;
  }): Farm {
    return new Farm(
      input.id,
      input.organizationId,
      input.name,
      input.location,
      input.areaHectares,
      input.createdAt,
    );
  }
}

export class Zone {
  private constructor(
    public readonly id: string,
    public readonly farmId: string,
    public readonly organizationId: string,
    public name: string,
    public cropType: string,
    public areaHectares: number,
    public readonly createdAt: Date,
  ) {}

  static create(input: {
    id: string;
    farmId: string;
    organizationId: string;
    name: string;
    cropType: string;
    areaHectares: number;
    createdAt?: Date;
  }): Zone {
    const name = input.name.trim();
    if (name.length < 2 || name.length > 160) {
      throw new FarmDomainError('El nombre de la zona debe tener entre 2 y 160 caracteres.');
    }
    const cropType = input.cropType.trim();
    if (cropType.length < 2 || cropType.length > 80) {
      throw new FarmDomainError('El cultivo debe tener entre 2 y 80 caracteres.');
    }
    if (!Number.isFinite(input.areaHectares) || input.areaHectares < 0 || input.areaHectares > 1_000_000) {
      throw new FarmDomainError('La superficie debe estar entre 0 y 1.000.000 hectáreas.');
    }
    return new Zone(
      input.id,
      input.farmId,
      input.organizationId,
      name,
      cropType,
      input.areaHectares,
      input.createdAt ?? new Date(),
    );
  }

  static rehydrate(input: {
    id: string;
    farmId: string;
    organizationId: string;
    name: string;
    cropType: string;
    areaHectares: number;
    createdAt: Date;
  }): Zone {
    return new Zone(
      input.id,
      input.farmId,
      input.organizationId,
      input.name,
      input.cropType,
      input.areaHectares,
      input.createdAt,
    );
  }
}

export class FarmDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FarmDomainError';
  }
}
