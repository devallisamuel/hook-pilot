import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { DeliveryQueue } from '../../ports/delivery-queue';

/**
 * Raised after deliveries are saved as PENDING (a new event, an endpoint test
 * send, or a replay). Decouples saving them from putting them on the queue.
 */
export class DeliveriesScheduledEvent {
  constructor(
    readonly deliveryIds: string[],
    readonly reason: 'event_published' | 'replay',
  ) {}
}

/**
 * Puts PENDING deliveries on the queue. If that fails (e.g. Redis is down), the
 * rows are still PENDING in the database and RecoverStuckDeliveries queues them later.
 */
@EventsHandler(DeliveriesScheduledEvent)
export class EnqueueScheduledDeliveriesHandler implements IEventHandler<DeliveriesScheduledEvent> {
  private readonly logger = new Logger(EnqueueScheduledDeliveriesHandler.name);

  constructor(private readonly queue: DeliveryQueue) {}

  async handle(event: DeliveriesScheduledEvent): Promise<void> {
    try {
      await this.queue.enqueue(event.deliveryIds);
    } catch (err) {
      this.logger.warn(
        `Enqueue failed for ${event.deliveryIds.length} ${event.reason} deliveries; they will be re-queued: ${(err as Error).message}`,
      );
    }
  }
}
