export const APP_CONFIG = Symbol('APP_CONFIG');

export interface DeliveryConfig {
  /** How long to wait for the endpoint to answer one call. */
  timeoutMs: number;
  /** Extra calls made when the endpoint does not answer (timeout / no response). */
  retries: number;
  /** Pause between those retries. */
  retryDelayMs: number;
  /** How many deliveries one worker process sends at the same time. */
  concurrency: number;
  /** How much of the endpoint's response body we save. */
  maxResponseBodyBytes: number;
  /** How often the reconciler looks for stuck deliveries. */
  reconcileIntervalMs: number;
  /** A delivery still PROCESSING after this long is assumed lost (its worker died). */
  stuckProcessingMs: number;
  /** A delivery still PENDING after this long was probably never queued. */
  stuckPendingMs: number;
}

export interface AppConfig {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  allowPrivateNetworks: boolean;
  runMigrations: boolean;
  delivery: DeliveryConfig;
}

export class ConfigError extends Error {}

type Env = Record<string, string | undefined>;

function required(env: Env, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new ConfigError(`Missing required environment variable ${name}`);
  return value;
}

function int(env: Env, name: string, fallback: number, min = 0): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new ConfigError(`${name} must be an integer >= ${min}, got "${raw}"`);
  }
  return value;
}

function bool(env: Env, name: string, fallback: boolean): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  throw new ConfigError(`${name} must be a boolean, got "${raw}"`);
}

export function loadConfig(env: Env = process.env): AppConfig {
  const timeoutMs = int(env, 'DELIVERY_TIMEOUT_MS', 10_000, 100);
  const retries = int(env, 'DELIVERY_RETRIES', 3, 0);
  const retryDelayMs = int(env, 'DELIVERY_RETRY_DELAY_MS', 2_000, 0);

  // The longest a healthy worker can spend on one delivery: every call times out.
  const longestProcessingMs = (retries + 1) * timeoutMs + retries * retryDelayMs;

  return {
    port: int(env, 'PORT', 4000, 0),
    databaseUrl: required(env, 'DATABASE_URL'),
    redisUrl: required(env, 'REDIS_URL'),
    allowPrivateNetworks: bool(env, 'ALLOW_PRIVATE_NETWORKS', false),
    runMigrations: bool(env, 'RUN_MIGRATIONS', true),
    delivery: {
      timeoutMs,
      retries,
      retryDelayMs,
      concurrency: int(env, 'WORKER_CONCURRENCY', 20, 1),
      maxResponseBodyBytes: int(env, 'MAX_RESPONSE_BODY_BYTES', 4096, 0),
      reconcileIntervalMs: int(env, 'RECONCILE_INTERVAL_MS', 15_000, 100),
      stuckProcessingMs: longestProcessingMs + 60_000,
      stuckPendingMs: 30_000,
    },
  };
}
