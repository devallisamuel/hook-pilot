import { Body, Controller, Get, Headers, Param, Post, Query, Res } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PublishEventCommand, PublishEventResult } from '../../application/events/commands/publish-event.command';
import { EventWithDeliveries, GetEventQuery } from '../../application/events/queries/get-event.query';
import { ListEventsQuery } from '../../application/events/queries/list-events.query';
import { WebhookEvent } from '../../domain/event/webhook-event';
import { Page } from '../../domain/shared/page';
import { toDeliveryResponse } from './dto/delivery.dto';
import { CreateEventDto, ListEventsQueryDto, toEventResponse } from './dto/event.dto';

@ApiTags('events')
@Controller('v1/events')
export class EventsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  /**
   * Publishes an event to every subscribed endpoint. Returns 201 for a new
   * event, or 200 with the original event when the idempotency key was seen before.
   */
  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  async create(
    @Body() dto: CreateEventDto,
    @Headers('idempotency-key') idempotencyHeader: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const idempotencyKey = dto.idempotencyKey ?? idempotencyHeader?.slice(0, 255) ?? null;
    const result = await this.commandBus.execute<PublishEventCommand, PublishEventResult>(
      new PublishEventCommand(dto.type, dto.payload, idempotencyKey),
    );
    res.status(result.created ? 201 : 200);
    return { ...toEventResponse(result.event), deliveries: result.deliveries.map(toDeliveryResponse) };
  }

  @Get()
  async list(@Query() { type, ...page }: ListEventsQueryDto) {
    const result = await this.queryBus.execute<ListEventsQuery, Page<WebhookEvent>>(new ListEventsQuery({ type }, page));
    return { data: result.data.map(toEventResponse), nextCursor: result.nextCursor };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const { event, deliveries } = await this.queryBus.execute<GetEventQuery, EventWithDeliveries>(new GetEventQuery(id));
    return { ...toEventResponse(event), deliveries: deliveries.map(toDeliveryResponse) };
  }
}
