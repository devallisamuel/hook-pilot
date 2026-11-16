import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Endpoint } from '../../../domain/endpoint/endpoint';
import { EndpointRepository } from '../../../domain/endpoint/endpoint.repository';
import { Page, PageRequest } from '../../../domain/shared/page';

/** Active endpoints, newest first. */
export class ListEndpointsQuery {
  constructor(readonly page: PageRequest) {}
}

@QueryHandler(ListEndpointsQuery)
export class ListEndpointsHandler implements IQueryHandler<ListEndpointsQuery, Page<Endpoint>> {
  constructor(private readonly endpoints: EndpointRepository) {}

  execute({ page }: ListEndpointsQuery): Promise<Page<Endpoint>> {
    return this.endpoints.findPage(page);
  }
}
