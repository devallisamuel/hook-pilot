import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { Endpoint } from '../../../domain/endpoint/endpoint';

/** Request body checks only (shape and size). Business rules live in the domain value objects. */
export class CreateEndpointDto {
  @ApiProperty({ example: 'https://example.com/webhooks' })
  @IsString()
  @MaxLength(2048)
  url: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Event types to receive. Supports exact types, `prefix.*` and `*`. Empty or omitted = all.',
    example: ['invoice.*', 'customer.created'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  eventTypes?: string[];
}

export class UpdateEndpointDto extends PartialType(CreateEndpointDto) {}

/** Public JSON shape of an endpoint. */
export const toEndpointResponse = (e: Endpoint) => ({
  id: e.id,
  url: e.url.value,
  description: e.description,
  eventTypes: e.eventTypes.patterns,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});
