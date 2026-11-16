import { newId } from '../shared/id';
import { EventType } from '../event/event-type';
import { EndpointUrl } from './endpoint-url';
import { EventTypeFilter } from './event-type-filter';

export interface EndpointProps {
  id: string;
  url: EndpointUrl;
  description: string | null;
  eventTypes: EventTypeFilter;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** Entity: a URL that receives webhooks, and which event types it wants. */
export class Endpoint {
  private constructor(private props: EndpointProps) {}

  static create(input: { url: EndpointUrl; description?: string | null; eventTypes?: EventTypeFilter }): Endpoint {
    const now = new Date();
    return new Endpoint({
      id: newId('ep'),
      url: input.url,
      description: input.description ?? null,
      eventTypes: input.eventTypes ?? EventTypeFilter.create(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  /** Rebuilds an endpoint loaded from storage. */
  static restore(props: EndpointProps): Endpoint {
    return new Endpoint({ ...props });
  }

  get id() { return this.props.id; }
  get url() { return this.props.url; }
  get description() { return this.props.description; }
  get eventTypes() { return this.props.eventTypes; }
  get createdAt() { return this.props.createdAt; }
  get updatedAt() { return this.props.updatedAt; }
  get deletedAt() { return this.props.deletedAt; }

  get isDeleted(): boolean {
    return this.props.deletedAt !== null;
  }

  update(changes: { url?: EndpointUrl; description?: string | null; eventTypes?: EventTypeFilter }): void {
    if (changes.url !== undefined) this.props.url = changes.url;
    if (changes.description !== undefined) this.props.description = changes.description;
    if (changes.eventTypes !== undefined) this.props.eventTypes = changes.eventTypes;
    this.props.updatedAt = new Date();
  }

  delete(): void {
    this.props.deletedAt = new Date();
  }

  /** True if this endpoint should receive an event of the given type. */
  wants(type: EventType): boolean {
    return !this.isDeleted && this.props.eventTypes.matches(type);
  }
}
