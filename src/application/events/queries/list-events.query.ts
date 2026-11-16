import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EventRepository } from '../../../domain/event/event.repository';
import { WebhookEvent } from '../../../domain/event/webhook-event';
import { Page, PageRequest } from '../../../domain/shared/page';

/** Events newest first, optionally only one type. */
export class ListEventsQuery {
  constructor(
    readonly filter: { type?: string },
    readonly page: PageRequest,
  ) {}
}

@QueryHandler(ListEventsQuery)
export class ListEventsHandler implements IQueryHandler<ListEventsQuery, Page<WebhookEvent>> {
  constructor(private readonly events: EventRepository) {}

  execute({ filter, page }: ListEventsQuery): Promise<Page<WebhookEvent>> {
    return this.events.findPage(filter, page);
  }
}
