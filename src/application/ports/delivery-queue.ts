/**
 * Port: hands delivery IDs to the workers. Implemented with BullMQ in
 * infrastructure. A job only carries the delivery ID; everything else is read
 * from the database when the job runs.
 */
export abstract class DeliveryQueue {
  /** Adds one job per delivery. Adding a delivery whose job is already waiting does nothing. */
  abstract enqueue(deliveryIds: string[]): Promise<void>;
  abstract isHealthy(): Promise<boolean>;
}
