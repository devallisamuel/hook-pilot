import { INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { DataSource } from 'typeorm';
import { RecoverStuckDeliveriesCommand } from '../../src/application/deliveries/commands/recover-stuck-deliveries.command';
import { ApiClient, clearData, NO_ANSWER, Receiver, resetInfrastructure, startApp, testConfig, waitFor } from './harness';

// Test timing (see testConfig): 500ms timeout, 3 retries, 50ms between retries.

describe('Hook Pilot (e2e)', () => {
  let app: INestApplication;
  let api: ApiClient;
  let receiver: Receiver;

  beforeAll(async () => {
    const config = testConfig();
    await resetInfrastructure(config);
    app = await startApp(config);
    api = new ApiClient(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    receiver = await new Receiver().start();
    await clearData(app);
  });

  afterEach(async () => {
    await receiver.stop();
  });

  const createEndpoint = async (body: object = {}) =>
    (await api.post('/v1/endpoints', { url: receiver.url, ...body }).expect(201)).body as { id: string; url: string };

  const publish = async (type = 'order.created', payload: object = {}) =>
    (await api.post('/v1/events', { type, payload }).expect(201)).body;

  const waitForStatus = (deliveryId: string, status: string) =>
    waitFor(async () => {
      const res = await api.get(`/v1/deliveries/${deliveryId}`).expect(200);
      return res.body.status === status ? res.body : null;
    });


  it('reports healthy infrastructure', async () => {
    await api.get('/health').expect(200, { status: 'ok', database: true, redis: true });
  });

  it('saves the delivery as PENDING, then marks it SUCCESSFUL when the endpoint answers 200', async () => {
    const endpoint = await createEndpoint();
    const event = await publish('invoice.paid', { amount: 4200 });
    expect(event.deliveries).toHaveLength(1);
    expect(event.deliveries[0].status).toBe('PENDING');

    const delivery = await waitForStatus(event.deliveries[0].id, 'SUCCESSFUL');
    expect(delivery.attemptCount).toBe(1);
    expect(delivery.lastError).toBeNull();
    expect(delivery.request.url).toBe(endpoint.url);
    expect(delivery.request.headers).toMatchObject({ 'webhook-id': event.id, 'hookpilot-attempt': '1' });
    expect(delivery.response).toMatchObject({ statusCode: 200, body: 'status 200', error: null });

    const [hook] = receiver.received;
    expect(hook!.headers).toMatchObject({ 'webhook-id': event.id, 'hookpilot-event-type': 'invoice.paid' });
    expect(JSON.parse(hook!.body)).toEqual({ id: event.id, type: 'invoice.paid', timestamp: event.createdAt, data: { amount: 4200 } });
  });

  it.each([400, 404, 500])('marks it FAILED straight away when the endpoint answers %i (no retries)', async (statusCode) => {
    receiver.responses = [statusCode];
    await createEndpoint();
    const event = await publish();

    const delivery = await waitForStatus(event.deliveries[0].id, 'FAILED');
    expect(delivery.attemptCount).toBe(1);
    expect(delivery.lastStatusCode).toBe(statusCode);
    expect(delivery.lastError).toBe(`Endpoint responded with HTTP ${statusCode}`);
    expect(receiver.received).toHaveLength(1);
  });

  it('retries 3 times when the endpoint never answers, then marks it UNCERTAIN', async () => {
    receiver.responses = [NO_ANSWER];
    await createEndpoint();
    const event = await publish();

    const delivery = await waitForStatus(event.deliveries[0].id, 'UNCERTAIN');
    expect(delivery.attemptCount).toBe(4); // first call + 3 retries
    expect(delivery.response).toMatchObject({ statusCode: null, error: 'Timed out after 500ms' });
    expect(receiver.received).toHaveLength(4);
  });

  it('stops retrying as soon as the endpoint answers', async () => {
    receiver.responses = [NO_ANSWER, NO_ANSWER, 200];
    await createEndpoint();
    const event = await publish();

    const delivery = await waitForStatus(event.deliveries[0].id, 'SUCCESSFUL');
    expect(delivery.attemptCount).toBe(3);
    expect(receiver.received.map((hook) => hook.headers['hookpilot-attempt'])).toEqual(['1', '2', '3']);
  });

  it('replays an UNCERTAIN delivery on the same row', async () => {
    receiver.responses = [NO_ANSWER, NO_ANSWER, NO_ANSWER, NO_ANSWER, 200];
    await createEndpoint();
    const event = await publish();
    const deliveryId = event.deliveries[0].id;
    await waitForStatus(deliveryId, 'UNCERTAIN');

    const replayed = (await api.post(`/v1/deliveries/${deliveryId}/replay`).expect(200)).body;
    expect(replayed).toMatchObject({ id: deliveryId, status: 'PENDING' });

    const delivery = await waitForStatus(deliveryId, 'SUCCESSFUL');
    expect(delivery.attemptCount).toBe(5); // 4 calls before the replay + 1 after
    expect(receiver.received.at(-1)!.headers['webhook-id']).toBe(event.id);
  });

  it('replays a FAILED delivery', async () => {
    receiver.responses = [400, 200];
    await createEndpoint();
    const event = await publish();
    const deliveryId = event.deliveries[0].id;
    await waitForStatus(deliveryId, 'FAILED');

    await api.post(`/v1/deliveries/${deliveryId}/replay`).expect(200);
    await waitForStatus(deliveryId, 'SUCCESSFUL');
  });

  it('refuses to replay a SUCCESSFUL delivery', async () => {
    await createEndpoint();
    const event = await publish();
    await waitForStatus(event.deliveries[0].id, 'SUCCESSFUL');

    await api.post(`/v1/deliveries/${event.deliveries[0].id}/replay`).expect(409);
  });

  it('marks a delivery UNCERTAIN when its worker died mid-call', async () => {
    const endpoint = await createEndpoint();
    const event = await publish();
    await waitForStatus(event.deliveries[0].id, 'SUCCESSFUL');

    // A delivery that has been PROCESSING for 10 minutes: its worker is gone.
    await app.get(DataSource).query(
      `INSERT INTO deliveries (id, event_id, endpoint_id, status, attempt_count, updated_at)
       VALUES ('dlv_stuck', $1, $2, 'PROCESSING', 1, now() - interval '10 minutes')`,
      [event.id, endpoint.id],
    );
    await app.get(CommandBus).execute(new RecoverStuckDeliveriesCommand());

    const delivery = (await api.get('/v1/deliveries/dlv_stuck').expect(200)).body;
    expect(delivery.status).toBe('UNCERTAIN');
    expect(delivery.lastError).toBe('Worker stopped while calling the endpoint');
  });

  it('queues a PENDING delivery that never made it onto the queue', async () => {
    const endpoint = await createEndpoint();
    const event = await publish();
    await waitForStatus(event.deliveries[0].id, 'SUCCESSFUL');

    // Saved 5 minutes ago, but its job was lost (e.g. Redis was down).
    await app.get(DataSource).query(
      `INSERT INTO deliveries (id, event_id, endpoint_id, status, attempt_count, updated_at)
       VALUES ('dlv_lost', $1, $2, 'PENDING', 0, now() - interval '5 minutes')`,
      [event.id, endpoint.id],
    );
    await app.get(CommandBus).execute(new RecoverStuckDeliveriesCommand());

    await waitForStatus('dlv_lost', 'SUCCESSFUL');
  });

  it('returns the same event for a repeated idempotency key', async () => {
    await createEndpoint();
    const first = await api.post('/v1/events', { type: 'user.created', payload: { n: 1 } }).set('idempotency-key', 'signup-42').expect(201);
    const second = await api.post('/v1/events', { type: 'user.created', payload: { n: 2 } }).set('idempotency-key', 'signup-42').expect(200);

    expect(second.body.id).toBe(first.body.id);
    expect(second.body.payload).toEqual({ n: 1 });
    await waitForStatus(first.body.deliveries[0].id, 'SUCCESSFUL');
    expect(receiver.received).toHaveLength(1);
  });

  it('only creates deliveries for endpoints subscribed to the event type', async () => {
    const invoices = await createEndpoint({ eventTypes: ['invoice.*'] });
    const users = await createEndpoint({ eventTypes: ['user.created'] });
    const everything = await createEndpoint();

    const invoice = await publish('invoice.paid');
    expect(invoice.deliveries.map((d: { endpointId: string }) => d.endpointId).sort()).toEqual([invoices.id, everything.id].sort());

    const user = await publish('user.created');
    expect(user.deliveries.map((d: { endpointId: string }) => d.endpointId).sort()).toEqual([users.id, everything.id].sort());
  });

  it('updates an endpoint', async () => {
    const endpoint = await createEndpoint();
    const updated = (await api.patch(`/v1/endpoints/${endpoint.id}`, { eventTypes: ['user.*'], description: 'Users' }).expect(200)).body;
    expect(updated).toMatchObject({ id: endpoint.id, eventTypes: ['user.*'], description: 'Users' });
    expect((await publish('invoice.paid')).deliveries).toEqual([]);
    expect((await publish('user.created')).deliveries).toHaveLength(1);
  });

  it('skips deleted endpoints', async () => {
    const deleted = await createEndpoint();
    await api.delete(`/v1/endpoints/${deleted.id}`).expect(204);
    await api.get(`/v1/endpoints/${deleted.id}`).expect(404);

    const event = await publish();
    expect(event.deliveries).toEqual([]);
  });

  it('sends a test event to one endpoint', async () => {
    const endpoint = await createEndpoint({ eventTypes: ['invoice.*'] });
    const test = (await api.post(`/v1/endpoints/${endpoint.id}/test`).expect(201)).body;
    await waitForStatus(test.deliveryId, 'SUCCESSFUL');
    expect(JSON.parse(receiver.received[0]!.body).type).toBe('hookpilot.test');
    await api.post('/v1/endpoints/ep_missing/test').expect(404);
  });

  it('refuses to replay a delivery whose endpoint was deleted', async () => {
    receiver.responses = [400];
    const endpoint = await createEndpoint();
    const event = await publish();
    await waitForStatus(event.deliveries[0].id, 'FAILED');
    await api.delete(`/v1/endpoints/${endpoint.id}`).expect(204);

    const res = await api.post(`/v1/deliveries/${event.deliveries[0].id}/replay`).expect(409);
    expect(res.body.message).toBe('Endpoint has been deleted');
  });

  it('validates input', async () => {
    await api.post('/v1/endpoints', { url: 'ftp://example.com' }).expect(400);
    await api.post('/v1/endpoints', { url: receiver.url, eventTypes: ['*.bad'] }).expect(400);
    await api.post('/v1/endpoints', { url: receiver.url, unknown: true }).expect(400);
    await api.post('/v1/events', { type: 'bad type', payload: {} }).expect(400);
    await api.post('/v1/events', { type: 'ok.type', payload: 'not-an-object' }).expect(400);
    await api.get('/v1/deliveries?status=DONE').expect(400);
    await api.get('/v1/events?limit=1000').expect(400);
    await api.get('/v1/events?cursor=garbage').expect(400);
    await api.get('/v1/deliveries/dlv_missing').expect(404);
  });

  it('lists newest first with cursors', async () => {
    for (let i = 0; i < 5; i++) await publish('page.test', { i });
    const seen: number[] = [];
    let cursor: string | null = null;
    do {
      const page: { body: { data: { payload: { i: number } }[]; nextCursor: string | null } } = await api
        .get(`/v1/events?limit=2${cursor ? `&cursor=${cursor}` : ''}`)
        .expect(200);
      seen.push(...page.body.data.map((e) => e.payload.i));
      cursor = page.body.nextCursor;
    } while (cursor);
    expect(seen).toEqual([4, 3, 2, 1, 0]);
  });
});
