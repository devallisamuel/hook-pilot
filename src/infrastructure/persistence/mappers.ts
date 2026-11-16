import { Delivery } from '../../domain/delivery/delivery';
import { Endpoint } from '../../domain/endpoint/endpoint';
import { EndpointUrl } from '../../domain/endpoint/endpoint-url';
import { EventTypeFilter } from '../../domain/endpoint/event-type-filter';
import { EventType } from '../../domain/event/event-type';
import { WebhookEvent } from '../../domain/event/webhook-event';
import { DeliveryRecord } from './entities/delivery.record';
import { EndpointRecord } from './entities/endpoint.record';
import { EventRecord } from './entities/event.record';

/** Converts between database records and domain entities, so neither side leaks into the other. */

export const toEndpoint = (r: EndpointRecord): Endpoint =>
  Endpoint.restore({
    id: r.id,
    url: EndpointUrl.fromStored(r.url),
    description: r.description,
    eventTypes: EventTypeFilter.fromStored(r.eventTypes),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
  });

export const toEndpointRecord = (e: Endpoint): EndpointRecord => ({
  id: e.id,
  url: e.url.value,
  description: e.description,
  eventTypes: [...e.eventTypes.patterns],
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
  deletedAt: e.deletedAt,
});

export const toEvent = (r: EventRecord): WebhookEvent =>
  WebhookEvent.restore({
    id: r.id,
    type: EventType.fromStored(r.type),
    payload: r.payload,
    idempotencyKey: r.idempotencyKey,
    createdAt: r.createdAt,
  });

export const toEventRecord = (e: WebhookEvent): EventRecord => ({
  id: e.id,
  type: e.type.value,
  payload: e.payload,
  idempotencyKey: e.idempotencyKey,
  createdAt: e.createdAt,
});

export const toDelivery = (r: DeliveryRecord): Delivery => Delivery.restore({ ...r });

export const toDeliveryRecord = (d: Delivery): DeliveryRecord => ({
  id: d.id,
  eventId: d.eventId,
  endpointId: d.endpointId,
  status: d.status,
  attemptCount: d.attemptCount,
  lastError: d.lastError,
  request: d.request,
  response: d.response,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
});
