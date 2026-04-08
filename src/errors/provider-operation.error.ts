export class ProviderOperationError extends Error {
  readonly statusCode: number;
  readonly code?: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, options?: { statusCode?: number; code?: string; details?: Record<string, unknown> }) {
    super(message);
    this.name = 'ProviderOperationError';
    this.statusCode = options?.statusCode ?? 409;
    this.code = options?.code;
    this.details = options?.details;
  }
}