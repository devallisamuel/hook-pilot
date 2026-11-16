import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1763300000000 implements MigrationInterface {
  name = 'InitialSchema1763300000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE endpoints (
        id           text PRIMARY KEY,
        url          text NOT NULL,
        description  text,
        event_types  text[] NOT NULL DEFAULT '{}',
        created_at   timestamptz(3) NOT NULL DEFAULT now(),
        updated_at   timestamptz(3) NOT NULL DEFAULT now(),
        deleted_at   timestamptz(3)
      )`);
    await q.query(`CREATE INDEX endpoints_created_idx ON endpoints (created_at DESC, id DESC) WHERE deleted_at IS NULL`);

    await q.query(`
      CREATE TABLE events (
        id               text PRIMARY KEY,
        type             text NOT NULL,
        payload          jsonb NOT NULL,
        idempotency_key  text,
        created_at       timestamptz(3) NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE UNIQUE INDEX events_idempotency_uq ON events (idempotency_key) WHERE idempotency_key IS NOT NULL`);
    await q.query(`CREATE INDEX events_created_idx ON events (created_at DESC, id DESC)`);

    await q.query(`
      CREATE TABLE deliveries (
        id             text PRIMARY KEY,
        event_id       text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        endpoint_id    text NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
        status         text NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'SUCCESSFUL', 'FAILED', 'UNCERTAIN')),
        attempt_count  integer NOT NULL DEFAULT 0,
        last_error     text,
        request        jsonb,
        response       jsonb,
        created_at     timestamptz(3) NOT NULL DEFAULT now(),
        updated_at     timestamptz(3) NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX deliveries_created_idx ON deliveries (created_at DESC, id DESC)`);
    await q.query(`CREATE INDEX deliveries_event_idx ON deliveries (event_id)`);
    await q.query(`CREATE INDEX deliveries_endpoint_idx ON deliveries (endpoint_id, created_at DESC)`);
    // Lets the reconciler find stuck PENDING / PROCESSING deliveries quickly.
    await q.query(`CREATE INDEX deliveries_active_idx ON deliveries (status, updated_at) WHERE status IN ('PENDING', 'PROCESSING')`);
  }

  async down(q: QueryRunner): Promise<void> {
    for (const table of ['deliveries', 'events', 'endpoints']) {
      await q.query(`DROP TABLE IF EXISTS ${table}`);
    }
  }
}
