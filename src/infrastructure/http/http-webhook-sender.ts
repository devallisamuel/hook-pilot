import { Inject, Injectable } from '@nestjs/common';
import { WebhookSender } from '../../application/ports/webhook-sender';
import { CallResult } from '../../domain/delivery/call-result';
import { APP_CONFIG, AppConfig } from '../config/config';
import { sendWebhook } from './http-sender';

/** WebhookSender adapter: one HTTP POST with a timeout, SSRF checks and no redirects. */
@Injectable()
export class HttpWebhookSender implements WebhookSender {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  send(request: { url: string; headers: Record<string, string>; body: string }): Promise<CallResult> {
    return sendWebhook({
      ...request,
      timeoutMs: this.config.delivery.timeoutMs,
      maxResponseBytes: this.config.delivery.maxResponseBodyBytes,
      allowPrivateNetworks: this.config.allowPrivateNetworks,
    });
  }
}
