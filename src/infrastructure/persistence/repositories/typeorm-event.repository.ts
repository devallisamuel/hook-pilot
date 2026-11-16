import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Delivery } from '../../../domain/delivery/delivery';
import { DuplicateIdempotencyKeyError, EventRepository } from '../../../domain/event/event.repository';
import { WebhookEvent } from '../../../domain/event/webhook-event';
import { Page, PageRequest } from '../../../domain/shared/page';
import { DeliveryRecord } from '../entities/delivery.record';
import { EventRecord } from '../entities/event.record';
import { toDeliveryRecord, toEvent, toEventRecord } from '../mappers';
import { paginate } from '../paginate';

const isUniqueViolation = (err: unknown): boolean => {
  const e = err as { code?: string; driverError?: { code?: string } };
  return e?.code === '23505' || e?.driverError?.code === '23505';
};

@Injectable()
export class TypeOrmEventRepository implements EventRepository {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(EventRecord) private readonly records: Repository<EventRecord>,
  ) {}

  async findById(id: string): Promise<WebhookEvent | null> {
    const record = await this.records.findOneBy({ id });
    return record ? toEvent(record) : null;
  }

  async findByIdempotencyKey(key: string): Promise<WebhookEvent | null> {
    const record = await this.records.findOneBy({ idempotencyKey: key });
    return record ? toEvent(record) : null;
  }

  findPage(filter: { type?: string }, page: PageRequest): Promise<Page<WebhookEvent>> {
    const qb = this.records.createQueryBuilder('event');
    if (filter.type) qb.andWhere('event.type = :type', { type: filter.type });
    return paginate(qb, page, toEvent);
  }

  async saveWithDeliveries(event: WebhookEvent, deliveries: Delivery[]): Promise<void> {
    try {
      await this.dataSource.transaction(async (m) => {
        await m.insert(EventRecord, toEventRecord(event));
        if (deliveries.length) await m.insert(DeliveryRecord, deliveries.map(toDeliveryRecord));
      });
    } catch (err) {
      if (event.idempotencyKey && isUniqueViolation(err)) throw new DuplicateIdempotencyKeyError(event.idempotencyKey);
      throw err;
    }
  }
}
