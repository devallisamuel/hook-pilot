import { Column, Entity, PrimaryColumn } from 'typeorm';
import { DeliveryRequest, DeliveryResponse } from '../../../domain/delivery/call-result';
import { DeliveryStatus } from '../../../domain/delivery/delivery-status';
import { timestamp } from './timestamp';

/** TypeORM mapping of the `deliveries` table. */
@Entity('deliveries')
export class DeliveryRecord {
  @PrimaryColumn('text') id: string;
  @Column({ name: 'event_id', type: 'text' }) eventId: string;
  @Column({ name: 'endpoint_id', type: 'text' }) endpointId: string;
  @Column('text') status: DeliveryStatus;
  @Column({ name: 'attempt_count', type: 'int' }) attemptCount: number;
  @Column({ name: 'last_error', type: 'text', nullable: true }) lastError: string | null;
  @Column({ type: 'jsonb', nullable: true }) request: DeliveryRequest | null;
  @Column({ type: 'jsonb', nullable: true }) response: DeliveryResponse | null;
  @timestamp('created_at') createdAt: Date;
  @timestamp('updated_at') updatedAt: Date;
}
