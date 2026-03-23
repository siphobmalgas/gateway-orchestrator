import { Request, Response } from 'express';
import { PaymentService } from '../services/payment.service';
import { createPaymentSchema, refundSchema } from '../utils/validators';
import { Payment } from '../domain/payment.entity';

const extractHeaders = (headers: Request['headers']): Record<string, string | string[] | undefined> => ({
  ...headers
});

const requireStringParam = (value: string | string[] | undefined, key: string): string => {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
    return value[0];
  }
  throw new Error(`Missing or invalid path param: ${key}`);
};

type InlineRedirect = {
  mode: 'IFRAME';
  url: string;
  method: 'GET';
  fallbackUrl: string;
};

type PaymentResponsePayload = Payment & {
  redirectLink?: string;
  redirectUrl?: string;
  inlineRedirect?: InlineRedirect;
};

const toInlineRedirect = (payment: Payment): InlineRedirect | undefined => {
  if (!payment.checkoutUrl) {
    return undefined;
  }

  return {
    mode: 'IFRAME',
    url: payment.checkoutUrl,
    method: 'GET',
    fallbackUrl: payment.checkoutUrl
  };
};

const toPaymentResponse = (payment: Payment): PaymentResponsePayload => ({
  ...payment,
  redirectLink: payment.checkoutUrl,
  redirectUrl: payment.checkoutUrl,
  inlineRedirect: toInlineRedirect(payment)
});

export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  payment = async (req: Request, res: Response): Promise<void> => {
    const payload = createPaymentSchema.parse(req.body);
    const idempotencyKey = req.header('idempotency-key');

    if (!idempotencyKey) {
      throw new Error('Missing idempotency-key header');
    }

    const payment = await this.paymentService.payment(
      {
        ...payload,
        idempotencyKey
      },
      extractHeaders(req.headers)
    );

    res.status(201).json(toPaymentResponse(payment));
  };

  authorize = async (req: Request, res: Response): Promise<void> => {
    const payload = createPaymentSchema.parse(req.body);
    const idempotencyKey = req.header('idempotency-key');

    if (!idempotencyKey) {
      throw new Error('Missing idempotency-key header');
    }

    const payment = await this.paymentService.authorizePayment(
      {
        ...payload,
        idempotencyKey
      },
      extractHeaders(req.headers)
    );

    res.status(201).json(toPaymentResponse(payment));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const payload = createPaymentSchema.parse(req.body);
    const idempotencyKey = req.header('idempotency-key');

    if (!idempotencyKey) {
      throw new Error('Missing idempotency-key header');
    }

    const payment = await this.paymentService.authorizePayment(
      {
        ...payload,
        idempotencyKey
      },
      extractHeaders(req.headers)
    );

    res.status(201).json(toPaymentResponse(payment));
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const paymentId = requireStringParam(req.params.id, 'id');
    const payment = await this.paymentService.getPayment(paymentId);
    if (!payment) {
      res.status(404).json({ error: 'Payment not found' });
      return;
    }

    res.status(200).json(toPaymentResponse(payment));
  };

  listTransactions = async (_req: Request, res: Response): Promise<void> => {
    const payments = await this.paymentService.listTransactions();
    res.status(200).json(payments.map((payment) => toPaymentResponse(payment)));
  };

  listTransactionLogs = async (req: Request, res: Response): Promise<void> => {
    const paymentId = requireStringParam(req.params.id, 'id');
    const logs = await this.paymentService.listTransactionLogs(paymentId);
    res.status(200).json(logs);
  };

  capture = async (req: Request, res: Response): Promise<void> => {
    const paymentId = requireStringParam(req.params.id, 'id');
    const payment = await this.paymentService.capturePayment(paymentId, extractHeaders(req.headers));
    res.status(200).json(toPaymentResponse(payment));
  };

  refund = async (req: Request, res: Response): Promise<void> => {
    const payload = refundSchema.parse(req.body);
    const paymentId = requireStringParam(req.params.id, 'id');
    const payment = await this.paymentService.refundPayment(
      {
        paymentId,
        ...payload
      },
      extractHeaders(req.headers)
    );

    res.status(200).json(toPaymentResponse(payment));
  };
}
