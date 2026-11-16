import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { DeliveryQueue } from '../../application/ports/delivery-queue';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly queue: DeliveryQueue,
  ) {}

  @Get()
  async check() {
    const [database, redis] = await Promise.all([
      this.dataSource.query('SELECT 1').then(() => true, () => false),
      this.queue.isHealthy().catch(() => false),
    ]);
    const body = { status: database && redis ? 'ok' : 'degraded', database, redis };
    if (body.status !== 'ok') throw new ServiceUnavailableException(body);
    return body;
  }
}
