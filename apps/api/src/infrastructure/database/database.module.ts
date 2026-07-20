import { Global, Module } from '@nestjs/common';
import { createDatabasePool } from '@company/database';

export const DATABASE_POOL = Symbol('DATABASE_POOL');

@Global()
@Module({
  providers: [{ provide: DATABASE_POOL, useFactory: () => createDatabasePool() }],
  exports: [DATABASE_POOL],
})
export class DatabaseModule {}
