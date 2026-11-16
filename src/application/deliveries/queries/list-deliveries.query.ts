import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Delivery } from '../../../domain/delivery/delivery';
import { DeliveryFilter, DeliveryRepository } from '../../../domain/delivery/delivery.repository';
import { Page, PageRequest } from '../../../domain/shared/page';

/** Deliveries newest first, filtered by status, endpoint or event. */
export class ListDeliveriesQuery {
  constructor(
    readonly filter: DeliveryFilter,
    readonly page: PageRequest,
  ) {}
}

@QueryHandler(ListDeliveriesQuery)
export class ListDeliveriesHandler implements IQueryHandler<ListDeliveriesQuery, Page<Delivery>> {
  constructor(private readonly deliveries: DeliveryRepository) {}

  execute({ filter, page }: ListDeliveriesQuery): Promise<Page<Delivery>> {
    return this.deliveries.findPage(filter, page);
  }
}
