import { describe, expect, it, vi } from 'vitest';
import type { ResultSetHeader } from 'mysql2/promise';
import { DatabaseError } from '@company/database';
import type {
  IdempotencyResultCodec,
  IdempotentCommand,
} from '../../../common/idempotency/idempotency-executor.js';
import { IdempotencyStorageError } from '../../../common/idempotency/idempotency.errors.js';
import { ConcurrencyError } from '../../../common/persistence/optimistic-lock.js';
import { requestFingerprint } from '../canonical-request-fingerprint.js';
import { IdempotencyMetrics } from '../idempotency.metrics.js';
import { MysqlIdempotencyExecutor } from '../mysql-idempotency.executor.js';

interface FakeRow {
  scope: string;
  idempotency_key: string;
  request_fingerprint: string;
  actor_id: number;
  initial_request_id: string;
  status: 'processing' | 'completed';
  result_json: unknown;
  created_at: Date;
  completed_at: Date | null;
  expires_at: Date | null;
}

/**
 * 内存假 pool：驱动真实的 `withTransaction`（@company/database 的 ALS 复用逻辑），
 * 只模拟 `http_idempotency_records` 的 INSERT/UPDATE/SELECT 与唯一键语义。
 * 可按操作注入驱动错误（瞬态分类测试用）：getConnectionError/beginTransactionError/commitError/
 * rollbackError 注入事务边界操作，insertError/updateError/selectError 注入事务内语句；
 * `queryCalls` 统计 SELECT 调用次数，用于断言瞬态路径不会误入 replayOrConflict 仲裁。
 */
interface FakePoolOptions {
  getConnectionError?: Error;
  beginTransactionError?: Error;
  commitError?: Error;
  rollbackError?: Error;
  insertError?: Error;
  updateError?: Error;
  selectError?: Error;
}

const makeFakePool = (options: FakePoolOptions = {}) => {
  const table = new Map<string, FakeRow>();
  let queryCalls = 0;
  const makeConnection = () => {
    const inserted: string[] = [];
    const keyOf = (scope: string, key: string) => `${scope}${key}`;
    return {
      async beginTransaction() {
        if (options.beginTransactionError) throw options.beginTransactionError;
      },
      async commit() {
        if (options.commitError) throw options.commitError;
      },
      async rollback() {
        if (options.rollbackError) throw options.rollbackError;
        for (const k of inserted) table.delete(k);
        inserted.length = 0;
      },
      async release() {},
      async execute(sql: string, params: unknown[]): Promise<[ResultSetHeader, unknown[]]> {
        if (sql.startsWith('INSERT INTO http_idempotency_records')) {
          if (options.insertError) throw options.insertError;
          const [scope, idemKey, fingerprint, actorId, requestId] = params as string[];
          const k = keyOf(scope, idemKey);
          if (table.has(k)) {
            const error = new Error('Duplicate entry') as Error & { code: string };
            error.code = 'ER_DUP_ENTRY';
            throw error;
          }
          table.set(k, {
            scope,
            idempotency_key: idemKey,
            request_fingerprint: fingerprint,
            actor_id: Number(actorId),
            initial_request_id: requestId,
            status: 'processing',
            result_json: null,
            created_at: new Date(),
            completed_at: null,
            expires_at: null,
          });
          inserted.push(k);
          return [{ affectedRows: 1, insertId: 1 } as ResultSetHeader, []];
        }
        if (sql.startsWith('UPDATE http_idempotency_records')) {
          if (options.updateError) throw options.updateError;
          const [resultJson, , scope, idemKey] = params as [string, number, string, string];
          const row = table.get(keyOf(scope, idemKey));
          if (!row || row.status !== 'processing')
            return [{ affectedRows: 0 } as ResultSetHeader, []];
          row.status = 'completed';
          row.result_json = JSON.parse(resultJson) as unknown;
          row.completed_at = new Date();
          row.expires_at = new Date();
          return [{ affectedRows: 1 } as ResultSetHeader, []];
        }
        throw new Error(`Unhandled SQL in fake: ${sql}`);
      },
      async query(sql: string, params: unknown[]): Promise<[FakeRow[], unknown[]]> {
        queryCalls += 1;
        if (sql.includes('FROM http_idempotency_records')) {
          if (options.selectError) throw options.selectError;
          const [scope, idemKey] = params as string[];
          const row = table.get(keyOf(scope, idemKey));
          return [row ? [row] : [], []];
        }
        throw new Error(`Unhandled SQL in fake: ${sql}`);
      },
    };
  };
  return {
    pool: {
      getConnection: async () => {
        if (options.getConnectionError) throw options.getConnectionError;
        return makeConnection();
      },
    },
    table,
    queryCalls: () => queryCalls,
  };
};

const resultCodec = {
  encode: (result: { id: string }) => result,
  decode: (stored: unknown) => {
    if (
      typeof stored !== 'object' ||
      stored === null ||
      !('id' in stored) ||
      typeof stored.id !== 'string'
    ) {
      throw new Error('invalid stored result');
    }
    return { id: stored.id };
  },
};

const makeCommand = (
  handler: IdempotentCommand<{ id: string }>['handler'],
  overrides: Partial<IdempotentCommand<{ id: string }>> = {},
): IdempotentCommand<{ id: string }> => ({
  scope: 'production.batch.create.v1',
  key: '018f14a8-8f10-7d3a-a825-3d7ce6c9bc41',
  actorId: '9',
  requestId: 'req-9-batch-create-1',
  request: { params: { workOrderId: '10' }, body: { plannedQuantity: '2.0000' } },
  resultCodec,
  handler,
  ...overrides,
});

describe('MysqlIdempotencyExecutor', () => {
  it('首次执行：运行 handler、保存结果、返回 isReplay=false', async () => {
    const { pool } = makeFakePool();
    const executor = new MysqlIdempotencyExecutor(pool as never);
    const handler = vi.fn().mockResolvedValue({ id: '20' });

    const execution = await executor.execute(makeCommand(handler));

    expect(handler).toHaveBeenCalledOnce();
    expect(execution).toEqual({ result: { id: '20' }, isReplay: false });
  });

  it('首次执行返回 canonical 化结果（decode(encoded)），与重放返回完全一致（codec encode 改写数据时生效）', async () => {
    const { pool } = makeFakePool();
    const executor = new MysqlIdempotencyExecutor(pool as never);
    // encode 会改写数据的假 codec：trim 字段值并丢弃冗余字段，decode 后形状与 handler 原始
    // 结果不同——框架保证首次与重放都返回 canonical 值，不依赖 codec 自觉。
    const rewritingCodec: IdempotencyResultCodec<{
      id: string;
      name: string;
      extra?: string;
    }> = {
      encode: (result) => ({ id: result.id.trim(), name: result.name.trim() }),
      decode: (stored) => {
        if (typeof stored !== 'object' || stored === null) throw new Error('invalid stored result');
        const value = stored as { id?: unknown; name?: unknown };
        if (typeof value.id !== 'string' || typeof value.name !== 'string')
          throw new Error('invalid stored result');
        return { id: value.id, name: value.name };
      },
    };
    const makeRewritingCommand = (
      handler: IdempotentCommand<{ id: string; name: string; extra?: string }>['handler'],
    ): IdempotentCommand<{ id: string; name: string; extra?: string }> => ({
      scope: 'production.batch.create.v1',
      key: '018f14a8-8f10-7d3a-a825-3d7ce6c9bc41',
      actorId: '9',
      requestId: 'req-9-batch-create-1',
      request: { params: { workOrderId: '10' }, body: { plannedQuantity: '2.0000' } },
      resultCodec: rewritingCodec,
      handler,
    });

    const first = await executor.execute(
      makeRewritingCommand(
        vi.fn().mockResolvedValue({ id: ' 20 ', name: ' 张三 ', extra: 'ignored' }),
      ),
    );
    const replay = await executor.execute(
      makeRewritingCommand(vi.fn().mockRejectedValue(new Error('must not execute'))),
    );

    // 首次返回 canonical 值而非 handler 原始结果；重放返回与首次完全相同的 canonical 值
    expect(first).toEqual({ result: { id: '20', name: '张三' }, isReplay: false });
    expect(replay).toEqual({ result: { id: '20', name: '张三' }, isReplay: true });
    expect(first.result).toEqual(replay.result);
  });

  it('同键同指纹：重放已保存结果，不执行 handler', async () => {
    const { pool } = makeFakePool();
    const executor = new MysqlIdempotencyExecutor(pool as never);
    const handler = vi.fn().mockResolvedValue({ id: '20' });
    await executor.execute(makeCommand(handler));

    const replayHandler = vi.fn().mockRejectedValue(new Error('must not execute'));
    const execution = await executor.execute(makeCommand(replayHandler));

    expect(replayHandler).not.toHaveBeenCalled();
    expect(execution).toEqual({ result: { id: '20' }, isReplay: true });
  });

  it('同键不同指纹：抛出 IDEMPOTENCY_CONFLICT，不执行 handler', async () => {
    const { pool } = makeFakePool();
    const executor = new MysqlIdempotencyExecutor(pool as never);
    const handler = vi.fn().mockResolvedValue({ id: '20' });
    await executor.execute(makeCommand(handler));

    const conflictHandler = vi.fn().mockRejectedValue(new Error('must not execute'));
    const conflictCommand = makeCommand(conflictHandler, {
      request: { params: { workOrderId: '10' }, body: { plannedQuantity: '5.0000' } },
    });

    await expect(executor.execute(conflictCommand)).rejects.toBeInstanceOf(ConcurrencyError);
    await expect(executor.execute(conflictCommand)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    expect(conflictHandler).not.toHaveBeenCalled();
  });

  it('已保存结果无法反序列化：抛 corrupt 错误，不执行 handler 自愈', async () => {
    const { pool, table } = makeFakePool();
    const executor = new MysqlIdempotencyExecutor(pool as never);
    // 预置一条 completed 记录，result_json 结构非法；指纹必须与命令输入一致才能命中重放路径
    const fingerprint = requestFingerprint({
      scope: 'production.batch.create.v1',
      actorId: '9',
      params: { workOrderId: '10' },
      body: { plannedQuantity: '2.0000' },
    });
    table.set('production.batch.create.v1018f14a8-8f10-7d3a-a825-3d7ce6c9bc41', {
      scope: 'production.batch.create.v1',
      idempotency_key: '018f14a8-8f10-7d3a-a825-3d7ce6c9bc41',
      request_fingerprint: fingerprint,
      actor_id: 9,
      initial_request_id: 'req-9-batch-create-1',
      status: 'completed',
      result_json: { unknown: true },
      created_at: new Date(),
      completed_at: new Date(),
      expires_at: new Date(),
    });

    const handler = vi.fn().mockRejectedValue(new Error('must not execute'));
    await expect(executor.execute(makeCommand(handler))).rejects.toBeInstanceOf(
      IdempotencyStorageError,
    );
    await expect(executor.execute(makeCommand(handler))).rejects.toMatchObject({ kind: 'corrupt' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('handler 业务失败：错误向外传播且幂等记录回滚，不留下中毒键', async () => {
    const { pool, table } = makeFakePool();
    const executor = new MysqlIdempotencyExecutor(pool as never);
    const businessError = new Error('业务冲突');
    const handler = vi.fn().mockRejectedValue(businessError);

    await expect(executor.execute(makeCommand(handler))).rejects.toBe(businessError);
    expect(table.size).toBe(0);
  });

  it('首次事务回滚后，下一次同键可正常执行', async () => {
    const { pool, table } = makeFakePool();
    const executor = new MysqlIdempotencyExecutor(pool as never);
    const failing = vi
      .fn()
      .mockRejectedValueOnce(new Error('暂时失败'))
      .mockResolvedValueOnce({ id: '20' });

    await expect(executor.execute(makeCommand(failing))).rejects.toThrow('暂时失败');
    expect(table.size).toBe(0);

    const execution = await executor.execute(makeCommand(failing));
    expect(execution).toEqual({ result: { id: '20' }, isReplay: false });
    expect(table.size).toBe(1);
  });

  it('运行观测：首次执行累加 firstRun，重放累加 replay，冲突累加 conflict', async () => {
    const { pool } = makeFakePool();
    const metrics = new IdempotencyMetrics();
    const executor = new MysqlIdempotencyExecutor(pool as never, metrics);
    const handler = vi.fn().mockResolvedValue({ id: '20' });

    await executor.execute(makeCommand(handler));
    expect(metrics.snapshot()).toMatchObject({ firstRun: 1, replay: 0, conflict: 0 });

    await executor.execute(makeCommand(vi.fn().mockResolvedValue({ id: '20' })));
    expect(metrics.snapshot()).toMatchObject({ firstRun: 1, replay: 1, conflict: 0 });

    const conflictCommand = makeCommand(vi.fn().mockResolvedValue({ id: '20' }), {
      request: { params: { workOrderId: '10' }, body: { plannedQuantity: '9.0000' } },
    });
    await expect(executor.execute(conflictCommand)).rejects.toBeInstanceOf(ConcurrencyError);
    expect(metrics.snapshot()).toMatchObject({ firstRun: 1, replay: 1, conflict: 1 });
  });

  it('运行观测：结果损坏累加 corrupt，防御性竞态累加 storageRetryable', async () => {
    const { pool, table } = makeFakePool();
    const metrics = new IdempotencyMetrics();
    const executor = new MysqlIdempotencyExecutor(pool as never, metrics);
    const fingerprint = requestFingerprint({
      scope: 'production.batch.create.v1',
      actorId: '9',
      params: { workOrderId: '10' },
      body: { plannedQuantity: '2.0000' },
    });
    table.set('production.batch.create.v1018f14a8-8f10-7d3a-a825-3d7ce6c9bc41', {
      scope: 'production.batch.create.v1',
      idempotency_key: '018f14a8-8f10-7d3a-a825-3d7ce6c9bc41',
      request_fingerprint: fingerprint,
      actor_id: 9,
      initial_request_id: 'req-9-batch-create-1',
      status: 'completed',
      result_json: { unknown: true },
      created_at: new Date(),
      completed_at: new Date(),
      expires_at: new Date(),
    });

    await expect(executor.execute(makeCommand(vi.fn()))).rejects.toMatchObject({ kind: 'corrupt' });
    expect(metrics.snapshot()).toMatchObject({ corrupt: 1 });

    // 防御性竞态：幂等登记被并发修改时 UPDATE 不命中 processing -> storageRetryable，整体回滚。
    const { pool: poolRetry, table: tableRetry } = makeFakePool();
    const retryMetrics = new IdempotencyMetrics();
    const retryExecutor = new MysqlIdempotencyExecutor(poolRetry as never, retryMetrics);
    // 预置一条 processing 记录，但 UPDATE 阶段改成与 INSERT 不同的键，使更新不命中。
    const row = {
      scope: 'production.batch.create.v1',
      idempotency_key: '018f14a8-8f10-7d3a-a825-3d7ce6c9bc41',
      request_fingerprint: fingerprint,
      actor_id: 9,
      initial_request_id: 'req-9-batch-create-1',
      status: 'processing',
      result_json: null,
      created_at: new Date(),
      completed_at: null,
      expires_at: null,
    } as const;
    tableRetry.set('production.batch.create.v1018f14a8-8f10-7d3a-a825-3d7ce6c9bc41', row);
    // 命令 key 与预置记录一致会触发 INSERT 重复键 -> replayOrConflict 读 processing -> storageRetryable
    await expect(
      retryExecutor.execute(makeCommand(vi.fn().mockResolvedValue({ id: '20' }))),
    ).rejects.toMatchObject({ kind: 'retryable' });
    expect(retryMetrics.snapshot()).toMatchObject({ storageRetryable: 1 });
    // 预置的异常 processing 记录不属于本事务的 inserted 集合，回滚不影响它
    expect(tableRetry.size).toBe(1);
  });
});

describe('MysqlIdempotencyExecutor - MySQL 瞬态错误分类', () => {
  // 覆盖清单与判定依据见 mysql-transient-errors.ts 顶部注释：锁等待/死锁/连接中断/池关闭。
  const transientCases: ReadonlyArray<{ code: string; errno?: number }> = [
    { code: 'ER_LOCK_DEADLOCK', errno: 1213 },
    { code: 'ER_LOCK_WAIT_TIMEOUT', errno: 1205 },
    { code: 'PROTOCOL_CONNECTION_LOST', errno: 2013 },
    { code: 'ECONNRESET' },
    { code: 'EPIPE' },
    { code: 'ETIMEDOUT' },
    { code: 'POOL_CLOSED' },
  ];

  it.each(transientCases)(
    '登记 INSERT 抛 $code：转为 retryable IdempotencyStorageError，记录 storageRetryable，不误走 replayOrConflict',
    async ({ code, errno }) => {
      const insertError = Object.assign(new Error(`driver error ${code}`), {
        code,
        ...(errno === undefined ? {} : { errno }),
      });
      const { pool, table, queryCalls } = makeFakePool({ insertError });
      const metrics = new IdempotencyMetrics();
      const executor = new MysqlIdempotencyExecutor(pool as never, metrics);
      const handler = vi.fn().mockResolvedValue({ id: '20' });

      await expect(executor.execute(makeCommand(handler))).rejects.toMatchObject({
        name: 'IdempotencyStorageError',
        kind: 'retryable',
      });
      expect(metrics.snapshot()).toEqual({
        firstRun: 0,
        replay: 0,
        conflict: 0,
        storageRetryable: 1,
        corrupt: 0,
      });
      expect(queryCalls()).toBe(0); // 未进入 replayOrConflict 的重放/冲突仲裁
      expect(handler).not.toHaveBeenCalled();
      expect(table.size).toBe(0); // 事务随 withTransaction 回滚，不残留登记记录
    },
  );

  it('池关闭错误（mysql2 3.23.1 形态：无 code 仅消息 "Pool is closed."）同样转为 retryable', async () => {
    const { pool, queryCalls } = makeFakePool({ insertError: new Error('Pool is closed.') });
    const metrics = new IdempotencyMetrics();
    const executor = new MysqlIdempotencyExecutor(pool as never, metrics);

    await expect(
      executor.execute(makeCommand(vi.fn().mockResolvedValue({ id: '20' }))),
    ).rejects.toMatchObject({ name: 'IdempotencyStorageError', kind: 'retryable' });
    expect(metrics.snapshot()).toMatchObject({ storageRetryable: 1 });
    expect(queryCalls()).toBe(0);
  });

  it('非瞬态驱动错误（ER_PARSE_ERROR）原样冒泡：不包装、不计数', async () => {
    const driverError = Object.assign(new Error('you have an error in your SQL syntax'), {
      code: 'ER_PARSE_ERROR',
      errno: 1064,
    });
    const { pool } = makeFakePool({ insertError: driverError });
    const metrics = new IdempotencyMetrics();
    const executor = new MysqlIdempotencyExecutor(pool as never, metrics);

    await expect(executor.execute(makeCommand(vi.fn()))).rejects.toBe(driverError);
    expect(metrics.snapshot()).toEqual({
      firstRun: 0,
      replay: 0,
      conflict: 0,
      storageRetryable: 0,
      corrupt: 0,
    });
  });
});

describe('MysqlIdempotencyExecutor - 完整事务边界瞬态分类', () => {
  const nodeNetworkError = (message: string) =>
    Object.assign(new Error(message), { code: 'ECONNRESET' });

  // IdempotencyMetrics 含私有 counters 字段，结构不兼容普通对象，用断言收窄为公共方法替身。
  const makeMetricsMock = () =>
    ({
      recordFirstRun: vi.fn(),
      recordReplay: vi.fn(),
      recordConflict: vi.fn(),
      recordCorrupt: vi.fn(),
      recordStorageRetryable: vi.fn(),
      snapshot: vi.fn(),
      reset: vi.fn(),
    }) as unknown as IdempotencyMetrics;

  it('pool.getConnection() 抛 ECONNRESET（node 形态，无数字 errno）：DatabaseError 包装后按 cause 分类为 retryable', async () => {
    const { pool } = makeFakePool({ getConnectionError: nodeNetworkError('socket hang up') });
    const metrics = new IdempotencyMetrics();
    const executor = new MysqlIdempotencyExecutor(pool as never, metrics);

    await expect(executor.execute(makeCommand(vi.fn()))).rejects.toMatchObject({
      name: 'IdempotencyStorageError',
      kind: 'retryable',
    });
    expect(metrics.snapshot()).toMatchObject({ storageRetryable: 1, firstRun: 0 });
  });

  it('commit 抛 ECONNRESET：转为 retryable，且 firstRun 未被记录（提交成功后才计数）；成功路径 firstRun 计数为 1', async () => {
    const { pool } = makeFakePool({ commitError: nodeNetworkError('commit socket lost') });
    const metrics = makeMetricsMock();
    const executor = new MysqlIdempotencyExecutor(pool as never, metrics);
    const handler = vi.fn().mockResolvedValue({ id: '20' });

    await expect(executor.execute(makeCommand(handler))).rejects.toMatchObject({
      name: 'IdempotencyStorageError',
      kind: 'retryable',
    });
    expect(metrics.recordFirstRun).not.toHaveBeenCalled();
    expect(metrics.recordStorageRetryable).toHaveBeenCalledOnce();

    // 成功路径：提交成功后 firstRun 计数为 1
    const { pool: okPool } = makeFakePool();
    const okExecutor = new MysqlIdempotencyExecutor(okPool as never, metrics);
    await okExecutor.execute(makeCommand(vi.fn().mockResolvedValue({ id: '20' })));
    expect(metrics.recordFirstRun).toHaveBeenCalledOnce();
  });

  it('handler 内业务 SQL 抛 ER_LOCK_DEADLOCK（errno=1213/sqlState=40001）：转为 retryable，事务回滚无残留', async () => {
    const { pool, table } = makeFakePool();
    const metrics = new IdempotencyMetrics();
    const executor = new MysqlIdempotencyExecutor(pool as never, metrics);
    const deadlock = Object.assign(new Error('Deadlock found when trying to get lock'), {
      code: 'ER_LOCK_DEADLOCK',
      errno: 1213,
      sqlState: '40001',
    });

    await expect(
      executor.execute(makeCommand(vi.fn().mockRejectedValue(deadlock))),
    ).rejects.toMatchObject({ name: 'IdempotencyStorageError', kind: 'retryable' });
    expect(metrics.snapshot()).toMatchObject({ storageRetryable: 1, firstRun: 0 });
    expect(table.size).toBe(0); // 登记记录随事务回滚，不残留
  });

  it('handler 内其他 SDK 抛 ECONNRESET（只有 code，无 errno/sqlState/sqlMessage）：原样冒泡，绝不误判', async () => {
    const { pool } = makeFakePool();
    const metrics = new IdempotencyMetrics();
    const executor = new MysqlIdempotencyExecutor(pool as never, metrics);
    const sdkError = nodeNetworkError('redis connection reset');
    const handler = vi.fn().mockRejectedValue(sdkError);

    await expect(executor.execute(makeCommand(handler))).rejects.toBe(sdkError);
    expect(metrics.snapshot()).toMatchObject({ storageRetryable: 0, firstRun: 0 });
  });

  it('handler 内业务 SQL 抛 DatabaseError（cause=ECONNRESET，无 errno 形态）：按 cause 分类为 retryable', async () => {
    const { pool, table } = makeFakePool();
    const metrics = new IdempotencyMetrics();
    const executor = new MysqlIdempotencyExecutor(pool as never, metrics);
    const networkError = nodeNetworkError('socket hang up');
    const handler = vi.fn().mockRejectedValue(new DatabaseError(networkError, '数据库查询失败'));

    await expect(executor.execute(makeCommand(handler))).rejects.toMatchObject({
      name: 'IdempotencyStorageError',
      kind: 'retryable',
    });
    expect(metrics.snapshot()).toMatchObject({ storageRetryable: 1, firstRun: 0 });
    expect(table.size).toBe(0); // 事务随回滚，不残留登记记录
  });

  it('handler 抛 DatabaseError 但 cause 非瞬态（ER_PARSE_ERROR）：原样冒泡，rejects 的仍是 DatabaseError', async () => {
    const { pool } = makeFakePool();
    const metrics = new IdempotencyMetrics();
    const executor = new MysqlIdempotencyExecutor(pool as never, metrics);
    const parseError = Object.assign(new Error('you have an error in your SQL syntax'), {
      code: 'ER_PARSE_ERROR',
      errno: 1064,
    });
    const dbError = new DatabaseError(parseError, '数据库查询失败');
    const handler = vi.fn().mockRejectedValue(dbError);

    await expect(executor.execute(makeCommand(handler))).rejects.toBe(dbError);
    expect(metrics.snapshot()).toMatchObject({ storageRetryable: 0, firstRun: 0 });
  });

  it('completed UPDATE 抛 ECONNRESET（确定性 mysql2 语句上下文，含网络码）：转为 retryable', async () => {
    const { pool, table } = makeFakePool({ updateError: nodeNetworkError('update socket lost') });
    const metrics = new IdempotencyMetrics();
    const executor = new MysqlIdempotencyExecutor(pool as never, metrics);
    const handler = vi.fn().mockResolvedValue({ id: '20' });

    await expect(executor.execute(makeCommand(handler))).rejects.toMatchObject({
      name: 'IdempotencyStorageError',
      kind: 'retryable',
    });
    expect(metrics.snapshot()).toMatchObject({ storageRetryable: 1, firstRun: 0 });
    expect(table.size).toBe(0);
  });

  it('重放路径：INSERT 重复键后重放 SELECT 抛 ER_LOCK_WAIT_TIMEOUT：转为 retryable，不执行 handler', async () => {
    const { pool, queryCalls } = makeFakePool({
      insertError: Object.assign(new Error('Duplicate entry'), {
        code: 'ER_DUP_ENTRY',
        errno: 1062,
        sqlState: '23000',
      }),
      selectError: Object.assign(new Error('Lock wait timeout exceeded'), {
        code: 'ER_LOCK_WAIT_TIMEOUT',
        errno: 1205,
        sqlState: 'HY000',
      }),
    });
    const metrics = new IdempotencyMetrics();
    const executor = new MysqlIdempotencyExecutor(pool as never, metrics);
    const handler = vi.fn().mockResolvedValue({ id: '20' });

    await expect(executor.execute(makeCommand(handler))).rejects.toMatchObject({
      name: 'IdempotencyStorageError',
      kind: 'retryable',
    });
    expect(metrics.snapshot()).toMatchObject({ storageRetryable: 1, replay: 0 });
    expect(queryCalls()).toBe(1); // 确实进入了 replayOrConflict 的锁定读
    expect(handler).not.toHaveBeenCalled();
  });

  it('rollback 失败不覆盖原始异常：handler 业务错误 + rollback 抛错，rejects 的仍是原业务错误', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { pool } = makeFakePool({ rollbackError: new Error('rollback connection lost') });
      const metrics = new IdempotencyMetrics();
      const executor = new MysqlIdempotencyExecutor(pool as never, metrics);
      const businessError = new Error('业务冲突');
      const handler = vi.fn().mockRejectedValue(businessError);

      await expect(executor.execute(makeCommand(handler))).rejects.toBe(businessError);
      expect(metrics.snapshot()).toMatchObject({ storageRetryable: 0, firstRun: 0 });
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it('handler 抛普通业务错误：原样冒泡且不记录任何指标', async () => {
    const { pool } = makeFakePool();
    const metrics = new IdempotencyMetrics();
    const executor = new MysqlIdempotencyExecutor(pool as never, metrics);
    const businessError = new Error('业务冲突');

    await expect(
      executor.execute(makeCommand(vi.fn().mockRejectedValue(businessError))),
    ).rejects.toBe(businessError);
    expect(metrics.snapshot()).toEqual({
      firstRun: 0,
      replay: 0,
      conflict: 0,
      storageRetryable: 0,
      corrupt: 0,
    });
  });
});
