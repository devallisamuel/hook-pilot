import { newId } from '../shared/id';
import { EventType } from './event-type';

export interface WebhookEventProps {
  id: string;
  type: EventType;
  payload: Record<string, unknown>;
  idempotencyKey: string | null;
  createdAt: Date;
}

/** Entity: something that happened, published once and delivered to every subscribed endpoint. */
export class WebhookEvent {
  private constructor(private readonly props: WebhookEventProps) {}

  static create(input: { type: EventType; payload: Record<string, unknown>; idempotencyKey?: string | null }): WebhookEvent {
    return new WebhookEvent({
      id: newId('evt'),
      type: input.type,
      payload: input.payload,
      idempotencyKey: input.idempotencyKey ?? null,
      createdAt: new Date(),
    });
  }

  static restore(props: WebhookEventProps): WebhookEvent {
    return new WebhookEvent({ ...props });
  }

  get id() { return this.props.id; }
  get type() { return this.props.type; }
  get payload() { return this.props.payload; }
  get idempotencyKey() { return this.props.idempotencyKey; }
  get createdAt() { return this.props.createdAt; }

  /** The exact JSON body every endpoint receives. */
  toWebhookBody(): string {
    return JSON.stringify({
      id: this.id,
      type: this.type.value,
      timestamp: this.createdAt.toISOString(),
      data: this.payload,
    });
  }
}
