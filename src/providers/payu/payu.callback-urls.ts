import { env } from '../../config/env';

export const resolveExternalCallbackUrl = (urlValue: string): string => {
  if (!env.publicBaseUrl) {
    return urlValue;
  }

  try {
    const callbackUrl = new URL(urlValue);
    const isLocalHost = callbackUrl.hostname === 'localhost' || callbackUrl.hostname === '127.0.0.1';
    if (!isLocalHost) {
      return urlValue;
    }

    const externalBase = new URL(env.publicBaseUrl);
    const rewrittenUrl = new URL(externalBase.toString());
    rewrittenUrl.pathname = callbackUrl.pathname;
    rewrittenUrl.search = callbackUrl.search;
    rewrittenUrl.hash = callbackUrl.hash;
    return rewrittenUrl.toString();
  } catch {
    return urlValue;
  }
};

export const isLocalCallbackUrl = (urlValue: string): boolean => {
  try {
    const callbackUrl = new URL(urlValue);
    return callbackUrl.hostname === 'localhost' || callbackUrl.hostname === '127.0.0.1';
  } catch {
    return false;
  }
};

export const resolveOptionalMerchantRedirectUrl = (urlValue: string | undefined): string | undefined => {
  if (!urlValue || urlValue.trim().length === 0) {
    return undefined;
  }

  return resolveExternalCallbackUrl(urlValue);
};

export const requireMerchantRedirectUrl = (
  urlValue: string | undefined,
  fieldName: 'returnUrl' | 'cancelUrl',
  flowName: string
): string => {
  const resolvedUrl = resolveOptionalMerchantRedirectUrl(urlValue);
  if (!resolvedUrl) {
    throw new Error(`PayU ${flowName} requires redirectContext.${fieldName} so the merchant controls the browser redirect destination.`);
  }

  return resolvedUrl;
};

export const assertPublicCallbackUrls = (urlValues: Array<string | undefined>): void => {
  if (urlValues.some((urlValue) => typeof urlValue === 'string' && isLocalCallbackUrl(urlValue))) {
    throw new Error('PayU callback URLs cannot use localhost. Set PUBLIC_BASE_URL or pass public merchant redirectContext URLs.');
  }
};