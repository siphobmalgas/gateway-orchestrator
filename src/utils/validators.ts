import { z } from 'zod';
import { PaymentProviderName, PAYU_REDIRECT_PAYMENT_METHODS, PAYU_SET_TRANSACTION_TYPES } from '../domain/enums';

const payuMethodSchema = z.enum(PAYU_REDIRECT_PAYMENT_METHODS);
const payuTransactionTypeSchema = z.enum(PAYU_SET_TRANSACTION_TYPES);
const redirectChannelSchema = z.enum(['web', 'responsive', 'mobi']);
const paymentMetadataSchema = z.record(z.unknown());

const getMissingPayflexFields = (metadata: Record<string, unknown> | undefined): string[] => {
  const requiredFields = ['firstName', 'lastName', 'mobile', 'email'] as const;

  return requiredFields.filter((field) => {
    const value = metadata?.[field];
    return typeof value !== 'string' || value.trim().length === 0;
  });
};

const getMissingS2SCardFields = (metadata: Record<string, unknown> | undefined): string[] => {
  const requiredFields = ['cardNumber', 'cardExpiry', 'cvv', 'nameOnCard', 'firstName', 'lastName', 'mobile', 'email'] as const;

  return requiredFields.filter((field) => {
    const value = metadata?.[field];
    return typeof value !== 'string' || value.trim().length === 0;
  });
};

export const createPaymentSchema = z
  .object({
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
    metadata: paymentMetadataSchema.optional()
  })
  .superRefine((value, context) => {
    if (value.paymentMethod === 'PAYFLEX') {
      const missingFields = getMissingPayflexFields(value.metadata);
      if (missingFields.length > 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['metadata'],
          message: `PAYFLEX requires metadata fields: ${missingFields.join(', ')}`
        });
      }
    }

    const flowSelector = typeof value.metadata?.payuAuthorizeFlow === 'string' ? value.metadata.payuAuthorizeFlow.toUpperCase() : '';
    const shouldValidateS2S = value.paymentMethod === 'CREDITCARD' && value.transactionType === 'RESERVE' && flowSelector === 'DO_TRANSACTION';

    if (!shouldValidateS2S) {
      return;
    }

    const missingS2SFields = getMissingS2SCardFields(value.metadata);
    if (missingS2SFields.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['metadata'],
        message: `DO_TRANSACTION requires metadata fields: ${missingS2SFields.join(', ')}`
      });
    }
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
    metadata: paymentMetadataSchema.optional()
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
  metadata: paymentMetadataSchema.optional()
});
