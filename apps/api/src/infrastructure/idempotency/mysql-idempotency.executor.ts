import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { DatabaseError, withTransaction } from '@company/database';
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
import { IdempotencyMetrics } from './idempotency.metrics.js';
import { maskedKeyDigest } from './idempotency-key-digest.js';
import { isMysqlServerErrorShape, isTransientMysqlError } from './mysql-transient-errors.js';

/**
 * 第一阶段 completed 记录的服务端最短重放保证：12 小时。
 *  - 12 小时内同键同指纹保证重放；
 *  - 到达 `expires_at` 只是允许清理，物理删除前同键同指纹仍重放；
 *  - 清理器实际删除后，同 scope/key 才可能作为新请求执行；
 *  - 客户端不得在 12 小时后自动重试旧键或自动换新键，应先核对业务结果（见实现方案 §5、§9）。
 */
const IDEMPOTENCY_RETENTION_HOURS = 12;

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
 * `http_idempotency_records` 的唯一业务写入者（docs/architecture.md §2、§7）：
 * 开启外层事务，幂等记录、业务写入和成功审计在同一数据库连接上原子提交。
 * 到期物理清理由 `IdempotencyHousekeepingService` 承担，二者同属平台幂等基础设施。
 *
 * 业务流程（apps/api/docs/idempotency.md §7）：
 *  - 首次出现：INSERT processing -> 执行业务 handler -> 校验并保存 JSON-safe 结果 -> 置为 completed；
 *  - 已有相同指纹：不执行 handler，读取并返回原业务结果（重放）；
 *  - 已有不同指纹：抛出 `IDEMPOTENCY_CONFLICT`；
 *  - 唯一键竞争：第二个 INSERT 等待第一个事务结束；提交后收到重复键则重放，回滚后成为真正执行者。
 * 业务失败、数据库失败或结果序列化失败使整个事务回滚，不留下失败占位或中毒键。
 *
 * MySQL 瞬态错误分类覆盖完整事务边界：
 *  - 事务内部各语句（登记 INSERT、重放 SELECT、completed UPDATE）与业务 handler 内 SQL 的瞬态错误
 *    按各自上下文分类（锁等待/死锁/连接中断/池关闭 -> retryable 503 语义，其余原样冒泡）；
 *    handler 内 SQL 若经事务连接（withActiveConnection / 嵌套 withTransaction）执行，查询错误由
 *    `@company/database` 标记为 `DatabaseError`，本类按 `cause` 分类——含无 errno 形态的网络中断
 *    （ECONNRESET/EPIPE/ETIMEDOUT），同样映射 retryable 503；
 *  - 事务边界操作（取连接/开启事务/提交）由 `@company/database` 包装为 `DatabaseError`，
 *    本类按 `cause` 做瞬态分类；rollback 失败由包内 best-effort 记录，不覆盖原始异常；
 *  - handler 内其他 SDK 的网络错误（无 mysql2 错误形态、也无 DatabaseError 标记）原样重抛，
 *    绝不误判为可重试；
 *  - 成功指标（firstRun/replay）只在事务提交成功后记录，commit 失败不虚增。
 *
 * 重放、冲突与失败通过 `IdempotencyMetrics` 记录运行观测，日志只携带 requestId、scope 和脱敏键摘要，
 * 不打印原始幂等键（apps/api/docs/idempotency.md §8）。
 */
@Injectable()
export class MysqlIdempotencyExecutor implements IdempotencyExecutor {
  private readonly logger = new Logger(MysqlIdempotencyExecutor.name);
  private readonly metrics: IdempotencyMetrics;

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    metrics?: IdempotencyMetrics,
  ) {
    // 缺省自建实例保证测试直连构造（new MysqlIdempotencyExecutor(pool)）无需额外注入。
    this.metrics = metrics ?? new IdempotencyMetrics();
  }

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

    let outcome: IdempotencyExecution<TResult>;
    try {
      outcome = await withTransaction(this.pool, async (connection) => {
        try {
          await this.insertProcessing(connection, command, fingerprint);
        } catch (error) {
          // 登记 INSERT 失败分类。四个分支互斥，storageRetryable 只在各自 throw 前记录一次，不双重计数：
          //  1. 已显式分类的内部错误（语义竞态/corrupt，由本类其他路径抛出）原样重抛，绝不二次包装；
          //  2. ER_DUP_ENTRY -> 唯一键竞争仲裁（重放/冲突/竞争方回滚后重试）；
          //  3. mysql2 瞬态错误（锁等待/死锁/连接中断/池关闭）-> retryable 503 语义；
          //  4. 其余驱动错误原样冒泡，保留堆栈与诊断信息。
          // 与 replayOrConflict 内部及防御性 UPDATE 的语义竞态路径互斥：那些路径只在 INSERT 成功或
          // 重复键之后才可达，本分支只在 INSERT 直接抛瞬态错误时命中，一次 execute 至多记录一次。
          if (error instanceof IdempotencyStorageError) throw error;
          if (isDuplicateKeyError(error))
            return this.replayOrConflict(connection, command, fingerprint);
          if (isTransientMysqlError(error))
            return this.throwStorageRetryable(error, command, '登记');
          throw error;
        }

        let result: TResult;
        try {
          result = await command.handler();
        } catch (error) {
          // handler 内业务 SQL 的瞬态错误转 retryable；其他错误（业务异常、handler 内其他 SDK
          // 的 ECONNRESET——无 mysql2 错误形态）原样重抛，绝不误判：
          //  1. 事务内经 withActiveConnection / 嵌套 withTransaction 的查询由 @company/database
          //     标记为 DatabaseError（来源明确，含无 errno 形态的网络中断 ECONNRESET/EPIPE/
          //     ETIMEDOUT），按 cause 做瞬态分类；
          //  2. 带 mysql2 服务器形态（errno/sqlState/sqlMessage）的瞬态错误按形态分类；
          //  3. 其余原样重抛。Repository 若把 DatabaseError 原样外抛，外层兜底 catch 也会按 cause
          //     分类；两条路径互斥（本分支要么直接 throwStorageRetryable 结束，要么原样重抛），
          //     「一次 execute 至多记录一次」不受影响。
          if (error instanceof DatabaseError) {
            if (isTransientMysqlError(error.cause))
              return this.throwStorageRetryable(error.cause, command, '业务执行');
            throw error;
          }
          if (isMysqlServerErrorShape(error) && isTransientMysqlError(error))
            return this.throwStorageRetryable(error, command, '业务执行');
          throw error;
        }
        const encoded = command.resultCodec.encode(result);
        assertJsonValue(encoded);
        // canonical 化保证：首次执行与重放返回同一 canonical 产物（均来自 decode(encoded)），
        // 由 executor 框架承担、不依赖 codec 自觉——任何 codec 的字段删除/日期转换/规范化都在
        // 首次即生效，杜绝首次响应与重放响应不一致（canonical 快照语义见 IdempotencyResultCodec）。
        // 若 codec 的 decode 无法解析自己的 encode 产物而抛错，整个事务（含业务写入）在落
        // completed 前回滚，不留下只能重放不可首次返回的记录。
        const canonical = command.resultCodec.decode(encoded);
        try {
          const [update] = await connection.execute<ResultSetHeader>(
            `UPDATE http_idempotency_records
             SET status='completed', result_json=?, completed_at=NOW(), expires_at=DATE_ADD(NOW(), INTERVAL ? HOUR)
             WHERE scope=? AND idempotency_key=? AND status='processing'`,
            [JSON.stringify(encoded), IDEMPOTENCY_RETENTION_HOURS, command.scope, command.key],
          );
          if (update.affectedRows !== 1) {
            // 防御性兜底：异常竞态导致本事务不再是唯一持有者时整体回滚，交由下一次重试仲裁。
            this.metrics.recordStorageRetryable();
            throw new IdempotencyStorageError(
              'retryable',
              '幂等登记被并发修改，请重试（业务写入已随事务回滚）',
            );
          }
        } catch (error) {
          // 防御性竞态错误（上面抛出的 IdempotencyStorageError）原样重抛；UPDATE 语句上下文确定
          // 是 mysql2 驱动（含网络码 ECONNRESET 等），按完整瞬态集合分类，其余原样冒泡。
          if (error instanceof IdempotencyStorageError) throw error;
          if (isTransientMysqlError(error))
            return this.throwStorageRetryable(error, command, '完成更新');
          throw error;
        }
        return { result: canonical, isReplay: false };
      });
    } catch (error) {
      // withTransaction 整体兜底分类（覆盖事务边界操作与未来路径漏网）：
      //  1. 已分类的内部错误（retryable/corrupt）与幂等冲突原样重抛，绝不二次包装；
      //  2. DatabaseError（@company/database 包装的取连接/开启事务/提交失败）按 cause 做瞬态分类，
      //     非瞬态原样重抛保留诊断；
      //  3. 兜底：带 mysql2 服务器错误形态的瞬态错误转 retryable（覆盖未被上述语句分类的路径）；
      //  4. 其余（业务异常、其他 SDK 网络错误等）原样重抛。
      // 幂等冲突（ConcurrencyError）只带业务 code、无 errno/sqlState/sqlMessage 形态，不会误入
      // 兜底分类。
      if (error instanceof IdempotencyStorageError) throw error;
      if (error instanceof DatabaseError) {
        if (isTransientMysqlError(error.cause))
          return this.throwStorageRetryable(error.cause, command, '事务边界');
        throw error;
      }
      if (isMysqlServerErrorShape(error) && isTransientMysqlError(error))
        return this.throwStorageRetryable(error, command, '事务边界');
      throw error;
    }

    // 成功指标只在事务提交成功后记录：commit 失败时 withTransaction 抛错、outcome 拿不到，
    // firstRun/replay 不虚增（commit 前的失败事件已由 recordStorageRetryable 等记录）。
    if (outcome.isReplay) {
      this.metrics.recordReplay();
      this.logger.log(
        `幂等重放：scope=${command.scope} requestId=${command.requestId} ` +
          `key=${maskedKeyDigest(command.key)}`,
      );
    } else {
      this.metrics.recordFirstRun();
    }
    return outcome;
  }

  /**
   * 记录 storageRetryable 指标、输出脱敏 WARN 日志并抛 retryable 错误（返回 never，可在 return
   * 与 throw 位置使用）。只在已确定性识别为瞬态错误后调用，一次 execute 至多命中一次。
   */
  private throwStorageRetryable<TResult>(
    error: unknown,
    command: IdempotentCommand<TResult>,
    context: string,
  ): never {
    this.metrics.recordStorageRetryable();
    const code = (error as { code?: unknown }).code;
    const label = typeof code === 'string' ? code : 'POOL_CLOSED';
    this.logger.warn(
      `幂等${context} MySQL 瞬态错误：scope=${command.scope} requestId=${command.requestId} ` +
        `key=${maskedKeyDigest(command.key)} code=${label}`,
    );
    throw new IdempotencyStorageError('retryable', `MySQL 瞬态错误（${label}），请重试`);
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
    let rows: IdempotencyRecordRow[];
    try {
      [rows] = await connection.query<IdempotencyRecordRow[]>(
        `SELECT scope,idempotency_key,request_fingerprint,actor_id,initial_request_id,status,result_json,created_at,completed_at,expires_at
         FROM http_idempotency_records
         WHERE scope=? AND idempotency_key=? FOR UPDATE`,
        [command.scope, command.key],
      );
    } catch (error) {
      // 重放锁定读与 UPDATE 同属确定性 mysql2 语句上下文（含网络码），按完整瞬态集合分类。
      if (isTransientMysqlError(error))
        return this.throwStorageRetryable(error, command, '重放读取');
      throw error;
    }
    const existing = rows[0];
    if (!existing) {
      // 唯一键竞争方已回滚，本事务可成为真正执行者；抛出可重试错误让调用方再次尝试。
      this.metrics.recordStorageRetryable();
      throw new IdempotencyStorageError('retryable', '幂等登记竞态，记录尚未提交，请重试');
    }
    if (existing.request_fingerprint !== fingerprint) {
      this.metrics.recordConflict();
      this.logger.warn(
        `幂等冲突：scope=${command.scope} requestId=${command.requestId} ` +
          `key=${maskedKeyDigest(command.key)}`,
      );
      throw idempotencyConflict();
    }
    if (existing.status !== 'completed') {
      // 单事务方案下 completed 之外不应对其他事务可见；出现即异常信号。
      this.metrics.recordStorageRetryable();
      this.logger.warn(
        `幂等记录尚未完成：scope=${command.scope} requestId=${command.requestId} ` +
          `key=${maskedKeyDigest(command.key)}`,
      );
      throw new IdempotencyStorageError('retryable', '幂等记录尚未完成，请重试');
    }
    let result: TResult;
    try {
      result = command.resultCodec.decode(existing.result_json);
    } catch {
      this.metrics.recordCorrupt();
      this.logger.error(
        `幂等结果损坏：scope=${command.scope} requestId=${command.requestId} ` +
          `key=${maskedKeyDigest(command.key)} fingerprint=${fingerprint}`,
      );
      throw new IdempotencyStorageError('corrupt', '已保存的幂等结果无法反序列化');
    }
    // 重放指标与日志移出事务，由 execute 在提交成功后统一记录（commit 失败不虚增 replay）。
    return { result, isReplay: true };
  }
}

const isDuplicateKeyError = (error: unknown): boolean =>
  (error as { code?: string })?.code === 'ER_DUP_ENTRY';
