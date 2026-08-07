import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { DATABASE_POOL } from '../database/database.module.js';
import { IdempotencyMetrics } from './idempotency.metrics.js';
import { maskedKeyDigest } from './idempotency-key-digest.js';

/** 小批次删除上限：避免单条 DELETE 长时间锁表（docs/http-idempotency-implementation-plan.md §5）。 */
const SWEEP_BATCH_SIZE = 500;
/** 默认清理周期 1 小时；可用 IDEMPOTENCY_SWEEP_INTERVAL_MS 覆盖。 */
const DEFAULT_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
/**
 * 单事务方案下 `processing` 记录不应对外可见；超过该宽限仍存在的即为异常信号。
 * 宽限用于容忍时区/时钟抖动，不改变「processing 本不该持久化」的语义。
 */
const PROCESSING_STUCK_GRACE_MINUTES = 5;

interface StuckProcessingRow extends RowDataPacket {
  scope: string;
  idempotency_key: string;
  created_at: Date;
}

/** 将未知异常统一格式化为可日志文本；不包含原始幂等键等敏感数据（脱敏口径见 idempotency-key-digest.ts）。 */
const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export interface IdempotencySweepResult {
  deletedExpired: number;
  stuckProcessing: number;
}

/**
 * 幂等平台到期清理与运行观测（docs/http-idempotency-implementation-plan.md §10 阶段 A）：
 *  - 按小批次删除已到期 `completed` 记录（到达 expires_at 不会自动失效，只有物理删除后同 scope/key
 *    才可能作为新请求再次执行）；
 *  - 发现持久化 `processing` 记录时告警并停止自动处置（单事务设计下它本不应对其他事务可见）；
 *  - 周期性输出重放率、冲突率、失败率指标摘要，并重置观测窗口。
 *
 * 本服务是 `http_idempotency_records` 唯一允许的到期清理写入口（docs/architecture.md §7），
 * 由全局架构门禁 `check-api-architecture.mjs` 校验。
 */
@Injectable()
export class IdempotencyHousekeepingService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(IdempotencyHousekeepingService.name);
  private timer: NodeJS.Timeout | null = null;
  private sweeping = false;

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly metrics: IdempotencyMetrics,
  ) {}

  onApplicationBootstrap(): void {
    const intervalMs = Number(
      process.env.IDEMPOTENCY_SWEEP_INTERVAL_MS ?? DEFAULT_SWEEP_INTERVAL_MS,
    );
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      this.logger.warn('IDEMPOTENCY_SWEEP_INTERVAL_MS 非法，跳过自动到期清理');
      return;
    }
    this.timer = setInterval(() => {
      // sweep 内部已捕获并记录异常（best-effort，下一轮继续）；此处的 catch 是防御性兜底，
      // 确保任何未来回归都不会产生未处理的 Promise rejection。
      void this.sweep().catch((error) => {
        this.logger.error(`幂等清理定时器执行失败：${describeError(error)}`);
      });
    }, intervalMs);
    // 不阻止进程退出：应用生命周期由 Nest 容器管理，定时器只是后台清理。
    this.timer.unref();
    this.logger.log(`幂等到期清理已启动，周期 ${intervalMs}ms`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * 执行一次到期清理 + processing 告警 + 指标摘要输出；并发调用时跳过重复执行。
   * 数据库故障等异常不向外抛出（housekeeping 为 best-effort）：记录错误日志后返回零计数，
   * 由定时器在下一轮继续重试，不打断清理节奏。
   */
  async sweep(): Promise<IdempotencySweepResult> {
    if (this.sweeping) return { deletedExpired: 0, stuckProcessing: 0 };
    this.sweeping = true;
    try {
      const deletedExpired = await this.deleteExpiredCompleted();
      const stuckProcessing = await this.alertStuckProcessing();
      this.logMetricsSummary();
      return { deletedExpired, stuckProcessing };
    } catch (error) {
      this.logger.error(`幂等清理异常：${describeError(error)}`);
      return { deletedExpired: 0, stuckProcessing: 0 };
    } finally {
      this.sweeping = false;
    }
  }

  private async deleteExpiredCompleted(): Promise<number> {
    let deleted = 0;
    for (;;) {
      const [result] = await this.pool.execute<ResultSetHeader>(
        `DELETE FROM http_idempotency_records
         WHERE status='completed' AND expires_at IS NOT NULL AND expires_at < NOW()
         LIMIT ${SWEEP_BATCH_SIZE}`,
      );
      deleted += result.affectedRows;
      if (result.affectedRows < SWEEP_BATCH_SIZE) break;
    }
    if (deleted > 0) this.logger.log(`幂等清理：删除 ${deleted} 条已到期 completed 记录`);
    return deleted;
  }

  /** 告警但不自动处置：异常 processing 记录按单事务设计本不应提交可见，需人工调查。 */
  private async alertStuckProcessing(): Promise<number> {
    const [rows] = await this.pool.query<StuckProcessingRow[]>(
      `SELECT scope, idempotency_key, created_at
       FROM http_idempotency_records
       WHERE status='processing'
         AND created_at < NOW() - INTERVAL ${PROCESSING_STUCK_GRACE_MINUTES} MINUTE`,
    );
    if (rows.length > 0) {
      const sample = rows
        .slice(0, 5)
        .map((row) => `${row.scope}:${maskedKeyDigest(row.idempotency_key)}`)
        .join(', ');
      this.logger.error(
        `幂等观测：发现 ${rows.length} 条持久化 processing 记录（单事务设计下本不应存在），` +
          `已停止自动处置待人工调查，样例：${sample}`,
      );
    }
    return rows.length;
  }

  private logMetricsSummary(): void {
    const snapshot = this.metrics.snapshot();
    this.metrics.reset();
    // 各「率」以全部记录事件数为分母，语义为「占全部执行事件的占比」，单个率恒 ≤ 100%。
    // 各计数器并非互斥（一次重试后成功的请求先后计入 firstRun 与 storageRetryable），
    // 故各率之和可能超过 100%；绝对观测以括号内的原始计数为准。分母为 0 时输出 0.0% 避免除零。
    const total =
      snapshot.firstRun +
      snapshot.replay +
      snapshot.conflict +
      snapshot.storageRetryable +
      snapshot.corrupt;
    const rate = (count: number) =>
      total === 0 ? '0.0%' : `${((count / total) * 100).toFixed(1)}%`;
    this.logger.log(
      `幂等指标：firstRun=${snapshot.firstRun} replay=${snapshot.replay} ` +
        `重放率=${rate(snapshot.replay)} 冲突率=${rate(snapshot.conflict)} ` +
        `失败率=${rate(snapshot.storageRetryable + snapshot.corrupt)} ` +
        `(conflict=${snapshot.conflict} retryable=${snapshot.storageRetryable} corrupt=${snapshot.corrupt})`,
    );
  }
}
