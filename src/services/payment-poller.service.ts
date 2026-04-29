import { PaymentStatus } from '../domain/enums';
import { logger } from '../infrastructure/logger';
import { PaymentRepository } from '../infrastructure/repositories/payment.repository';
import {
  DEFAULT_PAYMENT_POLLING_CONFIG,
  getPaymentPollingDecision,
  PaymentPollingConfig,
  PaymentPollingState,
  shouldContinuePaymentPolling
} from '../utils/payment-polling';
import { PaymentService } from './payment.service';

const POLLABLE_STATUSES: PaymentStatus[] = [
  PaymentStatus.CREATED,
  PaymentStatus.PENDING,
  PaymentStatus.PENDING_3DS,
  PaymentStatus.UNKNOWN
];

export interface PaymentPollerConfig {
  enabled: boolean;
  intervalMs: number;
  batchSize: number;
  pollingConfig: PaymentPollingConfig;
}

export const DEFAULT_POLLER_CONFIG: PaymentPollerConfig = {
  enabled: false,
  intervalMs: 15_000,
  batchSize: 20,
  pollingConfig: DEFAULT_PAYMENT_POLLING_CONFIG
};

interface PollingTracker {
  attempt: number;
  startedAt: number;
}

export class PaymentPollerService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly trackers = new Map<string, PollingTracker>();

  constructor(
    private readonly paymentService: PaymentService,
    private readonly paymentRepository: PaymentRepository,
    private readonly config: PaymentPollerConfig = DEFAULT_POLLER_CONFIG
  ) {}

  start(): void {
    if (!this.config.enabled) {
      logger.info('Payment poller disabled');
      return;
    }

    if (this.timer) {
      return;
    }

    logger.info('Payment poller started', {
      intervalMs: this.config.intervalMs,
      batchSize: this.config.batchSize
    });

    this.timer = setInterval(() => {
      void this.tick();
    }, this.config.intervalMs);

    // Run first tick immediately
    void this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('Payment poller stopped');
    }
  }

  private async tick(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      const payments = await this.paymentRepository.findByStatuses(POLLABLE_STATUSES);
      const batch = payments.slice(0, this.config.batchSize);

      if (batch.length === 0) {
        return;
      }

      logger.info('Payment poller tick', { pendingCount: payments.length, batchSize: batch.length });

      for (const payment of batch) {
        if (!payment.providerReference) {
          continue;
        }

        const tracker = this.trackers.get(payment.id) ?? {
          attempt: 0,
          startedAt: Date.now()
        };

        const decision = getPaymentPollingDecision(
          payment.status as PaymentStatus,
          { attempt: tracker.attempt, startedAt: tracker.startedAt, now: Date.now() },
          this.config.pollingConfig
        );

        if (!decision.shouldPoll) {
          logger.info('Payment poller giving up', {
            paymentId: payment.id,
            status: payment.status,
            stopReason: decision.stopReason,
            attempts: tracker.attempt
          });
          this.trackers.delete(payment.id);
          continue;
        }

        try {
          const result = await this.paymentService.lookupProviderStatus(payment.id, {
            'x-poll-source': 'payment-poller'
          });

          tracker.attempt += 1;

          if (!shouldContinuePaymentPolling(result.status as PaymentStatus)) {
            logger.info('Payment poller resolved', {
              paymentId: payment.id,
              status: result.status,
              attempts: tracker.attempt
            });
            this.trackers.delete(payment.id);
          } else {
            this.trackers.set(payment.id, tracker);
          }
        } catch (error) {
          tracker.attempt += 1;
          this.trackers.set(payment.id, tracker);

          logger.warn('Payment poller lookup failed', {
            paymentId: payment.id,
            attempt: tracker.attempt,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    } catch (error) {
      logger.error('Payment poller tick error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      this.running = false;
    }
  }
}
