import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiTags } from '@nestjs/swagger';
import { ReplayDeliveryCommand } from '../../application/deliveries/commands/replay-delivery.command';
import { GetDeliveryQuery } from '../../application/deliveries/queries/get-delivery.query';
import { ListDeliveriesQuery } from '../../application/deliveries/queries/list-deliveries.query';
import { Delivery } from '../../domain/delivery/delivery';
import { Page } from '../../domain/shared/page';
import { ListDeliveriesQueryDto, toDeliveryDetailResponse, toDeliveryResponse } from './dto/delivery.dto';

@ApiTags('deliveries')
@Controller('v1/deliveries')
export class DeliveriesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  async list(@Query() { status, endpointId, eventId, ...page }: ListDeliveriesQueryDto) {
    const result = await this.queryBus.execute<ListDeliveriesQuery, Page<Delivery>>(
      new ListDeliveriesQuery({ status, endpointId, eventId }, page),
    );
    return { data: result.data.map(toDeliveryResponse), nextCursor: result.nextCursor };
  }

  /** A delivery with its last request and response. */
  @Get(':id')
  async get(@Param('id') id: string) {
    return toDeliveryDetailResponse(await this.queryBus.execute<GetDeliveryQuery, Delivery>(new GetDeliveryQuery(id)));
  }

  /** Sends a FAILED or UNCERTAIN delivery again. */
  @Post(':id/replay')
  @HttpCode(200)
  async replay(@Param('id') id: string) {
    return toDeliveryResponse(await this.commandBus.execute<ReplayDeliveryCommand, Delivery>(new ReplayDeliveryCommand(id)));
  }
}
