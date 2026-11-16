import { randomBytes } from 'node:crypto';

export type IdPrefix = 'ep' | 'evt' | 'dlv';

/** Prefixed, opaque identifiers (e.g. `evt_3f9a...`) so an ID's kind is obvious in logs. */
export function newId(prefix: IdPrefix): string {
  return `${prefix}_${randomBytes(12).toString('hex')}`;
}
