export class HttpRequestError extends Error {
  readonly retryable: boolean;
  readonly statusCode?: number;
  readonly responsePreview?: string;

  constructor(message: string, options: { retryable: boolean; statusCode?: number; responsePreview?: string }) {
    super(message);
    this.name = 'HttpRequestError';
    this.retryable = options.retryable;
    this.statusCode = options.statusCode;
    this.responsePreview = options.responsePreview;
  }
}