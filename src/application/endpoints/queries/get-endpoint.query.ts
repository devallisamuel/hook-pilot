import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Endpoint } from '../../../domain/endpoint/endpoint';
import { EndpointRepository } from '../../../domain/endpoint/endpoint.repository';
import { NotFoundError } from '../../../domain/shared/domain-error';

export class GetEndpointQuery {
  constructor(readonly endpointId: string) {}
}

@QueryHandler(GetEndpointQuery)
export class GetEndpointHandler implements IQueryHandler<GetEndpointQuery, Endpoint> {
  constructor(private readonly endpoints: EndpointRepository) {}

  async execute({ endpointId }: GetEndpointQuery): Promise<Endpoint> {
    const endpoint = await this.endpoints.findById(endpointId);
    if (!endpoint) throw new NotFoundError('Endpoint not found');
    return endpoint;
  }
}
