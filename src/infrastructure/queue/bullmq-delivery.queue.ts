import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { DeliveryQueue } from '../../application/ports/delivery-queue';

export const DELIVERY_QUEUE_NAME = 'hookpilot-deliveries';

/** A job only carries the delivery ID; everything else is read from Postgres when the job runs. */
export interface DeliveryJobData {
  deliveryId: string;
}

/** DeliveryQueue adapter on top of the BullMQ queue registered in InfrastructureModule. */
@Injectable()
export class BullMqDeliveryQueue implements DeliveryQueue {
  constructor(@InjectQueue(DELIVERY_QUEUE_NAME) private readonly queue: Queue<DeliveryJobData>) {}

  /** The job ID is the delivery ID, so adding a delivery whose job is already waiting does nothing. */
  async enqueue(deliveryIds: string[]): Promise<void> {
    if (deliveryIds.length === 0) return;
    await this.queue.addBulk(
      deliveryIds.map((deliveryId) => ({ name: 'deliver', data: { deliveryId }, opts: { jobId: deliveryId } })),
    );
  }

  async isHealthy(): Promise<boolean> {
    // BullMQ types the client as a narrow interface; at runtime it is an ioredis client.
    const client = (await this.queue.client) as unknown as Redis;
    return (await client.ping()) === 'PONG';
  }
}
