/** Which page of a newest-first list to read. */
export interface PageRequest {
  limit?: number;
  /** Opaque cursor from a previous page's `nextCursor`. */
  cursor?: string;
}

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}
