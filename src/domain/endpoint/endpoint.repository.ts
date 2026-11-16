import { Page, PageRequest } from '../shared/page';
import { Endpoint } from './endpoint';

/**
 * Port for storing endpoints. Declared as an abstract class so NestJS can use
 * it as an injection token; the TypeORM implementation lives in infrastructure.
 */
export abstract class EndpointRepository {
  /** Active (not deleted) endpoint, or null. */
  abstract findById(id: string): Promise<Endpoint | null>;
  /** Includes deleted endpoints, so a delivery can tell its endpoint was removed. */
  abstract findByIdIncludingDeleted(id: string): Promise<Endpoint | null>;
  abstract findAllActive(): Promise<Endpoint[]>;
  abstract findPage(page: PageRequest): Promise<Page<Endpoint>>;
  abstract save(endpoint: Endpoint): Promise<void>;
}
