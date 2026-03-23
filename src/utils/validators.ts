import { z } from 'zod';
import { PaymentProviderName } from '../domain/enums';

const payuMethodSchema = z.enum(['CARD', 'CREDITCARD', 'EFT', 'EFT_PRO', 'MOBICRED']);
const payuTransactionTypeSchema = z.enum(['PAYMENT', 'RESERVE']);
const redirectChannelSchema = z.enum(['web', 'responsive', 'mobi']);

export const createPaymentSchema = z.object({
  provider: z.nativeEnum(PaymentProviderName),
  amount: z.number().positive(),
  currency: z.string().min(3).max(3).transform((value) => value.toUpperCase()),
  customerReference: z.string().optional(),
  paymentMethod: payuMethodSchema.optional(),
  transactionType: payuTransactionTypeSchema.optional(),
  redirectContext: z
    .object({
      returnUrl: z.string().url().optional(),
      cancelUrl: z.string().url().optional(),
      notificationUrl: z.string().url().optional(),
      redirectChannel: redirectChannelSchema.optional()
    })
    .optional(),
  metadata: z.record(z.unknown()).optional()
});

export const refundSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().min(3).max(3).transform((value) => value.toUpperCase())
});

const payuCredentialsSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  safekey: z.string().min(1)
});

export const registerProviderSchema = z
  .object({
    provider: z.nativeEnum(PaymentProviderName),
    merchantIdentifier: z.string().min(1),
    merchantName: z.string().min(1),
    payuCredentials: payuCredentialsSchema.optional(),
    metadata: z.record(z.unknown()).optional()
  })
  .superRefine((value, context) => {
    if (value.provider === PaymentProviderName.PAYU && !value.payuCredentials) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'payuCredentials is required for PAYU provider'
      });
    }
  });

export const createMerchantSchema = z.object({
  merchantIdentifier: z.string().min(1),
  merchantName: z.string().min(1),
  metadata: z.record(z.unknown()).optional()
});
