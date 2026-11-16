import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { RecoverStuckDeliveriesCommand } from '../../application/deliveries/commands/recover-stuck-deliveries.command';
import { APP_CONFIG, AppConfig } from '../config/config';

/** Sends RecoverStuckDeliveriesCommand every RECONCILE_INTERVAL_MS, one sweep at a time. */
@Injectable()
export class RecoveryScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(RecoveryScheduler.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly commandBus: CommandBus,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      if (this.running) return; // previous sweep still going
      this.running = this.commandBus
        .execute(new RecoverStuckDeliveriesCommand())
        .then(() => undefined)
        .catch((err: Error) => this.logger.error(`Recovery sweep failed: ${err.message}`))
        .finally(() => (this.running = undefined));
    }, this.config.delivery.reconcileIntervalMs);
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.running;
  }
}
