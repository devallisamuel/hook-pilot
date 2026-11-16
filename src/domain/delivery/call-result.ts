import { DeliveryStatus } from './delivery-status';

export type CallErrorCode = 'invalid_url' | 'blocked_address' | 'timeout' | 'network';

/** Value object: the request we sent to an endpoint. The body is not stored; it is rebuilt from the event. */
export interface DeliveryRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly sentAt: string;
}

/** Value object: the outcome of one call to an endpoint. */
export interface CallResult {
  readonly statusCode: number | null;
  readonly responseBody: string | null;
  readonly errorCode: CallErrorCode | null;
  readonly error: string | null;
  readonly durationMs: number;
}

/** Value object: the response we saved, or the error when there was no response. */
export interface DeliveryResponse {
  readonly statusCode: number | null;
  readonly body: string | null;
  readonly error: string | null;
  readonly durationMs: number;
}

/**
 * Decides what one call to an endpoint means:
 *
 *   endpoint answered 2xx            -> SUCCESSFUL
 *   endpoint answered anything else  -> FAILED     (it answered, and it said no)
 *   URL refused before sending       -> FAILED     (nothing was sent; retrying won't help)
 *   timeout or no answer at all      -> UNCERTAIN  (it may or may not have arrived)
 */
export function outcomeOf(result: CallResult): DeliveryStatus {
  if (result.statusCode !== null) {
    const isSuccess = result.statusCode >= 200 && result.statusCode < 300;
    return isSuccess ? DeliveryStatus.Successful : DeliveryStatus.Failed;
  }
  if (result.errorCode === 'blocked_address' || result.errorCode === 'invalid_url') {
    return DeliveryStatus.Failed;
  }
  return DeliveryStatus.Uncertain;
}

/** True when the endpoint gave any answer, so retrying would not change the outcome. */
export function gotAnAnswer(result: CallResult): boolean {
  return outcomeOf(result) !== DeliveryStatus.Uncertain;
}
