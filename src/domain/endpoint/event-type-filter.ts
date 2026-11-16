import { ValidationError } from '../shared/domain-error';
import { EventType } from '../event/event-type';

/** `*`, an exact type (`invoice.paid`), or a prefix wildcard (`invoice.*`). */
export const EVENT_FILTER_PATTERN = /^(\*|[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*(\.\*)?)$/;

/**
 * Value object: the event types an endpoint subscribes to.
 * An empty filter means "every event".
 */
export class EventTypeFilter {
  private constructor(readonly patterns: readonly string[]) {}

  static create(patterns: readonly string[] = []): EventTypeFilter {
    const invalid = patterns.find((p) => !EVENT_FILTER_PATTERN.test(p));
    if (invalid !== undefined) {
      throw new ValidationError(`"${invalid}" is not an event type, a prefix ending in .*, or *`);
    }
    return new EventTypeFilter([...new Set(patterns)]);
  }

  static fromStored(patterns: readonly string[]): EventTypeFilter {
    return new EventTypeFilter(patterns);
  }

  matches(type: EventType): boolean {
    if (this.patterns.length === 0) return true;
    return this.patterns.some((pattern) => {
      if (pattern === '*' || pattern === type.value) return true;
      return pattern.endsWith('.*') && type.value.startsWith(pattern.slice(0, -1));
    });
  }
}
