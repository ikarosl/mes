import { Injectable } from '@nestjs/common';

/**
 * 幂等平台 in-memory 运行指标（docs/http-idempotency-implementation-plan.md §8、§12）。
 *
 * 由 `MysqlIdempotencyExecutor` 在关键路径记录，`IdempotencyHousekeepingService` 周期性读取摘要并
 * 重置窗口。摘要中各「率」以全部记录事件数（firstRun + replay + conflict + storageRetryable +
 * corrupt）为分母，语义为「占全部执行事件的占比」，单个率恒 ≤ 100%。各计数器并非互斥：一次重试
 * 后成功的请求会先后计入 firstRun 与 storageRetryable，故各率之和可能超过 100%；原始计数保留用于
 * 绝对观测。指标只用于运行观测，不影响任何业务结果；进程重启即清零，不作为持久化事实来源。
 */
export interface IdempotencyMetricsSnapshot {
  firstRun: number;
  replay: number;
  conflict: number;
  storageRetryable: number;
  corrupt: number;
}

@Injectable()
export class IdempotencyMetrics {
  private counters: IdempotencyMetricsSnapshot = {
    firstRun: 0,
    replay: 0,
    conflict: 0,
    storageRetryable: 0,
    corrupt: 0,
  };

  recordFirstRun(): void {
    this.counters.firstRun += 1;
  }

  recordReplay(): void {
    this.counters.replay += 1;
  }

  recordConflict(): void {
    this.counters.conflict += 1;
  }

  recordStorageRetryable(): void {
    this.counters.storageRetryable += 1;
  }

  recordCorrupt(): void {
    this.counters.corrupt += 1;
  }

  snapshot(): IdempotencyMetricsSnapshot {
    return { ...this.counters };
  }

  reset(): void {
    this.counters = { firstRun: 0, replay: 0, conflict: 0, storageRetryable: 0, corrupt: 0 };
  }
}
