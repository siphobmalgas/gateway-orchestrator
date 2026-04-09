import { z } from 'zod';
import { PaymentProviderName, PAYU_REDIRECT_PAYMENT_METHODS, PAYU_SET_TRANSACTION_TYPES, PEACH_PAYMENT_BRANDS, PEACH_PAYMENT_TYPES } from '../domain/enums';

const paymentMethodSchema = z.union([
  z.enum(PAYU_REDIRECT_PAYMENT_METHODS),
  z.enum(PEACH_PAYMENT_BRANDS)
]);
const transactionTypeSchema = z.union([
  z.enum(PAYU_SET_TRANSACTION_TYPES),
  z.enum(PEACH_PAYMENT_TYPES)
]);
const redirectChannelSchema = z.enum(['web', 'responsive', 'mobi']);
const paymentMetadataSchema = z.record(z.unknown());

const payflexRequiredFieldAliases = [
  { label: 'firstName', keys: ['firstName', 'givenNames'] },
  { label: 'lastName', keys: ['lastName', 'surname'] },
  { label: 'mobile', keys: ['mobile', 'phoneNumber'] },
  { label: 'email', keys: ['email'] }
] as const;

const getMissingPayflexFields = (metadata: Record<string, unknown> | undefined): string[] => {
  return payflexRequiredFieldAliases
    .filter(({ keys }) => !keys.some((key) => typeof metadata?.[key] === 'string' && metadata[key].trim().length > 0))
    .map(({ label }) => label);
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
    paymentMethod: paymentMethodSchema.optional(),
    transactionType: transactionTypeSchema.optional(),
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

    if (value.provider === PaymentProviderName.PEACH) {
      if (value.paymentMethod === 'PAYSHAP' && value.metadata) {
        const bank = value.metadata['virtualAccount.bank'];
        const accountId = value.metadata['virtualAccount.accountId'];
        if (typeof bank !== 'string' || bank.trim().length === 0) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ['metadata'], message: 'PAYSHAP requires metadata field: virtualAccount.bank' });
        }
        if (typeof accountId !== 'string' || accountId.trim().length === 0) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ['metadata'], message: 'PAYSHAP requires metadata field: virtualAccount.accountId' });
        }
      }

      if (value.paymentMethod === 'MOBICRED' && value.metadata) {
        const accountId = value.metadata['virtualAccount.accountId'];
        const password = value.metadata['virtualAccount.password'];
        if (typeof accountId !== 'string' || accountId.trim().length === 0) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ['metadata'], message: 'MOBICRED requires metadata field: virtualAccount.accountId' });
        }
        if (typeof password !== 'string' || password.trim().length === 0) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ['metadata'], message: 'MOBICRED requires metadata field: virtualAccount.password' });
        }
      }

      if (value.paymentMethod === 'RCSSTORECARDS' && value.metadata) {
        const cardNumber = value.metadata['card.number'];
        if (typeof cardNumber !== 'string' || cardNumber.trim().length === 0) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ['metadata'], message: 'RCSSTORECARDS requires metadata field: card.number' });
        }
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
