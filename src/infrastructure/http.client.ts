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

  if (lastError instanceof Error) {
    throw new Error(lastError.message);
  }

  throw new Error('Request failed');
};
