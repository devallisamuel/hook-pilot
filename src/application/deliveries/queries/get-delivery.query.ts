import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Delivery } from '../../../domain/delivery/delivery';
import { DeliveryRepository } from '../../../domain/delivery/delivery.repository';
import { NotFoundError } from '../../../domain/shared/domain-error';

/** A delivery, including its last request and response. */
export class GetDeliveryQuery {
  constructor(readonly deliveryId: string) {}
}

@QueryHandler(GetDeliveryQuery)
export class GetDeliveryHandler implements IQueryHandler<GetDeliveryQuery, Delivery> {
  constructor(private readonly deliveries: DeliveryRepository) {}

  async execute({ deliveryId }: GetDeliveryQuery): Promise<Delivery> {
    const delivery = await this.deliveries.findById(deliveryId);
    if (!delivery) throw new NotFoundError('Delivery not found');
    return delivery;
  }
}
