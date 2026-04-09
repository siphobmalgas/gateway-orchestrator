import { PaymentStatus } from '../domain/enums';

export type PaymentPollingStopReason = 'terminal-status' | 'attempt-limit' | 'timeout';

export type PaymentPollingConfig = {
  fastIntervalMs: number;
  steadyIntervalMs: number;
  slowIntervalMs: number;
  fastAttempts: number;
  slowAfterMs: number;
  maxDurationMs: number;
  maxAttempts: number;
};

export type PaymentPollingState = {
  attempt: number;
  startedAt: number;
  now?: number;
};

export type PaymentPollingDecision = {
  shouldPoll: boolean;
  nextDelayMs: number | null;
  stopReason?: PaymentPollingStopReason;
};

export const DEFAULT_PAYMENT_POLLING_CONFIG: PaymentPollingConfig = {
  fastIntervalMs: 2000,
  steadyIntervalMs: 5000,
  slowIntervalMs: 10000,
  fastAttempts: 5,
  slowAfterMs: 60000,
  maxDurationMs: 180000,
  maxAttempts: 30
};

const ACTIVE_POLLING_STATUSES = new Set<PaymentStatus>([
  PaymentStatus.CREATED,
  PaymentStatus.PENDING,
  PaymentStatus.PENDING_3DS,
  PaymentStatus.UNKNOWN
]);

export const buildProviderStatusPath = (paymentId: string): string => `/payments/${encodeURIComponent(paymentId)}/provider-status`;

export const shouldContinuePaymentPolling = (status: PaymentStatus): boolean => ACTIVE_POLLING_STATUSES.has(status);

export const getNextPaymentPollingDelay = (
  state: PaymentPollingState,
  config: PaymentPollingConfig = DEFAULT_PAYMENT_POLLING_CONFIG
): number => {
  const elapsedMs = (state.now ?? Date.now()) - state.startedAt;
  if (state.attempt < config.fastAttempts) {
    return config.fastIntervalMs;
  }

  if (elapsedMs < config.slowAfterMs) {
    return config.steadyIntervalMs;
  }

  return config.slowIntervalMs;
};

export const getPaymentPollingDecision = (
  status: PaymentStatus,
  state: PaymentPollingState,
  config: PaymentPollingConfig = DEFAULT_PAYMENT_POLLING_CONFIG
): PaymentPollingDecision => {
  if (!shouldContinuePaymentPolling(status)) {
    return {
      shouldPoll: false,
      nextDelayMs: null,
      stopReason: 'terminal-status'
    };
  }

  const now = state.now ?? Date.now();
  if (state.attempt >= config.maxAttempts) {
    return {
      shouldPoll: false,
      nextDelayMs: null,
      stopReason: 'attempt-limit'
    };
  }

  if (now - state.startedAt >= config.maxDurationMs) {
    return {
      shouldPoll: false,
      nextDelayMs: null,
      stopReason: 'timeout'
    };
  }

  return {
    shouldPoll: true,
    nextDelayMs: getNextPaymentPollingDelay({ ...state, now }, config)
  };
};