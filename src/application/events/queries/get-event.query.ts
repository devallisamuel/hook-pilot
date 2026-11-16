import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Delivery } from '../../../domain/delivery/delivery';
import { DeliveryRepository } from '../../../domain/delivery/delivery.repository';
import { EventRepository } from '../../../domain/event/event.repository';
import { WebhookEvent } from '../../../domain/event/webhook-event';
import { NotFoundError } from '../../../domain/shared/domain-error';

export class GetEventQuery {
  constructor(readonly eventId: string) {}
}

export interface EventWithDeliveries {
  event: WebhookEvent;
  deliveries: Delivery[];
}

@QueryHandler(GetEventQuery)
export class GetEventHandler implements IQueryHandler<GetEventQuery, EventWithDeliveries> {
  constructor(
    private readonly events: EventRepository,
    private readonly deliveries: DeliveryRepository,
  ) {}

  async execute({ eventId }: GetEventQuery): Promise<EventWithDeliveries> {
    const event = await this.events.findById(eventId);
    if (!event) throw new NotFoundError('Event not found');
    return { event, deliveries: await this.deliveries.findByEventId(eventId) };
  }
}
