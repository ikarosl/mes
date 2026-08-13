import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { IdempotencyHousekeepingService } from '../idempotency-housekeeping.service.js';
import { IdempotencyMetrics } from '../idempotency.metrics.js';

interface Row {
  scope: string;
  idempotency_key: string;
  status: string;
  expires_at: Date | null;
  created_at: Date;
}

/** 内存假 pool：只模拟 housekeeping 用到的 DELETE（到期 completed）与 SELECT（processing）。 */
const makeFakePool = () => {
  const table = new Map<string, Row>();
  const pool = {
    async execute(sql: string, _params: unknown[]): Promise<[ResultSetHeader, unknown[]]> {
      if (sql.startsWith('DELETE FROM http_idempotency_records')) {
        let deleted = 0;
        for (const [k, row] of table) {
          if (
            row.status === 'completed' &&
            row.expires_at &&
            row.expires_at.getTime() < Date.now()
          ) {
            table.delete(k);
            deleted += 1;
            if (deleted >= 500) break;
          }
        }
        return [{ affectedRows: deleted } as ResultSetHeader, []];
      }
      throw new Error(`Unhandled SQL in fake: ${sql}`);
    },
    async query(sql: string, _params: unknown[]): Promise<[RowDataPacket[], unknown[]]> {
      if (sql.includes('FROM http_idempotency_records')) {
        const rows = [...table.values()]
          .filter((row) => row.status === 'processing' && row.created_at.getTime() < Date.now())
          .map((row) => ({
            scope: row.scope,
            idempotency_key: row.idempotency_key,
            created_at: row.created_at,
          }));
        return [rows as RowDataPacket[], []];
      }
      throw new Error(`Unhandled SQL in fake: ${sql}`);
    },
  };
  return { pool, table };
};

const now = Date.now();
const HOUR = 60 * 60 * 1000;

describe('IdempotencyHousekeepingService', () => {
  it('删除已到期 completed 记录，保留未到期记录', async () => {
    const { pool, table } = makeFakePool();
    table.set('c1', {
      scope: 's1',
      idempotency_key: 'k1',
      status: 'completed',
      expires_at: new Date(now - HOUR),
      created_at: new Date(now - 40 * 24 * HOUR),
    });
    table.set('c2', {
      scope: 's1',
      idempotency_key: 'k2',
      status: 'completed',
      expires_at: new Date(now + 30 * 24 * HOUR),
      created_at: new Date(now - HOUR),
    });
    const service = new IdempotencyHousekeepingService(pool as never, new IdempotencyMetrics());

    const result = await service.sweep();

    expect(result.deletedExpired).toBe(1);
    expect(table.has('c1')).toBe(false);
    expect(table.has('c2')).toBe(true);
  });

  it('发现持久化 processing 记录时返回计数但不删除', async () => {
    const { pool, table } = makeFakePool();
    table.set('p1', {
      scope: 's1',
      idempotency_key: 'stuck-key',
      status: 'processing',
      expires_at: null,
      created_at: new Date(now - 30 * 60 * 1000),
    });
    const service = new IdempotencyHousekeepingService(pool as never, new IdempotencyMetrics());

    const result = await service.sweep();

    expect(result.stuckProcessing).toBe(1);
    expect(table.has('p1')).toBe(true);
  });

  it('输出指标摘要并重置窗口，未发生任何事件时计数保持为零', async () => {
    const { pool } = makeFakePool();
    const metrics = new IdempotencyMetrics();
    metrics.recordReplay();
    metrics.recordConflict();
    const service = new IdempotencyHousekeepingService(pool as never, metrics);

    await service.sweep();

    expect(metrics.snapshot()).toEqual({
      firstRun: 0,
      replay: 0,
      conflict: 0,
      storageRetryable: 0,
      corrupt: 0,
    });
  });

  it('并发调用 sweep 时只执行一次，避免重复删除', async () => {
    const { pool, table } = makeFakePool();
    table.set('c1', {
      scope: 's1',
      idempotency_key: 'k1',
      status: 'completed',
      expires_at: new Date(now - HOUR),
      created_at: new Date(now - 40 * 24 * HOUR),
    });
    const service = new IdempotencyHousekeepingService(pool as never, new IdempotencyMetrics());
    const spy = vi.spyOn(service, 'sweep');

    const [a, b] = await Promise.all([service.sweep(), service.sweep()]);

    expect(spy).toHaveBeenCalledTimes(2);
    expect(a.deletedExpired + b.deletedExpired).toBe(1);
    expect(table.size).toBe(0);
  });

  it('大量冲突时冲突率不超过 100%（1 firstRun + 5 conflict 的窗口）', async () => {
    const { pool } = makeFakePool();
    const metrics = new IdempotencyMetrics();
    metrics.recordFirstRun();
    for (let i = 0; i < 5; i += 1) metrics.recordConflict();
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    try {
      const service = new IdempotencyHousekeepingService(pool as never, metrics);
      await service.sweep();
      const message = log.mock.calls.map((args) => String(args[0])).join('\n');
      expect(message).toContain('冲突率=83.3%');
      expect(message).toContain('重放率=0.0%');
      expect(message).toContain('失败率=0.0%');
    } finally {
      log.mockRestore();
    }
  });

  it('大量 storageRetryable 与 corrupt 时失败率不超过 100%', async () => {
    const { pool } = makeFakePool();
    const metrics = new IdempotencyMetrics();
    metrics.recordFirstRun();
    metrics.recordStorageRetryable();
    metrics.recordStorageRetryable();
    metrics.recordStorageRetryable();
    metrics.recordCorrupt();
    metrics.recordCorrupt();
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    try {
      const service = new IdempotencyHousekeepingService(pool as never, metrics);
      await service.sweep();
      const message = log.mock.calls.map((args) => String(args[0])).join('\n');
      expect(message).toContain('失败率=83.3%');
      expect(message).toContain('冲突率=0.0%');
    } finally {
      log.mockRestore();
    }
  });

  it('无任何事件时指标摘要输出 0.0% 而非 NaN', async () => {
    const { pool } = makeFakePool();
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    try {
      const service = new IdempotencyHousekeepingService(pool as never, new IdempotencyMetrics());
      await service.sweep();
      const message = log.mock.calls.map((args) => String(args[0])).join('\n');
      expect(message).toContain('重放率=0.0%');
      expect(message).toContain('冲突率=0.0%');
      expect(message).toContain('失败率=0.0%');
      expect(message).not.toContain('NaN');
    } finally {
      log.mockRestore();
    }
  });

  it('清理依赖抛错时 sweep 记录错误并返回零计数，不向外抛异常', async () => {
    const failingPool = {
      execute: vi.fn().mockRejectedValue(new Error('数据库连接中断')),
      query: vi.fn(),
    };
    const errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      const service = new IdempotencyHousekeepingService(
        failingPool as never,
        new IdempotencyMetrics(),
      );
      const result = await service.sweep();
      expect(result).toEqual({ deletedExpired: 0, stuckProcessing: 0 });
      expect(errorLog).toHaveBeenCalledWith('幂等清理异常：数据库连接中断');
      // 异常后 sweeping 保护已复位，后续调用仍可正常执行（best-effort 语义）
      await expect(service.sweep()).resolves.toEqual({ deletedExpired: 0, stuckProcessing: 0 });
    } finally {
      errorLog.mockRestore();
    }
  });

  it('sweep 抛错时定时器回调记录错误且不产生未处理 rejection，下一轮继续执行', async () => {
    vi.useFakeTimers();
    try {
      const failingPool = {
        execute: vi.fn().mockRejectedValue(new Error('数据库连接中断')),
        query: vi.fn().mockResolvedValue([[], []]),
      };
      const errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown): void => {
        unhandled.push(reason);
      };
      process.on('unhandledRejection', onUnhandled);
      try {
        process.env.IDEMPOTENCY_SWEEP_INTERVAL_MS = '1000';
        const service = new IdempotencyHousekeepingService(
          failingPool as never,
          new IdempotencyMetrics(),
        );
        service.onApplicationBootstrap();
        // 连续触发两轮：断言异常未产生未处理 rejection，且定时器未被异常打断（best-effort）
        await vi.advanceTimersByTimeAsync(1000);
        await vi.advanceTimersByTimeAsync(1000);
        expect(unhandled).toHaveLength(0);
        expect(errorLog).toHaveBeenCalledTimes(2);
        expect(errorLog).toHaveBeenCalledWith('幂等清理异常：数据库连接中断');
      } finally {
        delete process.env.IDEMPOTENCY_SWEEP_INTERVAL_MS;
        process.off('unhandledRejection', onUnhandled);
        errorLog.mockRestore();
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
