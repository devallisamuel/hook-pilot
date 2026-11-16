import { DynamicModule, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { COMMAND_HANDLERS, EVENT_HANDLERS, QUERY_HANDLERS } from './application/handlers';
import { AppConfig } from './infrastructure/config/config';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { DeliveryWorker } from './infrastructure/queue/delivery.worker';
import { RecoveryScheduler } from './infrastructure/scheduling/recovery.scheduler';
import { DeliveriesController } from './presentation/http/deliveries.controller';
import { DomainErrorFilter } from './presentation/http/domain-error.filter';
import { EndpointsController } from './presentation/http/endpoints.controller';
import { EventsController } from './presentation/http/events.controller';
import { HealthController } from './presentation/http/health.controller';

export interface AppModuleOptions {
  config: AppConfig;
  /** Serve the HTTP API (presentation layer). */
  api: boolean;
  /** Consume the delivery queue and run the recovery sweep. */
  worker: boolean;
}

/**
 * Composition root. Every process gets the domain, the application handlers
 * and the infrastructure; then either the HTTP controllers (API), the queue
 * worker and scheduler (worker), or both (tests and small deployments).
 */
@Module({})
export class AppModule {
  static forRoot({ config, api, worker }: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [
        // Only the API process migrates, so workers never race it on DDL.
        InfrastructureModule.forRoot({ config, runMigrations: api && config.runMigrations }),
        CqrsModule,
      ],
      controllers: api ? [HealthController, EndpointsController, EventsController, DeliveriesController] : [],
      providers: [
        ...COMMAND_HANDLERS,
        ...QUERY_HANDLERS,
        ...EVENT_HANDLERS,
        ...(worker ? [DeliveryWorker, RecoveryScheduler] : []),
      ],
    };
  }
}

export const MAX_EVENT_BODY = '256kb';

export function configureHttpApp(app: INestApplication): void {
  (app as NestExpressApplication).useBodyParser('json', { limit: MAX_EVENT_BODY });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new DomainErrorFilter());
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Hook Pilot')
      .setDescription('Webhook delivery: register endpoints, publish events, inspect and replay deliveries.')
      .setVersion('0.1.0')
      .build(),
  );
  SwaggerModule.setup('docs', app, document);
}
