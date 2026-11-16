import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Job } from 'bullmq';
import { ProcessDeliveryCommand, ProcessDeliveryResult } from '../../application/deliveries/commands/process-delivery.command';
import { APP_CONFIG, AppConfig } from '../config/config';
import { DELIVERY_QUEUE_NAME, DeliveryJobData } from './bullmq-delivery.queue';

/**
 * BullMQ consumer. It holds no delivery logic: each job becomes a
 * ProcessDeliveryCommand on the command bus.
 *
 * `autorun: false` keeps it idle until onApplicationBootstrap, after every
 * module (and the migration runner) has initialised. Concurrency comes from
 * WORKER_CONCURRENCY at runtime. @nestjs/bullmq closes the worker on
 * shutdown, waiting for in-flight jobs.
 */
@Processor(DELIVERY_QUEUE_NAME, { autorun: false })
export class DeliveryWorker extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(DeliveryWorker.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly commandBus: CommandBus,
  ) {
    super();
  }

  onApplicationBootstrap(): void {
    this.worker.concurrency = this.config.delivery.concurrency;
    // run() resolves only when the worker closes, so it is not awaited.
    this.worker.run().catch((err: Error) => this.logger.error(`Worker stopped: ${err.message}`));
    this.logger.log(`Delivery worker started (concurrency ${this.config.delivery.concurrency})`);
  }

  process(job: Job<DeliveryJobData>): Promise<ProcessDeliveryResult> {
    return this.commandBus.execute<ProcessDeliveryCommand, ProcessDeliveryResult>(new ProcessDeliveryCommand(job.data.deliveryId));
  }

  /** Infrastructure failure (e.g. database down). RecoverStuckDeliveries picks the delivery up later. */
  @OnWorkerEvent('failed')
  onFailed(job: Job<DeliveryJobData> | undefined, err: Error): void {
    this.logger.error(`Job ${job?.id} failed: ${err.message}`);
  }

  @OnWorkerEvent('error')
  onError(err: Error): void {
    this.logger.error(`Worker error: ${err.message}`);
  }
}
