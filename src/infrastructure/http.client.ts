import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { HttpRequestError } from '../errors/http-request.error';
import { env } from '../config/env';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new HttpRequestError(`Request timed out after ${timeoutMs}ms`, { retryable: true })),
      timeoutMs
    );
    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
};

const isRetryableAxiosError = (error: unknown): boolean => {
  if (!axios.isAxiosError(error)) {
    return error instanceof HttpRequestError ? error.retryable : false;
  }

  if (!error.response) {
    return true;
  }

  const status = error.response.status;
  return status === 408 || status === 429 || status >= 500;
};

export const requestWithRetry = async <T>(requestConfig: AxiosRequestConfig, timeoutMs = env.requestTimeoutMs): Promise<T> => {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < env.maxRetryAttempts) {
    try {
      const response = await withTimeout<AxiosResponse<T>>(axios.request<T>(requestConfig), timeoutMs);
      return response.data;
    } catch (error) {
      lastError = error;
      attempt += 1;
      if (!isRetryableAxiosError(error) || attempt >= env.maxRetryAttempts) {
        break;
      }
      const backoffMs = 100 * 2 ** attempt;
      await sleep(backoffMs);
    }
  }

  if (lastError instanceof HttpRequestError) {
    throw lastError;
  }

  if (axios.isAxiosError(lastError)) {
    const status = lastError.response?.status;
    const statusText = lastError.response?.statusText;
    const responseData = lastError.response?.data;

    let responsePreview = '';
    if (typeof responseData === 'string' && responseData.trim().length > 0) {
      responsePreview = responseData.trim();
    } else if (responseData !== undefined) {
      try {
        responsePreview = JSON.stringify(responseData);
      } catch {
        responsePreview = String(responseData);
      }
    }

    if (responsePreview.length > 500) {
      responsePreview = `${responsePreview.slice(0, 500)}...`;
    }

    const parts = [lastError.message];
    if (status) {
      parts.push(`status=${status}${statusText ? ` ${statusText}` : ''}`);
    }
    if (responsePreview) {
      parts.push(`response=${responsePreview}`);
    }

    throw new HttpRequestError(parts.join(' | '), {
      retryable: isRetryableAxiosError(lastError),
      statusCode: status,
      responsePreview: responsePreview || undefined
    });
  }

  if (lastError instanceof Error) {
    throw new HttpRequestError(lastError.message, {
      retryable: false
    });
  }

  throw new HttpRequestError('Request failed', {
    retryable: false
  });
};
