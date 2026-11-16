import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Delivery } from '../../../domain/delivery/delivery';
import { DeliveryFilter, DeliveryRepository } from '../../../domain/delivery/delivery.repository';
import { DeliveryStatus } from '../../../domain/delivery/delivery-status';
import { Page, PageRequest } from '../../../domain/shared/page';
import { DeliveryRecord } from '../entities/delivery.record';
import { toDelivery, toDeliveryRecord } from '../mappers';
import { paginate } from '../paginate';

@Injectable()
export class TypeOrmDeliveryRepository implements DeliveryRepository {
  constructor(@InjectRepository(DeliveryRecord) private readonly records: Repository<DeliveryRecord>) {}

  async findById(id: string): Promise<Delivery | null> {
    const record = await this.records.findOneBy({ id });
    return record ? toDelivery(record) : null;
  }

  async findByEventId(eventId: string): Promise<Delivery[]> {
    return (await this.records.find({ where: { eventId }, order: { createdAt: 'ASC' } })).map(toDelivery);
  }

  findPage(filter: DeliveryFilter, page: PageRequest): Promise<Page<Delivery>> {
    const qb = this.records.createQueryBuilder('delivery');
    if (filter.status) qb.andWhere('delivery.status = :status', { status: filter.status });
    if (filter.endpointId) qb.andWhere('delivery.endpointId = :endpointId', { endpointId: filter.endpointId });
    if (filter.eventId) qb.andWhere('delivery.eventId = :eventId', { eventId: filter.eventId });
    return paginate(qb, page, toDelivery);
  }

  findPendingSince(before: Date, limit: number): Promise<Delivery[]> {
    return this.findStale(DeliveryStatus.Pending, before, limit);
  }

  findProcessingSince(before: Date, limit: number): Promise<Delivery[]> {
    return this.findStale(DeliveryStatus.Processing, before, limit);
  }

  /** A single conditional UPDATE: atomic, so concurrent writers can't both succeed. */
  async saveIfStatus(delivery: Delivery, expected: DeliveryStatus): Promise<boolean> {
    const { id, ...changes } = toDeliveryRecord(delivery);
    const result = await this.records.update({ id, status: expected }, changes);
    return result.affected === 1;
  }

  private async findStale(status: DeliveryStatus, before: Date, limit: number): Promise<Delivery[]> {
    const records = await this.records.find({ where: { status, updatedAt: LessThan(before) }, take: limit });
    return records.map(toDelivery);
  }
}
