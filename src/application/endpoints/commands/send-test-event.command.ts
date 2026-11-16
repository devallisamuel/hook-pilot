import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EndpointRepository } from '../../../domain/endpoint/endpoint.repository';
import { NotFoundError } from '../../../domain/shared/domain-error';
import { PublishEventCommand, PublishEventResult } from '../../events/commands/publish-event.command';

/** Sends a `hookpilot.test` event to one endpoint only. */
export class SendTestEventCommand {
  constructor(readonly endpointId: string) {}
}

@CommandHandler(SendTestEventCommand)
export class SendTestEventHandler implements ICommandHandler<SendTestEventCommand, PublishEventResult> {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly endpoints: EndpointRepository,
  ) {}

  async execute({ endpointId }: SendTestEventCommand): Promise<PublishEventResult> {
    const endpoint = await this.endpoints.findById(endpointId);
    if (!endpoint) throw new NotFoundError('Endpoint not found');
    return this.commandBus.execute<PublishEventCommand, PublishEventResult>(
      new PublishEventCommand('hookpilot.test', { message: 'This is a test event from Hook Pilot' }, null, endpoint.id),
    );
  }
}
