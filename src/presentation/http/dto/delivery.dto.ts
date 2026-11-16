import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Delivery } from '../../../domain/delivery/delivery';
import { DeliveryStatus } from '../../../domain/delivery/delivery-status';
import { PageQueryDto } from './page-query.dto';

export class ListDeliveriesQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: DeliveryStatus })
  @IsOptional()
  @IsEnum(DeliveryStatus)
  status?: DeliveryStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endpointId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  eventId?: string;
}

/** Summary used in lists. */
export const toDeliveryResponse = (d: Delivery) => ({
  id: d.id,
  eventId: d.eventId,
  endpointId: d.endpointId,
  status: d.status,
  attemptCount: d.attemptCount,
  lastStatusCode: d.response?.statusCode ?? null,
  lastError: d.lastError,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
});

/** A single delivery: the summary plus the last request and response. */
export const toDeliveryDetailResponse = (d: Delivery) => ({
  ...toDeliveryResponse(d),
  request: d.request,
  response: d.response,
});
