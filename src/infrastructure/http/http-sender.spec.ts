import dns from 'node:dns';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { outcomeOf } from '../../domain/delivery/call-result';
import { DeliveryStatus } from '../../domain/delivery/delivery-status';
import { sendWebhook } from './http-sender';

describe('sendWebhook', () => {
  let server: http.Server;
  let baseUrl: string;
  let handler: (req: http.IncomingMessage, res: http.ServerResponse) => void;

  beforeAll(async () => {
    server = http.createServer((req, res) => handler(req, res));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  const send = (overrides: Partial<Parameters<typeof sendWebhook>[0]> = {}) =>
    sendWebhook({
      url: `${baseUrl}/hook`,
      headers: { 'content-type': 'application/json', 'x-test': 'yes' },
      body: '{"hello":"world"}',
      timeoutMs: 2000,
      maxResponseBytes: 64,
      allowPrivateNetworks: true,
      ...overrides,
    });

  it('POSTs the body and headers and captures the response', async () => {
    let received: { method?: string; header?: string; body: string } = { body: '' };
    handler = (req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        received = { method: req.method, header: req.headers['x-test'] as string, body };
        res.writeHead(202).end('accepted');
      });
    };
    const result = await send();
    expect(result).toMatchObject({ statusCode: 202, responseBody: 'accepted', errorCode: null });
    expect(received).toEqual({ method: 'POST', header: 'yes', body: '{"hello":"world"}' });
  });

  it('truncates large response bodies', async () => {
    handler = (_req, res) => res.writeHead(200).end('x'.repeat(10_000));
    const result = await send();
    expect(result.statusCode).toBe(200);
    expect(result.responseBody).toHaveLength(64);
  });

  it('does not follow redirects', async () => {
    handler = (_req, res) => res.writeHead(302, { location: 'http://169.254.169.254/' }).end();
    const result = await send();
    expect(result.statusCode).toBe(302);
    expect(outcomeOf(result)).toBe(DeliveryStatus.Failed);
  });

  it('times out slow receivers', async () => {
    handler = () => undefined; // never responds
    const result = await send({ timeoutMs: 150 });
    expect(result.errorCode).toBe('timeout');
  });

  it('reports connection failures', async () => {
    const result = await send({ url: 'http://127.0.0.1:1/hook' });
    expect(result.errorCode).toBe('network');
  });

  it('refuses invalid URLs without sending', async () => {
    const result = await send({ url: 'ftp://example.com' });
    expect(result.errorCode).toBe('invalid_url');
  });

  it('blocks private IP literals when private networks are disallowed', async () => {
    const result = await send({ allowPrivateNetworks: false });
    expect(result.errorCode).toBe('blocked_address');
  });

  it('blocks hostnames that resolve to private addresses (checked at connect time)', async () => {
    // Simulates DNS rebinding: a public-looking name that resolves to loopback.
    const port = (server.address() as AddressInfo).port;
    const spy = jest.spyOn(dns, 'lookup').mockImplementation(((_host: string, _opts: unknown, cb: (...a: unknown[]) => void) =>
      cb(null, [{ address: '127.0.0.1', family: 4 }])) as unknown as typeof dns.lookup);
    try {
      const result = await send({ url: `http://hooks.example.com:${port}/hook`, allowPrivateNetworks: false });
      expect(result.errorCode).toBe('blocked_address');
      expect(result.error).toContain('127.0.0.1');
    } finally {
      spy.mockRestore();
    }
  });
});
