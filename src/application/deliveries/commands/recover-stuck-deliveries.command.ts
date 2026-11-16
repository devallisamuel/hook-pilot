import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { DeliveryRepository } from '../../../domain/delivery/delivery.repository';
import { DeliveryStatus } from '../../../domain/delivery/delivery-status';
import { DeliveryQueue } from '../../ports/delivery-queue';
import { APPLICATION_SETTINGS, ApplicationSettings } from '../../settings';

const BATCH_SIZE = 500;

/**
 * Run every few seconds by each worker. Fixes deliveries that got stuck:
 *
 *  1. PROCESSING for too long -> the worker died while calling the endpoint.
 *     We can't know if the call arrived, so it becomes UNCERTAIN (and can be replayed).
 *  2. PENDING for too long -> it was saved but never queued (e.g. Redis was down), so queue it.
 */
export class RecoverStuckDeliveriesCommand {}

export interface RecoverStuckDeliveriesResult {
  markedUncertain: number;
  requeued: number;
}

@CommandHandler(RecoverStuckDeliveriesCommand)
export class RecoverStuckDeliveriesHandler implements ICommandHandler<RecoverStuckDeliveriesCommand, RecoverStuckDeliveriesResult> {
  private readonly logger = new Logger(RecoverStuckDeliveriesHandler.name);

  constructor(
    private readonly deliveries: DeliveryRepository,
    private readonly queue: DeliveryQueue,
    @Inject(APPLICATION_SETTINGS) private readonly settings: ApplicationSettings,
  ) {}

  async execute(): Promise<RecoverStuckDeliveriesResult> {
    const now = Date.now();

    let markedUncertain = 0;
    const abandoned = await this.deliveries.findProcessingSince(new Date(now - this.settings.stuckProcessingMs), BATCH_SIZE);
    for (const delivery of abandoned) {
      delivery.markAbandoned();
      if (await this.deliveries.saveIfStatus(delivery, DeliveryStatus.Processing)) markedUncertain++;
    }

    const waiting = await this.deliveries.findPendingSince(new Date(now - this.settings.stuckPendingMs), BATCH_SIZE);
    await this.queue.enqueue(waiting.map((delivery) => delivery.id));

    if (markedUncertain || waiting.length) {
      this.logger.log(`Marked ${markedUncertain} abandoned deliveries UNCERTAIN, re-queued ${waiting.length} pending ones`);
    }
    return { markedUncertain, requeued: waiting.length };
  }
}
