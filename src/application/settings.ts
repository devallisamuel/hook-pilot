/** Injection token for ApplicationSettings (provided by infrastructure from the environment). */
export const APPLICATION_SETTINGS = Symbol('APPLICATION_SETTINGS');

/** The configuration the use cases need. Infrastructure builds it from environment variables. */
export interface ApplicationSettings {
  /** Allow endpoints on localhost / private networks (local development only). */
  allowPrivateNetworks: boolean;
  /** Extra calls made when an endpoint does not answer, before the delivery becomes UNCERTAIN. */
  deliveryRetries: number;
  /** Pause between those extra calls. */
  deliveryRetryDelayMs: number;
  /** A delivery still PROCESSING after this long is assumed abandoned (its worker died). */
  stuckProcessingMs: number;
  /** A delivery still PENDING after this long was probably never queued. */
  stuckPendingMs: number;
}
