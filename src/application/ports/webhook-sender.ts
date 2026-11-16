import { CallResult } from '../../domain/delivery/call-result';

/** Port: makes one HTTP POST to an endpoint. Implemented in infrastructure; never throws. */
export abstract class WebhookSender {
  abstract send(request: { url: string; headers: Record<string, string>; body: string }): Promise<CallResult>;
}
