import { ValidationError } from '../../domain/shared/domain-error';
import { decodeCursor, encodeCursor } from './paginate';

describe('cursors', () => {
  it('round-trips millisecond timestamps and ids', () => {
    const row = { createdAt: new Date('2026-11-13T10:00:00.123Z'), id: 'evt_abc' };
    expect(decodeCursor(encodeCursor(row))).toEqual(row);
  });

  it('rejects garbage', () => {
    expect(() => decodeCursor('not-a-cursor')).toThrow(ValidationError);
  });
});
