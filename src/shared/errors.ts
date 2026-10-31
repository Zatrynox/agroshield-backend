export type ProblemCode =
  | 'validation_error'
  | 'invalid_credentials'
  | 'account_locked'
  | 'email_taken'
  | 'copyright'
  | 'session_expired'
  | 'forbidden'
  | 'csrf_invalid'
  | 'not_found'
  | 'rate_limited'
  | 'captcha_invalid'
  | 'captcha_expired'
  | 'sensor_unauthorized'
  | 'sensor_revoked'
  | 'sensor_clock_skew'
  | 'conflict'
  | 'internal_error';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ProblemCode,
    public readonly title: string,
    public readonly detail: string,
  ) {
    super(detail);
    this.name = 'AppError';
  }

  static notFound(detail = 'El recurso no existe o no pertenece a tu organización.'): AppError {
    return new AppError(404, 'not_found', 'No encontrado', detail);
  }

  static forbidden(detail = 'No tienes permisos para realizar esta acción.'): AppError {
    return new AppError(403, 'forbidden', 'Acceso denegado', detail);
  }

  static unauthorized(detail = 'Debes iniciar sesión.'): AppError {
    return new AppError(401, 'session_expired', 'Sesión requerida', detail);
  }

  static conflict(code: ProblemCode, detail: string): AppError {
    return new AppError(409, code, 'Conflicto', detail);
  }

  static badRequest(code: ProblemCode, detail: string): AppError {
    return new AppError(400, code, 'Solicitud inválida', detail);
  }
}
