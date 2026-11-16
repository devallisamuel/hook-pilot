import { Page, PageRequest } from '../shared/page';
import { Delivery } from './delivery';
import { DeliveryStatus } from './delivery-status';

export interface DeliveryFilter {
  status?: DeliveryStatus;
  endpointId?: string;
  eventId?: string;
}

/** Port for storing deliveries. The TypeORM implementation lives in infrastructure. */
export abstract class DeliveryRepository {
  abstract findById(id: string): Promise<Delivery | null>;
  abstract findByEventId(eventId: string): Promise<Delivery[]>;
  abstract findPage(filter: DeliveryFilter, page: PageRequest): Promise<Page<Delivery>>;
  /** PENDING deliveries not touched since `before` (their queue job was probably lost). */
  abstract findPendingSince(before: Date, limit: number): Promise<Delivery[]>;
  /** PROCESSING deliveries not touched since `before` (their worker probably died). */
  abstract findProcessingSince(before: Date, limit: number): Promise<Delivery[]>;
  /**
   * Saves the delivery only if its stored status is still `expected`.
   * Returns false if someone else changed it first, so two workers (or two
   * replays) can never both act on the same delivery.
   */
  abstract saveIfStatus(delivery: Delivery, expected: DeliveryStatus): Promise<boolean>;
}
