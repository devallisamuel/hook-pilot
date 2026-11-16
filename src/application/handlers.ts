import { RecoverStuckDeliveriesHandler } from './deliveries/commands/recover-stuck-deliveries.command';
import { ProcessDeliveryHandler } from './deliveries/commands/process-delivery.command';
import { ReplayDeliveryHandler } from './deliveries/commands/replay-delivery.command';
import { EnqueueScheduledDeliveriesHandler } from './deliveries/events/deliveries-scheduled.event';
import { GetDeliveryHandler } from './deliveries/queries/get-delivery.query';
import { ListDeliveriesHandler } from './deliveries/queries/list-deliveries.query';
import { CreateEndpointHandler } from './endpoints/commands/create-endpoint.command';
import { DeleteEndpointHandler } from './endpoints/commands/delete-endpoint.command';
import { SendTestEventHandler } from './endpoints/commands/send-test-event.command';
import { UpdateEndpointHandler } from './endpoints/commands/update-endpoint.command';
import { GetEndpointHandler } from './endpoints/queries/get-endpoint.query';
import { ListEndpointsHandler } from './endpoints/queries/list-endpoints.query';
import { PublishEventHandler } from './events/commands/publish-event.command';
import { GetEventHandler } from './events/queries/get-event.query';
import { ListEventsHandler } from './events/queries/list-events.query';

/** Writes. */
export const COMMAND_HANDLERS = [
  CreateEndpointHandler,
  UpdateEndpointHandler,
  DeleteEndpointHandler,
  SendTestEventHandler,
  PublishEventHandler,
  ReplayDeliveryHandler,
  ProcessDeliveryHandler,
  RecoverStuckDeliveriesHandler,
];

/** Reads. */
export const QUERY_HANDLERS = [
  GetEndpointHandler,
  ListEndpointsHandler,
  GetEventHandler,
  ListEventsHandler,
  GetDeliveryHandler,
  ListDeliveriesHandler,
];

/** Reactions to domain events. */
export const EVENT_HANDLERS = [EnqueueScheduledDeliveriesHandler];
