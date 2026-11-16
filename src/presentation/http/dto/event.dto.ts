import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { WebhookEvent } from '../../../domain/event/webhook-event';
import { PageQueryDto } from './page-query.dto';

export class CreateEventDto {
  @ApiProperty({ example: 'invoice.paid' })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty({ example: { invoiceId: 'inv_123', amount: 4200, currency: 'USD' } })
  @IsObject()
  payload: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Alternative to the Idempotency-Key header.' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;
}

export class ListEventsQueryDto extends PageQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  type?: string;
}

/** Public JSON shape of an event. */
export const toEventResponse = (e: WebhookEvent) => ({
  id: e.id,
  type: e.type.value,
  payload: e.payload,
  idempotencyKey: e.idempotencyKey,
  createdAt: e.createdAt,
});
