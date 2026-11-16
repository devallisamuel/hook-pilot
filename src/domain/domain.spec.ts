import { CallResult, outcomeOf } from './delivery/call-result';
import { Delivery } from './delivery/delivery';
import { DeliveryStatus } from './delivery/delivery-status';
import { Endpoint } from './endpoint/endpoint';
import { EndpointUrl } from './endpoint/endpoint-url';
import { EventTypeFilter } from './endpoint/event-type-filter';
import { isPublicAddress } from './endpoint/network-address';
import { EventType } from './event/event-type';
import { WebhookEvent } from './event/webhook-event';
import { ConflictError, ValidationError } from './shared/domain-error';

describe('EventType', () => {
  it.each(['invoice.paid', 'user', 'a-b_c.d1'])('accepts %s', (type) => {
    expect(EventType.create(type).value).toBe(type);
  });

  it.each(['invoice.*', 'invoice..paid', 'bad type', '', 'x'.repeat(129)])('rejects %j', (type) => {
    expect(() => EventType.create(type)).toThrow(ValidationError);
  });
});

describe('EventTypeFilter', () => {
  it.each([
    [[], 'invoice.paid', true],
    [['*'], 'anything.at.all', true],
    [['invoice.paid'], 'invoice.paid', true],
    [['invoice.paid'], 'invoice.created', false],
    [['invoice.*'], 'invoice.paid', true],
    [['invoice.*'], 'invoice.payment.failed', true],
    [['invoice.*'], 'invoices.paid', false],
    [['invoice.*'], 'invoice', false],
    [['user.created', 'invoice.*'], 'user.created', true],
  ])('%j matches %s -> %s', (patterns, type, expected) => {
    expect(EventTypeFilter.create(patterns).matches(EventType.create(type))).toBe(expected);
  });

  it('removes duplicates', () => {
    expect(EventTypeFilter.create(['a.*', 'a.*', 'b']).patterns).toEqual(['a.*', 'b']);
  });

  it.each(['*.paid', 'bad filter', 'a.**'])('rejects %s', (pattern) => {
    expect(() => EventTypeFilter.create([pattern])).toThrow(ValidationError);
  });
});

describe('isPublicAddress', () => {
  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])('allows public %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });

  it.each([
    '127.0.0.1',
    '10.0.0.5',
    '172.16.3.4',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    'not-an-ip',
  ])('blocks %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });
});

describe('EndpointUrl', () => {
  const publicOnly = { allowPrivateNetworks: false };

  it('accepts public http(s) URLs', () => {
    expect(EndpointUrl.create('https://example.com/hooks', publicOnly).value).toBe('https://example.com/hooks');
    expect(EndpointUrl.create('http://8.8.8.8/hooks', publicOnly).value).toBe('http://8.8.8.8/hooks');
  });

  it.each([
    'ftp://example.com',
    'not a url',
    'https://user:pass@example.com',
    'http://localhost:3000',
    'http://api.localhost',
    'http://127.0.0.1',
    'http://[::1]/x',
    'http://169.254.169.254/latest/meta-data',
    'http://metadata.google.internal',
  ])('rejects %s', (url) => {
    expect(() => EndpointUrl.create(url, publicOnly)).toThrow(ValidationError);
  });

  it('allows private targets only when explicitly enabled', () => {
    expect(EndpointUrl.create('http://localhost:3000', { allowPrivateNetworks: true }).value).toBe('http://localhost:3000/');
    expect(() => EndpointUrl.create('ftp://localhost', { allowPrivateNetworks: true })).toThrow(ValidationError);
  });
});

describe('Endpoint', () => {
  const create = (eventTypes: string[] = []) =>
    Endpoint.create({
      url: EndpointUrl.create('https://example.com/hooks', { allowPrivateNetworks: false }),
      eventTypes: EventTypeFilter.create(eventTypes),
    });

  it('wants events matching its filter', () => {
    const endpoint = create(['invoice.*']);
    expect(endpoint.wants(EventType.create('invoice.paid'))).toBe(true);
    expect(endpoint.wants(EventType.create('user.created'))).toBe(false);
  });

  it('wants nothing once deleted', () => {
    const endpoint = create();
    endpoint.delete();
    expect(endpoint.isDeleted).toBe(true);
    expect(endpoint.wants(EventType.create('invoice.paid'))).toBe(false);
  });
});

describe('WebhookEvent', () => {
  it('builds the body every endpoint receives', () => {
    const event = WebhookEvent.create({ type: EventType.create('invoice.paid'), payload: { amount: 42 } });
    expect(JSON.parse(event.toWebhookBody())).toEqual({
      id: event.id,
      type: 'invoice.paid',
      timestamp: event.createdAt.toISOString(),
      data: { amount: 42 },
    });
  });
});

describe('outcomeOf', () => {
  const result = (partial: Partial<CallResult>): CallResult => ({
    statusCode: null,
    responseBody: null,
    errorCode: null,
    error: null,
    durationMs: 1,
    ...partial,
  });

  it('2xx is SUCCESSFUL', () => {
    expect(outcomeOf(result({ statusCode: 200 }))).toBe(DeliveryStatus.Successful);
    expect(outcomeOf(result({ statusCode: 204 }))).toBe(DeliveryStatus.Successful);
  });

  it.each([301, 400, 404, 410, 500, 503])('any other answer (%i) is FAILED', (statusCode) => {
    expect(outcomeOf(result({ statusCode }))).toBe(DeliveryStatus.Failed);
  });

  it('a URL we refuse to call is FAILED', () => {
    expect(outcomeOf(result({ errorCode: 'blocked_address' }))).toBe(DeliveryStatus.Failed);
    expect(outcomeOf(result({ errorCode: 'invalid_url' }))).toBe(DeliveryStatus.Failed);
  });

  it('no answer is UNCERTAIN', () => {
    expect(outcomeOf(result({ errorCode: 'timeout' }))).toBe(DeliveryStatus.Uncertain);
    expect(outcomeOf(result({ errorCode: 'network' }))).toBe(DeliveryStatus.Uncertain);
  });
});

describe('Delivery life cycle', () => {
  const request = { url: 'https://example.com', headers: {}, sentAt: new Date().toISOString() };
  const call = (partial: Partial<CallResult>): CallResult => ({
    statusCode: null,
    responseBody: null,
    errorCode: null,
    error: null,
    durationMs: 5,
    ...partial,
  });
  const processing = () => {
    const delivery = Delivery.schedule('evt_1', 'ep_1');
    delivery.startProcessing();
    return delivery;
  };

  it('starts PENDING with no attempts', () => {
    const delivery = Delivery.schedule('evt_1', 'ep_1');
    expect(delivery.status).toBe(DeliveryStatus.Pending);
    expect(delivery.attemptCount).toBe(0);
  });

  it('records a 2xx as SUCCESSFUL', () => {
    const delivery = processing();
    delivery.recordCalls(1, request, call({ statusCode: 200, responseBody: 'ok' }));
    expect(delivery.status).toBe(DeliveryStatus.Successful);
    expect(delivery.attemptCount).toBe(1);
    expect(delivery.lastError).toBeNull();
    expect(delivery.response).toEqual({ statusCode: 200, body: 'ok', error: null, durationMs: 5 });
  });

  it('records any other answer as FAILED', () => {
    const delivery = processing();
    delivery.recordCalls(1, request, call({ statusCode: 500 }));
    expect(delivery.status).toBe(DeliveryStatus.Failed);
    expect(delivery.lastError).toBe('Endpoint responded with HTTP 500');
  });

  it('records no answer after several calls as UNCERTAIN', () => {
    const delivery = processing();
    delivery.recordCalls(4, request, call({ errorCode: 'timeout', error: 'Timed out after 500ms' }));
    expect(delivery.status).toBe(DeliveryStatus.Uncertain);
    expect(delivery.attemptCount).toBe(4);
    expect(delivery.lastError).toBe('Timed out after 500ms');
  });

  it('only processes PENDING deliveries', () => {
    const delivery = processing();
    expect(() => delivery.startProcessing()).toThrow(ConflictError);
  });

  it.each([DeliveryStatus.Failed, DeliveryStatus.Uncertain])('replays a %s delivery back to PENDING', (status) => {
    const delivery = processing();
    if (status === DeliveryStatus.Failed) delivery.failWithoutCalling('Endpoint has been deleted');
    else delivery.markAbandoned();

    delivery.replay();
    expect(delivery.status).toBe(DeliveryStatus.Pending);
    expect(delivery.lastError).toBeNull();
  });

  it('refuses to replay a PENDING, PROCESSING or SUCCESSFUL delivery', () => {
    const successful = processing();
    successful.recordCalls(1, request, call({ statusCode: 200 }));
    for (const delivery of [Delivery.schedule('evt_1', 'ep_1'), processing(), successful]) {
      expect(() => delivery.replay()).toThrow(ConflictError);
    }
  });
});
