import { Module } from '@nestjs/common';
import { createDatabasePool } from '@company/database';

export const DATABASE_POOL = Symbol('DATABASE_POOL');

@Module({
  providers: [{ provide: DATABASE_POOL, useFactory: () => createDatabasePool() }],
  exports: [DATABASE_POOL],
})
export class DatabaseModule {}
