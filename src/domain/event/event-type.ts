import { ValidationError } from '../shared/domain-error';

/** Dot-separated segments of letters, digits, `_` or `-`, e.g. `invoice.paid`. */
export const EVENT_TYPE_PATTERN = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/;

/** Value object: the type of an event, e.g. `invoice.paid`. */
export class EventType {
  private constructor(readonly value: string) {}

  static create(value: string): EventType {
    if (value.length > 128 || !EVENT_TYPE_PATTERN.test(value)) {
      throw new ValidationError('type must be dot-separated segments of letters, digits, _ or -');
    }
    return new EventType(value);
  }

  /** Rebuilds a type that was validated when it was saved. */
  static fromStored(value: string): EventType {
    return new EventType(value);
  }

  toString(): string {
    return this.value;
  }
}
