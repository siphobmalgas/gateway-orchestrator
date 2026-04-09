import { WebhookEvent } from '../../domain/provider.interface';
import { mapPeachStatusWithType } from './peach.status';

const parseFormBody = (body: string): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const pair of body.split('&')) {
    const eqIndex = pair.indexOf('=');
    if (eqIndex === -1) continue;
    const key = decodeURIComponent(pair.substring(0, eqIndex));
    const value = decodeURIComponent(pair.substring(eqIndex + 1));
    result[key] = value;
  }
  return result;
};

interface ParsedWebhookFields {
  merchantTransactionId?: string;
  id?: string;
  paymentType?: string;
  resultCode?: string;
}

const asString = (value: unknown): string | undefined => {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

const extractFromJson = (json: Record<string, unknown>): ParsedWebhookFields => {
  const result = json.result as Record<string, unknown> | undefined;
  return {
    merchantTransactionId: asString(json.merchantTransactionId),
    id: asString(json.id),
    paymentType: asString(json.paymentType),
    resultCode: asString(result?.code)
  };
};

const extractWebhookFields = (payload: unknown): ParsedWebhookFields => {
  if (typeof payload === 'string') {
    if (payload.includes('=') && !payload.startsWith('{')) {
      const params = parseFormBody(payload);
      return {
        merchantTransactionId: params.merchantTransactionId,
        id: params.id,
        paymentType: params.paymentType,
        resultCode: params['result.code']
      };
    }

    try {
      const json = JSON.parse(payload) as Record<string, unknown>;
      return extractFromJson(json);
    } catch {
      return {};
    }
  }

  if (payload && typeof payload === 'object') {
    return extractFromJson(payload as Record<string, unknown>);
  }

  return {};
};

export const parsePeachWebhook = (
  payload: unknown,
  merchantTransactionIdMap: Map<string, string>
): WebhookEvent | null => {
  const fields = extractWebhookFields(payload);

  if (!fields.merchantTransactionId) {
    return null;
  }

  const resultCode = fields.resultCode ?? '';
  const paymentType = fields.paymentType ?? 'DB';
  const status = mapPeachStatusWithType(resultCode, paymentType);

  const fullPaymentId = merchantTransactionIdMap.get(fields.merchantTransactionId);

  return {
    merchantReference: fullPaymentId ?? fields.merchantTransactionId,
    providerReference: fields.id,
    status,
    rawPayload: payload
  };
};
