import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EndpointRepository } from '../../../domain/endpoint/endpoint.repository';
import { NotFoundError } from '../../../domain/shared/domain-error';

/** Soft-deletes an endpoint: it stops receiving events, but its delivery history stays. */
export class DeleteEndpointCommand {
  constructor(readonly endpointId: string) {}
}

@CommandHandler(DeleteEndpointCommand)
export class DeleteEndpointHandler implements ICommandHandler<DeleteEndpointCommand, void> {
  constructor(private readonly endpoints: EndpointRepository) {}

  async execute({ endpointId }: DeleteEndpointCommand): Promise<void> {
    const endpoint = await this.endpoints.findById(endpointId);
    if (!endpoint) throw new NotFoundError('Endpoint not found');
    endpoint.delete();
    await this.endpoints.save(endpoint);
  }
}
