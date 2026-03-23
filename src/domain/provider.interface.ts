import { PayURedirectPaymentMethod, PayUSetTransactionType, PaymentProviderName, PaymentStatus } from './enums';

export interface RedirectContext {
  returnUrl?: string;
  cancelUrl?: string;
  notificationUrl?: string;
  redirectChannel?: 'web' | 'responsive' | 'mobi';
}

export interface PaymentRequest {
  paymentId: string;
  amount: number;
  currency: string;
  customerReference?: string;
  paymentMethod?: PayURedirectPaymentMethod;
  transactionType?: PayUSetTransactionType;
  redirectContext?: RedirectContext;
  metadata?: Record<string, unknown>;
}

export interface AuthorizeRequest {
  paymentId: string;
  amount: number;
  currency: string;
  customerReference?: string;
  paymentMethod?: PayURedirectPaymentMethod;
  transactionType?: PayUSetTransactionType;
  redirectContext?: RedirectContext;
  metadata?: Record<string, unknown>;
}

export interface PaymentResponse {
  provider: PaymentProviderName;
  status: PaymentStatus;
  providerReference: string;
  amount: number;
  currency: string;
  redirectUrl?: string;
  rawResponse?: unknown;
}

export interface RefundRequest {
  transactionId: string;
  amount: number;
  currency: string;
}

export interface CaptureRequest {
  transactionId: string;
  amount: number;
  currency: string;
  merchantReference?: string;
}

export interface WebhookEvent {
  merchantReference?: string;
  providerReference?: string;
  status?: PaymentStatus;
  responseHash?: string;
  rawPayload?: unknown;
}

export interface PaymentProvider {
  payment(request: PaymentRequest): Promise<PaymentResponse>;
  authorize(request: AuthorizeRequest): Promise<PaymentResponse>;
  capture(request: CaptureRequest): Promise<PaymentResponse>;
  refund(request: RefundRequest): Promise<PaymentResponse>;
  verifyWebhookSignature(payload: string, signature: string): boolean;
  handleWebhook(payload: unknown): Promise<WebhookEvent | null>;
}
