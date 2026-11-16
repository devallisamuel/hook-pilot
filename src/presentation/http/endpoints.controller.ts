import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiTags } from '@nestjs/swagger';
import { CreateEndpointCommand } from '../../application/endpoints/commands/create-endpoint.command';
import { DeleteEndpointCommand } from '../../application/endpoints/commands/delete-endpoint.command';
import { SendTestEventCommand } from '../../application/endpoints/commands/send-test-event.command';
import { UpdateEndpointCommand } from '../../application/endpoints/commands/update-endpoint.command';
import { GetEndpointQuery } from '../../application/endpoints/queries/get-endpoint.query';
import { ListEndpointsQuery } from '../../application/endpoints/queries/list-endpoints.query';
import { PublishEventResult } from '../../application/events/commands/publish-event.command';
import { Endpoint } from '../../domain/endpoint/endpoint';
import { Page } from '../../domain/shared/page';
import { CreateEndpointDto, toEndpointResponse, UpdateEndpointDto } from './dto/endpoint.dto';
import { toEventResponse } from './dto/event.dto';
import { PageQueryDto } from './dto/page-query.dto';

@ApiTags('endpoints')
@Controller('v1/endpoints')
export class EndpointsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  async create(@Body() dto: CreateEndpointDto) {
    const endpoint = await this.commandBus.execute<CreateEndpointCommand, Endpoint>(
      new CreateEndpointCommand(dto.url, dto.description ?? null, dto.eventTypes ?? []),
    );
    return toEndpointResponse(endpoint);
  }

  @Get()
  async list(@Query() query: PageQueryDto) {
    const page = await this.queryBus.execute<ListEndpointsQuery, Page<Endpoint>>(new ListEndpointsQuery(query));
    return { data: page.data.map(toEndpointResponse), nextCursor: page.nextCursor };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return toEndpointResponse(await this.queryBus.execute<GetEndpointQuery, Endpoint>(new GetEndpointQuery(id)));
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateEndpointDto) {
    const endpoint = await this.commandBus.execute<UpdateEndpointCommand, Endpoint>(new UpdateEndpointCommand(id, dto));
    return toEndpointResponse(endpoint);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.commandBus.execute(new DeleteEndpointCommand(id));
  }

  /** Sends a `hookpilot.test` event to this endpoint only. */
  @Post(':id/test')
  async test(@Param('id') id: string) {
    const { event, deliveries } = await this.commandBus.execute<SendTestEventCommand, PublishEventResult>(new SendTestEventCommand(id));
    return { event: toEventResponse(event), deliveryId: deliveries[0]?.id ?? null };
  }
}
