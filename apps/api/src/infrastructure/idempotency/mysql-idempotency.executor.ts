import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '@company/database';
import {
  IdempotencyExecutor,
  type IdempotencyExecution,
  type IdempotentCommand,
} from '../../common/idempotency/idempotency-executor.js';
import { IdempotencyStorageError } from '../../common/idempotency/idempotency.errors.js';
import { idempotencyConflict } from '../../common/persistence/optimistic-lock.js';
import { DATABASE_POOL } from '../database/database.module.js';
import { requestFingerprint } from './canonical-request-fingerprint.js';
import { assertJsonValue } from './json-value.js';

/** 第一阶段 completed 记录从完成时起至少保留 30 天。 */
const IDEMPOTENCY_RETENTION_DAYS = 30;

interface IdempotencyRecordRow extends RowDataPacket {
  id: number;
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
 * `http_idempotency_records` 的唯一合法写入者（docs/architecture.md §2、§7）：
 * 开启外层事务，幂等记录、业务写入和成功审计在同一数据库连接上原子提交。
 *
 * 业务流程（docs/http-idempotency-implementation-plan.md §7）：
 *  - 首次出现：INSERT processing -> 执行业务 handler -> 校验并保存 JSON-safe 结果 -> 置为 completed；
 *  - 已有相同指纹：不执行 handler，读取并返回原业务结果（重放）；
 *  - 已有不同指纹：抛出 `IDEMPOTENCY_CONFLICT`；
 *  - 唯一键竞争：第二个 INSERT 等待第一个事务结束；提交后收到重复键则重放，回滚后成为真正执行者。
 * 业务失败、数据库失败或结果序列化失败使整个事务回滚，不留下失败占位或中毒键。
 */
@Injectable()
export class MysqlIdempotencyExecutor implements IdempotencyExecutor {
  private readonly logger = new Logger(MysqlIdempotencyExecutor.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async execute<TResult>(
    command: IdempotentCommand<TResult>,
  ): Promise<IdempotencyExecution<TResult>> {
    const fingerprint = requestFingerprint({
      scope: command.scope,
      actorId: command.actorId,
      params: command.request.params,
      query: command.request.query,
      body: command.request.body,
    });

    return withTransaction(this.pool, async (connection) => {
      try {
        await this.insertProcessing(connection, command, fingerprint);
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
        return this.replayOrConflict(connection, command, fingerprint);
      }

      const result = await command.handler();
      const encoded = command.resultCodec.encode(result);
      assertJsonValue(encoded);
      const [update] = await connection.execute<ResultSetHeader>(
        `UPDATE http_idempotency_records
         SET status='completed', result_json=?, completed_at=NOW(), expires_at=DATE_ADD(NOW(), INTERVAL ? DAY)
         WHERE scope=? AND idempotency_key=? AND status='processing'`,
        [JSON.stringify(encoded), IDEMPOTENCY_RETENTION_DAYS, command.scope, command.key],
      );
      if (update.affectedRows !== 1) {
        // 防御性兜底：异常竞态导致本事务不再是唯一持有者时整体回滚，交由下一次重试仲裁。
        throw new IdempotencyStorageError(
          'retryable',
          '幂等登记被并发修改，请重试（业务写入已随事务回滚）',
        );
      }
      return { result, isReplay: false };
    });
  }

  private async insertProcessing<TResult>(
    connection: PoolConnection,
    command: IdempotentCommand<TResult>,
    fingerprint: string,
  ): Promise<void> {
    await connection.execute(
      `INSERT INTO http_idempotency_records
       (scope,idempotency_key,request_fingerprint,actor_id,initial_request_id,status)
       VALUES (?,?,?,?,?,'processing')`,
      [command.scope, command.key, fingerprint, command.actorId, command.requestId],
    );
  }

  /**
   * 唯一键竞争路径：锁定读当前行（RR 下可看到竞争方刚提交的记录），按指纹与状态分派。
   * 绝不在重放路径再次执行 handler；已保存结果无法反序列化时抛 corrupt，交由调用方告警。
   */
  private async replayOrConflict<TResult>(
    connection: PoolConnection,
    command: IdempotentCommand<TResult>,
    fingerprint: string,
  ): Promise<IdempotencyExecution<TResult>> {
    const [rows] = await connection.query<IdempotencyRecordRow[]>(
      `SELECT scope,idempotency_key,request_fingerprint,actor_id,initial_request_id,status,result_json,created_at,completed_at,expires_at
       FROM http_idempotency_records
       WHERE scope=? AND idempotency_key=? FOR UPDATE`,
      [command.scope, command.key],
    );
    const existing = rows[0];
    if (!existing) {
      // 唯一键竞争方已回滚，本事务可成为真正执行者；抛出可重试错误让调用方再次尝试。
      throw new IdempotencyStorageError('retryable', '幂等登记竞态，记录尚未提交，请重试');
    }
    if (existing.request_fingerprint !== fingerprint) throw idempotencyConflict();
    if (existing.status !== 'completed') {
      // 单事务方案下 completed 之外不应对其他事务可见；出现即异常信号。
      throw new IdempotencyStorageError('retryable', '幂等记录尚未完成，请重试');
    }
    let result: TResult;
    try {
      result = command.resultCodec.decode(existing.result_json);
    } catch {
      this.logger.error(
        `Idempotency record corrupt: scope=${command.scope} key=${command.key} fingerprint=${fingerprint}`,
      );
      throw new IdempotencyStorageError('corrupt', '已保存的幂等结果无法反序列化');
    }
    return { result, isReplay: true };
  }
}

const isDuplicateKeyError = (error: unknown): boolean =>
  (error as { code?: string })?.code === 'ER_DUP_ENTRY';
