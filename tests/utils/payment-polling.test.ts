import { PaymentStatus } from '../../src/domain/enums';
import {
  buildProviderStatusPath,
  DEFAULT_PAYMENT_POLLING_CONFIG,
  getNextPaymentPollingDelay,
  getPaymentPollingDecision,
  shouldContinuePaymentPolling
} from '../../src/utils/payment-polling';

describe('payment polling util', () => {
  it('builds the provider-status path used by frontend polling', () => {
    expect(buildProviderStatusPath('payment/123')).toBe('/payments/payment%2F123/provider-status');
  });

  it('continues polling only while the payment is still in an active state', () => {
    expect(shouldContinuePaymentPolling(PaymentStatus.PENDING)).toBe(true);
    expect(shouldContinuePaymentPolling(PaymentStatus.UNKNOWN)).toBe(true);
    expect(shouldContinuePaymentPolling(PaymentStatus.CAPTURED)).toBe(false);
    expect(shouldContinuePaymentPolling(PaymentStatus.FAILED)).toBe(false);
  });

  it('returns fast, then steady, then slow delays as polling continues', () => {
    const startedAt = 0;

    expect(getNextPaymentPollingDelay({ attempt: 0, startedAt, now: 1000 })).toBe(DEFAULT_PAYMENT_POLLING_CONFIG.fastIntervalMs);
    expect(getNextPaymentPollingDelay({ attempt: 5, startedAt, now: 5000 })).toBe(DEFAULT_PAYMENT_POLLING_CONFIG.steadyIntervalMs);
    expect(getNextPaymentPollingDelay({ attempt: 8, startedAt, now: 61000 })).toBe(DEFAULT_PAYMENT_POLLING_CONFIG.slowIntervalMs);
  });

  it('stops polling when the payment reaches a terminal state', () => {
    expect(getPaymentPollingDecision(PaymentStatus.CAPTURED, { attempt: 1, startedAt: 0, now: 1000 })).toEqual({
      shouldPoll: false,
      nextDelayMs: null,
      stopReason: 'terminal-status'
    });
  });

  it('stops polling when the timeout or attempt limit is reached', () => {
    expect(
      getPaymentPollingDecision(PaymentStatus.PENDING, {
        attempt: DEFAULT_PAYMENT_POLLING_CONFIG.maxAttempts,
        startedAt: 0,
        now: 1000
      })
    ).toEqual({
      shouldPoll: false,
      nextDelayMs: null,
      stopReason: 'attempt-limit'
    });

    expect(
      getPaymentPollingDecision(PaymentStatus.PENDING, {
        attempt: 1,
        startedAt: 0,
        now: DEFAULT_PAYMENT_POLLING_CONFIG.maxDurationMs
      })
    ).toEqual({
      shouldPoll: false,
      nextDelayMs: null,
      stopReason: 'timeout'
    });
  });
});