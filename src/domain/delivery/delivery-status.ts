/**
 * The life of a delivery:
 *
 *   PENDING ──▶ PROCESSING ──┬──▶ SUCCESSFUL  (endpoint answered 2xx)
 *      ▲                     ├──▶ FAILED      (endpoint answered anything else)
 *      │                     └──▶ UNCERTAIN   (no answer, even after retries)
 *      └──────── replay ◀──── FAILED / UNCERTAIN
 */
export enum DeliveryStatus {
  Pending = 'PENDING',
  Processing = 'PROCESSING',
  Successful = 'SUCCESSFUL',
  Failed = 'FAILED',
  Uncertain = 'UNCERTAIN',
}

/** Only these statuses can be sent again. */
export const REPLAYABLE_STATUSES: readonly DeliveryStatus[] = [DeliveryStatus.Failed, DeliveryStatus.Uncertain];
