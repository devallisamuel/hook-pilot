import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { ValidationError } from '../../domain/shared/domain-error';
import { Page, PageRequest } from '../../domain/shared/page';

interface Cursor {
  createdAt: Date;
  id: string;
}

export function encodeCursor(row: Cursor): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`).toString('base64url');
}

export function decodeCursor(cursor: string): Cursor {
  const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const createdAt = new Date(iso ?? '');
  if (!id || Number.isNaN(createdAt.getTime())) throw new ValidationError('Invalid cursor');
  return { createdAt, id };
}

/**
 * Keyset pagination, newest first, mapping each record to a domain object.
 * `created_at` columns are `timestamptz(3)`, so they round-trip exactly
 * through a JavaScript Date in the cursor.
 */
export async function paginate<R extends ObjectLiteral & Cursor, T>(
  qb: SelectQueryBuilder<R>,
  page: PageRequest,
  toDomain: (record: R) => T,
): Promise<Page<T>> {
  const alias = qb.alias;
  const limit = page.limit ?? 20;
  if (page.cursor) {
    const { createdAt, id } = decodeCursor(page.cursor);
    qb.andWhere(`(${alias}.createdAt, ${alias}.id) < (:cursorCreatedAt, :cursorId)`, { cursorCreatedAt: createdAt, cursorId: id });
  }
  const rows = await qb
    .orderBy(`${alias}.createdAt`, 'DESC')
    .addOrderBy(`${alias}.id`, 'DESC')
    .limit(limit + 1)
    .getMany();
  const data = rows.slice(0, limit);
  const last = data[data.length - 1];
  return { data: data.map(toDomain), nextCursor: rows.length > limit && last ? encodeCursor(last) : null };
}
