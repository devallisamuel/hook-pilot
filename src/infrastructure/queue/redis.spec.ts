import { redisConnectionFromUrl } from './redis';

describe('redisConnectionFromUrl', () => {
  it('parses host, port and database', () => {
    expect(redisConnectionFromUrl('redis://localhost:56379/1')).toMatchObject({
      host: 'localhost',
      port: 56379,
      db: 1,
      tls: undefined,
      password: undefined,
      maxRetriesPerRequest: null,
    });
  });

  it('defaults the port and database', () => {
    expect(redisConnectionFromUrl('redis://cache')).toMatchObject({ host: 'cache', port: 6379, db: 0 });
  });

  it('enables TLS and decodes credentials for rediss:// (ElastiCache)', () => {
    expect(redisConnectionFromUrl('rediss://:p%40ss@master.example.cache.amazonaws.com:6379/0')).toMatchObject({
      host: 'master.example.cache.amazonaws.com',
      password: 'p@ss',
      tls: {},
    });
  });

  it('rejects other schemes', () => {
    expect(() => redisConnectionFromUrl('http://localhost:6379')).toThrow('redis://');
  });
});
