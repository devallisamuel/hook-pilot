import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Endpoint } from '../../../domain/endpoint/endpoint';
import { EndpointRepository } from '../../../domain/endpoint/endpoint.repository';
import { EndpointUrl } from '../../../domain/endpoint/endpoint-url';
import { EventTypeFilter } from '../../../domain/endpoint/event-type-filter';
import { APPLICATION_SETTINGS, ApplicationSettings } from '../../settings';

export class CreateEndpointCommand {
  constructor(
    readonly url: string,
    readonly description: string | null = null,
    readonly eventTypes: string[] = [],
  ) {}
}

@CommandHandler(CreateEndpointCommand)
export class CreateEndpointHandler implements ICommandHandler<CreateEndpointCommand, Endpoint> {
  constructor(
    private readonly endpoints: EndpointRepository,
    @Inject(APPLICATION_SETTINGS) private readonly settings: ApplicationSettings,
  ) {}

  async execute(command: CreateEndpointCommand): Promise<Endpoint> {
    const endpoint = Endpoint.create({
      url: EndpointUrl.create(command.url, { allowPrivateNetworks: this.settings.allowPrivateNetworks }),
      description: command.description,
      eventTypes: EventTypeFilter.create(command.eventTypes),
    });
    await this.endpoints.save(endpoint);
    return endpoint;
  }
}
