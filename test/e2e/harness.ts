import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import IORedis from 'ioredis';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule, configureHttpApp } from '../../src/app.module';
import { AppConfig, loadConfig } from '../../src/infrastructure/config/config';

export function testConfig(): AppConfig {
  return loadConfig({
    DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://hookpilot:hookpilot@localhost:55432/hookpilot_test',
    REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:56379/1',
    ALLOW_PRIVATE_NETWORKS: 'true',
    DELIVERY_TIMEOUT_MS: '500',
    DELIVERY_RETRIES: '3',
    DELIVERY_RETRY_DELAY_MS: '50',
    RECONCILE_INTERVAL_MS: '500',
  });
}

/** Wipes the test database and Redis so every run starts from migrations. */
export async function resetInfrastructure(config: AppConfig): Promise<void> {
  const pg = new Client({ connectionString: config.databaseUrl });
  await pg.connect();
  await pg.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await pg.end();
  const redis = new IORedis(config.redisUrl, { maxRetriesPerRequest: 1 });
  await redis.flushdb();
  redis.disconnect();
}

export async function startApp(config: AppConfig): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot({ config, api: true, worker: true })],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: ['error'] });
  configureHttpApp(app);
  await app.init();
  return app;
}

export interface ReceivedWebhook {
  headers: http.IncomingHttpHeaders;
  body: string;
}

/** Receiver response that never answers, forcing a timeout. */
export const NO_ANSWER = 0;

/** A local webhook receiver whose responses can be scripted per test. */
export class Receiver {
  readonly received: ReceivedWebhook[] = [];
  /** Status codes to return, in order; the last entry repeats. `NO_ANSWER` never responds. */
  responses: number[] = [200];
  private server!: http.Server;
  url!: string;

  async start(): Promise<this> {
    this.server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        this.received.push({ headers: req.headers, body });
        const status = this.responses.length > 1 ? this.responses.shift()! : this.responses[0]!;
        if (status === NO_ANSWER) return; // leave the request hanging so the sender times out
        res.writeHead(status).end(`status ${status}`);
      });
    });
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}/webhooks`;
    return this;
  }

  async stop(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise((resolve) => this.server.close(resolve));
  }
}

export async function waitFor<T>(fn: () => Promise<T | undefined | null | false>, timeoutMs = 10_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (err) {
      last = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`waitFor timed out${last ? `: ${String(last)}` : ''}`);
}

/** Thin supertest wrapper around the app's HTTP server. */
export class ApiClient {
  constructor(private readonly app: INestApplication) {}

  get(path: string) {
    return request(this.app.getHttpServer()).get(path);
  }

  post(path: string, body?: object) {
    return request(this.app.getHttpServer()).post(path).send(body);
  }

  patch(path: string, body: object) {
    return request(this.app.getHttpServer()).patch(path).send(body);
  }

  delete(path: string) {
    return request(this.app.getHttpServer()).delete(path);
  }
}

/** Empties every table so each test starts from a clean slate. */
export async function clearData(app: INestApplication): Promise<void> {
  await app.get(DataSource).query('TRUNCATE deliveries, events, endpoints CASCADE');
}
