import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { env } from '../config/env';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
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
      if (attempt >= env.maxRetryAttempts) {
        break;
      }
      const backoffMs = 100 * 2 ** attempt;
      await sleep(backoffMs);
    }
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

    throw new Error(parts.join(' | '));
  }

  if (lastError instanceof Error) {
    throw new Error(lastError.message);
  }

  throw new Error('Request failed');
};
