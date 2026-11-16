import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

export const RUN_MIGRATIONS = Symbol('RUN_MIGRATIONS');

/** Arbitrary constant identifying Hook Pilot's migration lock. */
const MIGRATION_LOCK_ID = 7_263_001;

/**
 * Runs pending migrations at boot. A Postgres advisory lock serialises this
 * across replicas so concurrent API instances don't race on DDL.
 */
@Injectable()
export class MigrationRunner implements OnModuleInit {
  private readonly logger = new Logger(MigrationRunner.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(RUN_MIGRATIONS) private readonly enabled: boolean,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.enabled) return;
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    try {
      await runner.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
      const applied = await this.dataSource.runMigrations({ transaction: 'each' });
      for (const migration of applied) this.logger.log(`Applied migration ${migration.name}`);
    } finally {
      await runner.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => undefined);
      await runner.release();
    }
  }
}
