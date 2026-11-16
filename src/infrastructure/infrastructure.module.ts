import { BullModule } from '@nestjs/bullmq';
import { DynamicModule, Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeliveryQueue } from '../application/ports/delivery-queue';
import { WebhookSender } from '../application/ports/webhook-sender';
import { APPLICATION_SETTINGS, ApplicationSettings } from '../application/settings';
import { DeliveryRepository } from '../domain/delivery/delivery.repository';
import { EndpointRepository } from '../domain/endpoint/endpoint.repository';
import { EventRepository } from '../domain/event/event.repository';
import { APP_CONFIG, AppConfig } from './config/config';
import { HttpWebhookSender } from './http/http-webhook-sender';
import { DeliveryRecord } from './persistence/entities/delivery.record';
import { EndpointRecord } from './persistence/entities/endpoint.record';
import { EventRecord } from './persistence/entities/event.record';
import { MigrationRunner, RUN_MIGRATIONS } from './persistence/migration-runner';
import { MIGRATIONS } from './persistence/migrations';
import { TypeOrmDeliveryRepository } from './persistence/repositories/typeorm-delivery.repository';
import { TypeOrmEndpointRepository } from './persistence/repositories/typeorm-endpoint.repository';
import { TypeOrmEventRepository } from './persistence/repositories/typeorm-event.repository';
import { BullMqDeliveryQueue, DELIVERY_QUEUE_NAME } from './queue/bullmq-delivery.queue';
import { redisConnectionFromUrl } from './queue/redis';

const RECORDS = [EndpointRecord, EventRecord, DeliveryRecord];

export interface InfrastructureOptions {
  config: AppConfig;
  runMigrations: boolean;
}

/**
 * Wires the outside world to the application: Postgres (TypeORM), the BullMQ
 * queue (Redis) and outbound HTTP. Each domain repository and application port
 * is bound to its implementation here. Global, imported once per process.
 */
@Global()
@Module({})
export class InfrastructureModule {
  static forRoot({ config, runMigrations }: InfrastructureOptions): DynamicModule {
    const settings: ApplicationSettings = {
      allowPrivateNetworks: config.allowPrivateNetworks,
      deliveryRetries: config.delivery.retries,
      deliveryRetryDelayMs: config.delivery.retryDelayMs,
      stuckProcessingMs: config.delivery.stuckProcessingMs,
      stuckPendingMs: config.delivery.stuckPendingMs,
    };

    return {
      module: InfrastructureModule,
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: config.databaseUrl,
          entities: RECORDS,
          migrations: MIGRATIONS,
          migrationsRun: false,
          synchronize: false,
          logging: ['error', 'warn'],
          extra: { max: 20 },
        }),
        TypeOrmModule.forFeature(RECORDS),
        BullModule.forRoot({ connection: redisConnectionFromUrl(config.redisUrl) }),
        BullModule.registerQueue({
          name: DELIVERY_QUEUE_NAME,
          // One try per job: timeouts are retried inside ProcessDelivery, and a replay adds a new job.
          defaultJobOptions: { attempts: 1, removeOnComplete: true, removeOnFail: true },
        }),
      ],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        { provide: APPLICATION_SETTINGS, useValue: settings },
        { provide: RUN_MIGRATIONS, useValue: runMigrations },
        MigrationRunner,
        { provide: EndpointRepository, useClass: TypeOrmEndpointRepository },
        { provide: EventRepository, useClass: TypeOrmEventRepository },
        { provide: DeliveryRepository, useClass: TypeOrmDeliveryRepository },
        { provide: DeliveryQueue, useClass: BullMqDeliveryQueue },
        { provide: WebhookSender, useClass: HttpWebhookSender },
      ],
      exports: [
        APP_CONFIG,
        APPLICATION_SETTINGS,
        BullModule,
        EndpointRepository,
        EventRepository,
        DeliveryRepository,
        DeliveryQueue,
        WebhookSender,
      ],
    };
  }
}
