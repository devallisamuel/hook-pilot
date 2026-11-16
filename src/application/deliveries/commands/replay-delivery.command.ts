import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { Delivery } from '../../../domain/delivery/delivery';
import { DeliveryRepository } from '../../../domain/delivery/delivery.repository';
import { EndpointRepository } from '../../../domain/endpoint/endpoint.repository';
import { ConflictError, NotFoundError } from '../../../domain/shared/domain-error';
import { DeliveriesScheduledEvent } from '../events/deliveries-scheduled.event';

/**
 * Sends a FAILED or UNCERTAIN delivery again: puts it back to PENDING and
 * queues it. The receiver gets the same `webhook-id`, so it can tell it's a repeat.
 */
export class ReplayDeliveryCommand {
  constructor(readonly deliveryId: string) {}
}

@CommandHandler(ReplayDeliveryCommand)
export class ReplayDeliveryHandler implements ICommandHandler<ReplayDeliveryCommand, Delivery> {
  constructor(
    private readonly deliveries: DeliveryRepository,
    private readonly endpoints: EndpointRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute({ deliveryId }: ReplayDeliveryCommand): Promise<Delivery> {
    const delivery = await this.deliveries.findById(deliveryId);
    if (!delivery) throw new NotFoundError('Delivery not found');

    const previousStatus = delivery.status;
    delivery.replay(); // throws ConflictError unless FAILED or UNCERTAIN

    if (!(await this.endpoints.findById(delivery.endpointId))) {
      throw new ConflictError('Endpoint has been deleted');
    }
    // Two replays at once: only the one that still sees the old status wins.
    if (!(await this.deliveries.saveIfStatus(delivery, previousStatus))) {
      throw new ConflictError('Delivery is already being replayed');
    }

    this.eventBus.publish(new DeliveriesScheduledEvent([delivery.id], 'replay'));
    return delivery;
  }
}
