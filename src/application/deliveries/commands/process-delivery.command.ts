import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { CallResult, DeliveryRequest, gotAnAnswer } from '../../../domain/delivery/call-result';
import { Delivery } from '../../../domain/delivery/delivery';
import { DeliveryRepository } from '../../../domain/delivery/delivery.repository';
import { DeliveryStatus } from '../../../domain/delivery/delivery-status';
import { Endpoint } from '../../../domain/endpoint/endpoint';
import { EndpointRepository } from '../../../domain/endpoint/endpoint.repository';
import { EventRepository } from '../../../domain/event/event.repository';
import { WebhookEvent } from '../../../domain/event/webhook-event';
import { WebhookSender } from '../../ports/webhook-sender';
import { APPLICATION_SETTINGS, ApplicationSettings } from '../../settings';

export const USER_AGENT = 'HookPilot/0.1 (+https://github.com/devallisamuel/hook-pilot)';

/** Sent by a queue worker for each job: deliver one PENDING delivery. */
export class ProcessDeliveryCommand {
  constructor(readonly deliveryId: string) {}
}

/** The final status, or 'skipped' if another run already took the delivery. */
export type ProcessDeliveryResult = DeliveryStatus | 'skipped';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@CommandHandler(ProcessDeliveryCommand)
export class ProcessDeliveryHandler implements ICommandHandler<ProcessDeliveryCommand, ProcessDeliveryResult> {
  private readonly logger = new Logger(ProcessDeliveryHandler.name);

  constructor(
    private readonly deliveries: DeliveryRepository,
    private readonly events: EventRepository,
    private readonly endpoints: EndpointRepository,
    private readonly sender: WebhookSender,
    @Inject(APPLICATION_SETTINGS) private readonly settings: ApplicationSettings,
  ) {}

  async execute({ deliveryId }: ProcessDeliveryCommand): Promise<ProcessDeliveryResult> {
    // Step 1: PENDING -> PROCESSING. Saved only if still PENDING, so a job that runs twice is skipped.
    const delivery = await this.deliveries.findById(deliveryId);
    if (!delivery || delivery.status !== DeliveryStatus.Pending) return 'skipped';
    delivery.startProcessing();
    if (!(await this.deliveries.saveIfStatus(delivery, DeliveryStatus.Pending))) return 'skipped';

    const [event, endpoint] = await Promise.all([
      this.events.findById(delivery.eventId),
      this.endpoints.findByIdIncludingDeleted(delivery.endpointId),
    ]);

    if (!event || !endpoint || endpoint.isDeleted) {
      delivery.failWithoutCalling('Endpoint has been deleted');
      return this.finish(delivery);
    }

    // Step 2: call the endpoint. Only call again when there was no answer at all.
    const totalCalls = 1 + this.settings.deliveryRetries;
    let callsMade = 0;
    let request!: DeliveryRequest;
    let result!: CallResult;
    while (callsMade < totalCalls) {
      if (callsMade > 0) await sleep(this.settings.deliveryRetryDelayMs);
      callsMade++;
      ({ request, result } = await this.call(endpoint, event, delivery, delivery.attemptCount + callsMade));
      if (gotAnAnswer(result)) break;
    }

    // Step 3: save the final status with the last request and response.
    delivery.recordCalls(callsMade, request, result);
    return this.finish(delivery);
  }

  private async call(endpoint: Endpoint, event: WebhookEvent, delivery: Delivery, attempt: number) {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'user-agent': USER_AGENT,
      'webhook-id': event.id,
      'hookpilot-event-type': event.type.value,
      'hookpilot-delivery-id': delivery.id,
      'hookpilot-attempt': String(attempt),
    };
    const request: DeliveryRequest = { url: endpoint.url.value, headers, sentAt: new Date().toISOString() };
    const result = await this.sender.send({ url: endpoint.url.value, headers, body: event.toWebhookBody() });
    return { request, result };
  }

  /** Saves the outcome, but only while the delivery is still PROCESSING. */
  private async finish(delivery: Delivery): Promise<DeliveryStatus> {
    await this.deliveries.saveIfStatus(delivery, DeliveryStatus.Processing);
    this.logger.log(`Delivery ${delivery.id}: ${delivery.status}`);
    return delivery.status;
  }
}
