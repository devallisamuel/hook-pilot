import { ConflictError } from '../shared/domain-error';
import { newId } from '../shared/id';
import { CallResult, DeliveryRequest, DeliveryResponse, outcomeOf } from './call-result';
import { DeliveryStatus, REPLAYABLE_STATUSES } from './delivery-status';

export interface DeliveryProps {
  id: string;
  eventId: string;
  endpointId: string;
  status: DeliveryStatus;
  /** How many times the endpoint has been called for this delivery (replays included). */
  attemptCount: number;
  lastError: string | null;
  request: DeliveryRequest | null;
  response: DeliveryResponse | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Entity: one event going to one endpoint. All status changes go through the
 * methods below, which enforce the life cycle in DeliveryStatus.
 */
export class Delivery {
  private constructor(private props: DeliveryProps) {}

  /** A new PENDING delivery of an event to an endpoint. */
  static schedule(eventId: string, endpointId: string): Delivery {
    const now = new Date();
    return new Delivery({
      id: newId('dlv'),
      eventId,
      endpointId,
      status: DeliveryStatus.Pending,
      attemptCount: 0,
      lastError: null,
      request: null,
      response: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: DeliveryProps): Delivery {
    return new Delivery({ ...props });
  }

  get id() { return this.props.id; }
  get eventId() { return this.props.eventId; }
  get endpointId() { return this.props.endpointId; }
  get status() { return this.props.status; }
  get attemptCount() { return this.props.attemptCount; }
  get lastError() { return this.props.lastError; }
  get request() { return this.props.request; }
  get response() { return this.props.response; }
  get createdAt() { return this.props.createdAt; }
  get updatedAt() { return this.props.updatedAt; }

  /** PENDING -> PROCESSING: a worker has picked it up. */
  startProcessing(): void {
    this.assertStatus(DeliveryStatus.Pending);
    this.transition(DeliveryStatus.Processing);
  }

  /** PROCESSING -> SUCCESSFUL / FAILED / UNCERTAIN, from the last call made. */
  recordCalls(callsMade: number, request: DeliveryRequest, result: CallResult): void {
    this.assertStatus(DeliveryStatus.Processing);
    const status = outcomeOf(result);
    this.props.attemptCount += callsMade;
    this.props.request = request;
    this.props.response = {
      statusCode: result.statusCode,
      body: result.responseBody,
      error: result.error,
      durationMs: result.durationMs,
    };
    this.props.lastError =
      status === DeliveryStatus.Successful
        ? null
        : result.statusCode !== null
          ? `Endpoint responded with HTTP ${result.statusCode}`
          : result.error;
    this.transition(status);
  }

  /** PROCESSING -> FAILED without calling the endpoint (e.g. it was deleted). */
  failWithoutCalling(reason: string): void {
    this.assertStatus(DeliveryStatus.Processing);
    this.props.lastError = reason;
    this.transition(DeliveryStatus.Failed);
  }

  /** PROCESSING -> UNCERTAIN: the worker died mid-call, so we can't know if it arrived. */
  markAbandoned(): void {
    this.assertStatus(DeliveryStatus.Processing);
    this.props.lastError = 'Worker stopped while calling the endpoint';
    this.transition(DeliveryStatus.Uncertain);
  }

  /** FAILED / UNCERTAIN -> PENDING, to be sent again. */
  replay(): void {
    if (!REPLAYABLE_STATUSES.includes(this.status)) {
      throw new ConflictError(`Only FAILED or UNCERTAIN deliveries can be replayed; this one is ${this.status}`);
    }
    this.props.lastError = null;
    this.transition(DeliveryStatus.Pending);
  }

  private assertStatus(expected: DeliveryStatus): void {
    if (this.status !== expected) {
      throw new ConflictError(`Delivery ${this.id} is ${this.status}, expected ${expected}`);
    }
  }

  private transition(status: DeliveryStatus): void {
    this.props.status = status;
    this.props.updatedAt = new Date();
  }
}
