export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = this.constructor.name;
    // Restore prototype chain — required when extending built-in classes in TypeScript
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND', 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

export class ProviderError extends AppError {
  constructor(
    providerName: string,
    message: string,
  ) {
    super(`Provider ${providerName} error: ${message}`, 'PROVIDER_ERROR', 502);
  }
}
