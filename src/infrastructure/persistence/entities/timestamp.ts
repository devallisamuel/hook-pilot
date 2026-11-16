import { Column } from 'typeorm';

/**
 * Timestamps are set by the application, and stored with millisecond
 * precision (timestamptz(3)) so they round-trip exactly through JavaScript Dates.
 */
export const timestamp = (name: string, nullable = false) => Column({ name, type: 'timestamptz', precision: 3, nullable });
