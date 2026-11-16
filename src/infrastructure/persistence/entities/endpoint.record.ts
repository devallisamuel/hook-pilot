import { Column, DeleteDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { timestamp } from './timestamp';

/** TypeORM mapping of the `endpoints` table. Converted to/from the domain Endpoint by the repository. */
@Entity('endpoints')
export class EndpointRecord {
  @PrimaryColumn('text') id: string;
  @Column('text') url: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ name: 'event_types', type: 'text', array: true }) eventTypes: string[];
  @timestamp('created_at') createdAt: Date;
  @timestamp('updated_at') updatedAt: Date;
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', precision: 3, nullable: true }) deletedAt: Date | null;
}
