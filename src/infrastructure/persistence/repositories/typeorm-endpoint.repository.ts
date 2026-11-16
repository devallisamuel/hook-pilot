import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Endpoint } from '../../../domain/endpoint/endpoint';
import { EndpointRepository } from '../../../domain/endpoint/endpoint.repository';
import { Page, PageRequest } from '../../../domain/shared/page';
import { EndpointRecord } from '../entities/endpoint.record';
import { toEndpoint, toEndpointRecord } from '../mappers';
import { paginate } from '../paginate';

@Injectable()
export class TypeOrmEndpointRepository implements EndpointRepository {
  constructor(@InjectRepository(EndpointRecord) private readonly records: Repository<EndpointRecord>) {}

  // TypeORM's find* methods skip soft-deleted rows (deleted_at set) unless withDeleted is used.

  async findById(id: string): Promise<Endpoint | null> {
    const record = await this.records.findOneBy({ id });
    return record ? toEndpoint(record) : null;
  }

  async findByIdIncludingDeleted(id: string): Promise<Endpoint | null> {
    const record = await this.records.findOne({ where: { id }, withDeleted: true });
    return record ? toEndpoint(record) : null;
  }

  async findAllActive(): Promise<Endpoint[]> {
    return (await this.records.find()).map(toEndpoint);
  }

  findPage(page: PageRequest): Promise<Page<Endpoint>> {
    return paginate(this.records.createQueryBuilder('endpoint'), page, toEndpoint);
  }

  async save(endpoint: Endpoint): Promise<void> {
    await this.records.save(toEndpointRecord(endpoint));
  }
}
