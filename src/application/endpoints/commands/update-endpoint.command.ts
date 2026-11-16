import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Endpoint } from '../../../domain/endpoint/endpoint';
import { EndpointRepository } from '../../../domain/endpoint/endpoint.repository';
import { EndpointUrl } from '../../../domain/endpoint/endpoint-url';
import { EventTypeFilter } from '../../../domain/endpoint/event-type-filter';
import { NotFoundError } from '../../../domain/shared/domain-error';
import { APPLICATION_SETTINGS, ApplicationSettings } from '../../settings';

/** Fields left undefined are not changed. */
export class UpdateEndpointCommand {
  constructor(
    readonly endpointId: string,
    readonly changes: { url?: string; description?: string | null; eventTypes?: string[] },
  ) {}
}

@CommandHandler(UpdateEndpointCommand)
export class UpdateEndpointHandler implements ICommandHandler<UpdateEndpointCommand, Endpoint> {
  constructor(
    private readonly endpoints: EndpointRepository,
    @Inject(APPLICATION_SETTINGS) private readonly settings: ApplicationSettings,
  ) {}

  async execute({ endpointId, changes }: UpdateEndpointCommand): Promise<Endpoint> {
    const endpoint = await this.endpoints.findById(endpointId);
    if (!endpoint) throw new NotFoundError('Endpoint not found');

    endpoint.update({
      url: changes.url === undefined ? undefined : EndpointUrl.create(changes.url, { allowPrivateNetworks: this.settings.allowPrivateNetworks }),
      description: changes.description,
      eventTypes: changes.eventTypes === undefined ? undefined : EventTypeFilter.create(changes.eventTypes),
    });
    await this.endpoints.save(endpoint);
    return endpoint;
  }
}
