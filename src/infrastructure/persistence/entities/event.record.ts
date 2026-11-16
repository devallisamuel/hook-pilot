import { Column, Entity, PrimaryColumn } from 'typeorm';
import { timestamp } from './timestamp';

/** TypeORM mapping of the `events` table. */
@Entity('events')
export class EventRecord {
  @PrimaryColumn('text') id: string;
  @Column('text') type: string;
  // `any` because TypeORM's insert typing rejects `unknown` values in jsonb columns.
  @Column('jsonb') payload: Record<string, any>;
  @Column({ name: 'idempotency_key', type: 'text', nullable: true }) idempotencyKey: string | null;
  @timestamp('created_at') createdAt: Date;
}
