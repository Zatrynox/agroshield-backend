export class Lead {
  private constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly email: string,
    public readonly company: string,
    public readonly phone: string,
    public readonly message: string,
    public readonly source: string,
    public readonly consent: boolean,
    public readonly ipHash: string | null,
    public readonly userAgent: string | null,
    public readonly createdAt: Date,
  ) {}

  static create(input: {
    id: string;
    name: string;
    email: string;
    company: string;
    phone?: string;
    message: string;
    source?: string;
    consent: boolean;
    ipHash?: string | null;
    userAgent?: string | null;
    createdAt?: Date;
  }): Lead {
    const name = input.name.trim();
    const company = input.company.trim();
    const message = input.message.trim();
    const email = input.email.trim().toLowerCase();
    if (name.length < 2 || name.length > 120) {
      throw new LeadDomainError('El nombre debe tener entre 2 y 120 caracteres.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 320) {
      throw new LeadDomainError('El correo electrónico no es válido.');
    }
    if (company.length < 2 || company.length > 160) {
      throw new LeadDomainError('La empresa debe tener entre 2 y 160 caracteres.');
    }
    const phone = (input.phone ?? '').trim();
    if (phone.length > 40) {
      throw new LeadDomainError('El teléfono no puede superar 40 caracteres.');
    }
    if (message.length < 10 || message.length > 2000) {
      throw new LeadDomainError('El mensaje debe tener entre 10 y 2.000 caracteres.');
    }
    if (!input.consent) {
      throw new LeadDomainError('Es necesario aceptar la política de privacidad.');
    }
    return new Lead(
      input.id,
      name,
      email,
      company,
      phone,
      message,
      input.source ?? 'landing',
      input.consent,
      input.ipHash ?? null,
      input.userAgent?.slice(0, 300) ?? null,
      input.createdAt ?? new Date(),
    );
  }
}

export class LeadDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LeadDomainError';
  }
}
