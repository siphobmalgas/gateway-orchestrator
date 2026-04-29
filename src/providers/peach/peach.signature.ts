import { createHmac } from 'crypto';

export const generatePeachSignature = (params: Record<string, string>, secretToken: string): string => {
  const sortedKeys = Object.keys(params).sort();
  const dataToSign = sortedKeys.map((key) => `${key}${params[key]}`).join('');
  return createHmac('sha256', secretToken).update(dataToSign).digest('hex');
};

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

export const verifyPeachCheckoutSignature = (formBody: string, secretToken: string): boolean => {
  const params = parseFormBody(formBody);
  const receivedSignature = params.signature;

  if (!receivedSignature) {
    return false;
  }

  const paramsWithoutSignature: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key !== 'signature') {
      paramsWithoutSignature[key] = value;
    }
  }

  const expected = generatePeachSignature(paramsWithoutSignature, secretToken);
  return expected === receivedSignature;
};
