import type { RedisOptions } from 'ioredis';

/**
 * Turns a `redis://` / `rediss://` URL into ioredis options for BullModule.
 * `rediss://` enables TLS (ElastiCache in-transit encryption); the path selects the DB.
 * BullMQ workers additionally require `maxRetriesPerRequest: null`.
 */
export function redisConnectionFromUrl(url: string): RedisOptions {
  const parsed = new URL(url);
  if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
    throw new Error(`REDIS_URL must use redis:// or rediss://, got ${parsed.protocol}`);
  }
  const db = parsed.pathname.replace(/^\//, '');
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: db ? Number(db) : 0,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  };
}
