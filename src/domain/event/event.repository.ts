import { Delivery } from '../delivery/delivery';
import { Page, PageRequest } from '../shared/page';
import { WebhookEvent } from './webhook-event';

/** Raised by `saveWithDeliveries` when another event already uses the idempotency key. */
export class DuplicateIdempotencyKeyError extends Error {}

/** Port for storing events. The TypeORM implementation lives in infrastructure. */
export abstract class EventRepository {
  abstract findById(id: string): Promise<WebhookEvent | null>;
  abstract findByIdempotencyKey(key: string): Promise<WebhookEvent | null>;
  abstract findPage(filter: { type?: string }, page: PageRequest): Promise<Page<WebhookEvent>>;
  /**
   * Saves the event and its first deliveries atomically (one transaction), so
   * an event is never stored without the deliveries it fans out to.
   * Throws DuplicateIdempotencyKeyError if the idempotency key is taken.
   */
  abstract saveWithDeliveries(event: WebhookEvent, deliveries: Delivery[]): Promise<void>;
}
