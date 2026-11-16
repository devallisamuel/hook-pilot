import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { Delivery } from '../../../domain/delivery/delivery';
import { DeliveryRepository } from '../../../domain/delivery/delivery.repository';
import { EndpointRepository } from '../../../domain/endpoint/endpoint.repository';
import { DuplicateIdempotencyKeyError, EventRepository } from '../../../domain/event/event.repository';
import { EventType } from '../../../domain/event/event-type';
import { WebhookEvent } from '../../../domain/event/webhook-event';
import { DeliveriesScheduledEvent } from '../../deliveries/events/deliveries-scheduled.event';

export class PublishEventCommand {
  constructor(
    readonly type: string,
    readonly payload: Record<string, unknown>,
    readonly idempotencyKey: string | null = null,
    /** Restricts fan-out to one endpoint (used by endpoint test sends). */
    readonly onlyEndpointId?: string,
  ) {}
}

export interface PublishEventResult {
  event: WebhookEvent;
  deliveries: Delivery[];
  /** False when an earlier event with the same idempotency key was returned instead. */
  created: boolean;
}

/**
 * Saves the event and one PENDING delivery per subscribed endpoint (in one
 * transaction), then raises DeliveriesScheduledEvent so they get queued.
 */
@CommandHandler(PublishEventCommand)
export class PublishEventHandler implements ICommandHandler<PublishEventCommand, PublishEventResult> {
  constructor(
    private readonly events: EventRepository,
    private readonly endpoints: EndpointRepository,
    private readonly deliveries: DeliveryRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: PublishEventCommand): Promise<PublishEventResult> {
    const type = EventType.create(command.type);

    if (command.idempotencyKey) {
      const existing = await this.findExisting(command.idempotencyKey);
      if (existing) return existing;
    }

    const event = WebhookEvent.create({ type, payload: command.payload, idempotencyKey: command.idempotencyKey });
    const targets = (await this.endpoints.findAllActive()).filter((endpoint) =>
      command.onlyEndpointId ? endpoint.id === command.onlyEndpointId : endpoint.wants(type),
    );
    const deliveries = targets.map((endpoint) => Delivery.schedule(event.id, endpoint.id));

    try {
      await this.events.saveWithDeliveries(event, deliveries);
    } catch (err) {
      // Lost a race with a concurrent request using the same idempotency key.
      if (err instanceof DuplicateIdempotencyKeyError && command.idempotencyKey) {
        const existing = await this.findExisting(command.idempotencyKey);
        if (existing) return existing;
      }
      throw err;
    }

    if (deliveries.length) {
      this.eventBus.publish(new DeliveriesScheduledEvent(deliveries.map((d) => d.id), 'event_published'));
    }
    return { event, deliveries, created: true };
  }

  private async findExisting(idempotencyKey: string): Promise<PublishEventResult | null> {
    const event = await this.events.findByIdempotencyKey(idempotencyKey);
    if (!event) return null;
    return { event, deliveries: await this.deliveries.findByEventId(event.id), created: false };
  }
}
