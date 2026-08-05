import { Module } from '@nestjs/common';
import { IdempotencyExecutor } from '../../common/idempotency/idempotency-executor.js';
import { DatabaseModule } from '../database/database.module.js';
import { MysqlIdempotencyExecutor } from './mysql-idempotency.executor.js';

/**
 * 项目级平台幂等基础设施装配：业务模块只依赖 `IdempotencyExecutor` 抽象端口，
 * 唯一表写入入口是 `MysqlIdempotencyExecutor`（docs/architecture.md §7）。
 */
@Module({
  imports: [DatabaseModule],
  providers: [{ provide: IdempotencyExecutor, useClass: MysqlIdempotencyExecutor }],
  exports: [IdempotencyExecutor],
})
export class IdempotencyModule {}
