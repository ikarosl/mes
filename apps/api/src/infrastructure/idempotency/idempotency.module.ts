import { Module } from '@nestjs/common';
import { IdempotencyExecutor } from '../../common/idempotency/idempotency-executor.js';
import { DatabaseModule } from '../database/database.module.js';
import { IdempotencyMetrics } from './idempotency.metrics.js';
import { IdempotencyHousekeepingService } from './idempotency-housekeeping.service.js';
import { MysqlIdempotencyExecutor } from './mysql-idempotency.executor.js';

/**
 * 项目级平台幂等基础设施装配：业务模块只依赖 `IdempotencyExecutor` 抽象端口，
 * 唯一表写入入口是 `MysqlIdempotencyExecutor`（docs/architecture.md §7），到期物理清理由
 * `IdempotencyHousekeepingService` 承担。全局 `IdempotencyKeyGuard` 属平台 HTTP 基础设施，
 * 也由本模块公开装配，组合根经此引用而不深入任何业务模块内部层。
 *
 * `IdempotencyMetrics` 以单例提供：executor 记录重放/冲突/失败观测，housekeeping 周期性读取摘要，
 * 二者共享同一计数实例。
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    IdempotencyMetrics,
    { provide: IdempotencyExecutor, useClass: MysqlIdempotencyExecutor },
    IdempotencyHousekeepingService,
  ],
  exports: [IdempotencyExecutor],
})
export class IdempotencyModule {}

export { IdempotencyKeyGuard } from './idempotency-key.guard.js';
