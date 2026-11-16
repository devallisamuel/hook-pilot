import { EventBus } from '@nestjs/cqrs';
import { CallResult } from '../domain/delivery/call-result';
import { Delivery } from '../domain/delivery/delivery';
import { DeliveryRepository } from '../domain/delivery/delivery.repository';
import { DeliveryStatus } from '../domain/delivery/delivery-status';
import { Endpoint } from '../domain/endpoint/endpoint';
import { EndpointRepository } from '../domain/endpoint/endpoint.repository';
import { EndpointUrl } from '../domain/endpoint/endpoint-url';
import { EventRepository } from '../domain/event/event.repository';
import { EventType } from '../domain/event/event-type';
import { WebhookEvent } from '../domain/event/webhook-event';
import { ConflictError, NotFoundError } from '../domain/shared/domain-error';
import { ProcessDeliveryCommand, ProcessDeliveryHandler } from './deliveries/commands/process-delivery.command';
import { ReplayDeliveryCommand, ReplayDeliveryHandler } from './deliveries/commands/replay-delivery.command';
import { DeliveriesScheduledEvent, EnqueueScheduledDeliveriesHandler } from './deliveries/events/deliveries-scheduled.event';
import { DeliveryQueue } from './ports/delivery-queue';
import { WebhookSender } from './ports/webhook-sender';
import { ApplicationSettings } from './settings';

/**
 * In-memory stand-in for the delivery repository: the handlers only see the
 * domain port. It remembers each delivery's status as last saved, like a database row.
 */
class InMemoryDeliveries implements Partial<DeliveryRepository> {
  private readonly rows = new Map<string, Delivery>();
  private readonly savedStatus = new Map<string, DeliveryStatus>();

  add(delivery: Delivery) {
    this.rows.set(delivery.id, delivery);
    this.savedStatus.set(delivery.id, delivery.status);
  }
  statusOf(id: string) {
    return this.savedStatus.get(id);
  }
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async saveIfStatus(delivery: Delivery, expected: DeliveryStatus) {
    if (this.savedStatus.get(delivery.id) !== expected) return false;
    this.add(delivery);
    return true;
  }
}

const settings: ApplicationSettings = {
  allowPrivateNetworks: true,
  deliveryRetries: 2,
  deliveryRetryDelayMs: 0,
  stuckProcessingMs: 60_000,
  stuckPendingMs: 30_000,
};

const endpoint = Endpoint.create({ url: EndpointUrl.create('https://example.com/hooks', settings) });
const event = WebhookEvent.create({ type: EventType.create('invoice.paid'), payload: { amount: 1 } });

const answer = (partial: Partial<CallResult>): CallResult => ({
  statusCode: null,
  responseBody: null,
  errorCode: null,
  error: null,
  durationMs: 1,
  ...partial,
});

describe('EnqueueScheduledDeliveriesHandler', () => {
  it('puts every scheduled delivery on the queue', async () => {
    const enqueue = jest.fn().mockResolvedValue(undefined);
    await new EnqueueScheduledDeliveriesHandler({ enqueue } as unknown as DeliveryQueue).handle(
      new DeliveriesScheduledEvent(['dlv_a', 'dlv_b'], 'event_published'),
    );
    expect(enqueue).toHaveBeenCalledWith(['dlv_a', 'dlv_b']);
  });

  it('does not throw when the queue is down (the recovery sweep re-queues later)', async () => {
    const enqueue = jest.fn().mockRejectedValue(new Error('redis down'));
    const handler = new EnqueueScheduledDeliveriesHandler({ enqueue } as unknown as DeliveryQueue);
    await expect(handler.handle(new DeliveriesScheduledEvent(['dlv_a'], 'replay'))).resolves.toBeUndefined();
  });
});

describe('ProcessDeliveryHandler', () => {
  const setup = (answers: CallResult[]) => {
    const deliveries = new InMemoryDeliveries();
    const delivery = Delivery.schedule(event.id, endpoint.id);
    deliveries.add(delivery);
    const send = jest.fn();
    answers.forEach((a) => send.mockResolvedValueOnce(a));
    const handler = new ProcessDeliveryHandler(
      deliveries as unknown as DeliveryRepository,
      { findById: async () => event } as unknown as EventRepository,
      { findByIdIncludingDeleted: async () => endpoint } as unknown as EndpointRepository,
      { send } as unknown as WebhookSender,
      settings,
    );
    return { handler, deliveries, delivery, send };
  };

  it('calls the endpoint once and saves SUCCESSFUL', async () => {
    const { handler, deliveries, delivery, send } = setup([answer({ statusCode: 200 })]);
    await expect(handler.execute(new ProcessDeliveryCommand(delivery.id))).resolves.toBe(DeliveryStatus.Successful);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ url: 'https://example.com/hooks', body: event.toWebhookBody() });
    expect(deliveries.statusOf(delivery.id)).toBe(DeliveryStatus.Successful);
  });

  it('calls again only while there is no answer, then saves UNCERTAIN', async () => {
    const timeout = answer({ errorCode: 'timeout', error: 'Timed out' });
    const { handler, deliveries, delivery, send } = setup([timeout, timeout, timeout]);
    await expect(handler.execute(new ProcessDeliveryCommand(delivery.id))).resolves.toBe(DeliveryStatus.Uncertain);
    expect(send).toHaveBeenCalledTimes(3); // 1 + deliveryRetries
    expect((await deliveries.findById(delivery.id))!.attemptCount).toBe(3);
  });

  it('skips a delivery that is not PENDING (duplicate job)', async () => {
    const { handler, delivery, send } = setup([]);
    delivery.startProcessing();
    await expect(handler.execute(new ProcessDeliveryCommand(delivery.id))).resolves.toBe('skipped');
    expect(send).not.toHaveBeenCalled();
  });
});

describe('ReplayDeliveryHandler', () => {
  const setup = (delivery: Delivery | null, endpointExists = true) => {
    const deliveries = new InMemoryDeliveries();
    if (delivery) deliveries.add(delivery);
    const publish = jest.fn();
    const handler = new ReplayDeliveryHandler(
      deliveries as unknown as DeliveryRepository,
      { findById: async () => (endpointExists ? endpoint : null) } as unknown as EndpointRepository,
      { publish } as unknown as EventBus,
    );
    return { handler, deliveries, publish };
  };
  const failed = () => {
    const delivery = Delivery.schedule(event.id, endpoint.id);
    delivery.startProcessing();
    delivery.recordCalls(1, { url: 'x', headers: {}, sentAt: '' }, answer({ statusCode: 500 }));
    return delivery;
  };

  it('puts a FAILED delivery back to PENDING and raises DeliveriesScheduledEvent', async () => {
    const delivery = failed();
    const { handler, deliveries, publish } = setup(delivery);

    const replayed = await handler.execute(new ReplayDeliveryCommand(delivery.id));

    expect(replayed.status).toBe(DeliveryStatus.Pending);
    expect(deliveries.statusOf(delivery.id)).toBe(DeliveryStatus.Pending);
    expect(publish).toHaveBeenCalledWith(new DeliveriesScheduledEvent([delivery.id], 'replay'));
  });

  it('refuses a SUCCESSFUL delivery', async () => {
    const delivery = Delivery.schedule(event.id, endpoint.id);
    delivery.startProcessing();
    delivery.recordCalls(1, { url: 'x', headers: {}, sentAt: '' }, answer({ statusCode: 200 }));
    const { handler, publish } = setup(delivery);
    await expect(handler.execute(new ReplayDeliveryCommand(delivery.id))).rejects.toBeInstanceOf(ConflictError);
    expect(publish).not.toHaveBeenCalled();
  });

  it('refuses when the endpoint was deleted', async () => {
    const delivery = failed();
    await expect(setup(delivery, false).handler.execute(new ReplayDeliveryCommand(delivery.id))).rejects.toThrow('deleted');
  });

  it('returns NotFound for an unknown delivery', async () => {
    await expect(setup(null).handler.execute(new ReplayDeliveryCommand('nope'))).rejects.toBeInstanceOf(NotFoundError);
  });
});
