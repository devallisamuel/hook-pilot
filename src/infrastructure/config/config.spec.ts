import { ConfigError, loadConfig } from './config';

const base = {
  DATABASE_URL: 'postgres://localhost/db',
  REDIS_URL: 'redis://localhost',
};

describe('loadConfig', () => {
  it('applies safe defaults', () => {
    const config = loadConfig(base);
    expect(config.allowPrivateNetworks).toBe(false);
    expect(config.delivery.timeoutMs).toBe(10_000);
    expect(config.delivery.retries).toBe(3);
    expect(config.delivery.retryDelayMs).toBe(2_000);
  });

  it('gives a PROCESSING delivery a minute more than the slowest possible run before calling it stuck', () => {
    const config = loadConfig({ ...base, DELIVERY_TIMEOUT_MS: '1000', DELIVERY_RETRIES: '2', DELIVERY_RETRY_DELAY_MS: '500' });
    // 3 calls x 1000ms + 2 pauses x 500ms = 4000ms
    expect(config.delivery.stuckProcessingMs).toBe(4_000 + 60_000);
  });

  it.each([
    [{ DATABASE_URL: undefined }],
    [{ REDIS_URL: '  ' }],
    [{ DELIVERY_RETRIES: '-1' }],
    [{ DELIVERY_TIMEOUT_MS: '50' }],
    [{ PORT: 'abc' }],
    [{ ALLOW_PRIVATE_NETWORKS: 'maybe' }],
  ])('rejects invalid input %j', (override) => {
    expect(() => loadConfig({ ...base, ...override })).toThrow(ConfigError);
  });
});
