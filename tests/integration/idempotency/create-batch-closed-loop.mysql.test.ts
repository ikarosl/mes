import '../../../apps/api/node_modules/reflect-metadata';
import { loadWorkspaceEnv } from '../../../packages/config/src/index.js';
import {
  createPool,
  type ExecuteValues,
  type Pool,
  type ResultSetHeader,
  type RowDataPacket,
} from '../../../apps/api/node_modules/mysql2/promise.js';
import {
  BadRequestException,
  type ExecutionContext,
} from '../../../apps/api/node_modules/@nestjs/common';
import { Reflector } from '../../../apps/api/node_modules/@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { IdempotentCommandContext } from '../../../apps/api/src/common/audit/audit.types.js';
import { MysqlIdempotencyExecutor } from '../../../apps/api/src/infrastructure/idempotency/mysql-idempotency.executor.js';
import { IdentityDirectoryService } from '../../../apps/api/src/modules/identity/application/identity-directory.service.js';
import { MysqlRbacRepository } from '../../../apps/api/src/modules/identity/infrastructure/mysql-rbac.repository.js';
import { IdempotencyKeyGuard } from '../../../apps/api/src/infrastructure/idempotency/idempotency-key.guard.js';
import { ProductSnapshotService } from '../../../apps/api/src/modules/product/application/product-snapshot.service.js';
import { MysqlProductSnapshotRepository } from '../../../apps/api/src/modules/product/infrastructure/mysql-product-snapshot.repository.js';
import { ProductionService } from '../../../apps/api/src/modules/production/application/production.service.js';
import { MysqlProductionBatchRepository } from '../../../apps/api/src/modules/production/infrastructure/mysql-production-batch.repository.js';
import { MysqlProductionRepository } from '../../../apps/api/src/modules/production/infrastructure/mysql-production.repository.js';
import { MysqlWorkOrderRepository } from '../../../apps/api/src/modules/production/infrastructure/mysql-work-order.repository.js';
import { ProductionController } from '../../../apps/api/src/modules/production/presentation/http/production.controller.js';
import { CREATE_BATCH_IDEMPOTENCY_SCOPE } from '../../../apps/api/src/modules/production/application/idempotency/create-batch-idempotency.contract.js';

loadWorkspaceEnv();

const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;

// scope 唯一事实来源是后端幂等契约文件，测试不得单独硬编码字符串。
const SCOPE = CREATE_BATCH_IDEMPOTENCY_SCOPE;

/**
 * createBatch application/database 幂等闭环（真实 MySQL）：直接构造 ProductionController ->
 * ProductionService -> MysqlIdempotencyExecutor -> 真实批次 Repository，手工构造
 * IdempotentCommandContext 并直接调用 IdempotencyKeyGuard.canActivate，证明
 * "http_idempotency_records + production_batches + operation_logs" 三者同一事务：
 * 成功三表同提交、业务失败三表同回滚、重放不新增任何写入。
 *
 * 注意：本测试未经过真实 HTTP 管线，不覆盖：AuthGuard 与 IdempotencyKeyGuard 的真实注册顺序、
 * DTO Pipe 参数解析与校验、CurrentIdempotentCommandContext 装饰器取值、AuditInterceptor 失败审计、
 * HttpExceptionFilter 的最终 HTTP 错误 envelope。上述内容由
 * create-batch-http-pipeline.mysql.test.ts（真实 Nest 测试应用）覆盖。
 */
describeMysql(
  'createBatch application/database idempotency closed-loop (real MySQL, 直接构造无 HTTP 管线)',
  () => {
    let pool: Pool;
    let controller: ProductionController;
    let guard: IdempotencyKeyGuard;
    let fixture: Fixture;

    beforeAll(async () => {
      pool = createPool({
        host: requiredEnv('DB_HOST'),
        port: Number(requiredEnv('DB_PORT')),
        user: requiredEnv('DB_USER'),
        password: requiredEnv('DB_PASSWORD'),
        database: requiredEnv('DB_NAME'),
        charset: 'utf8mb4',
        timezone: '+08:00',
        connectionLimit: 4,
      });
      fixture = await createFixture(pool);
      const workOrders = new MysqlWorkOrderRepository(pool);
      const batches = new MysqlProductionBatchRepository(pool);
      const production = new MysqlProductionRepository(workOrders, batches);
      const products = new ProductSnapshotService(new MysqlProductSnapshotRepository(pool));
      const identity = new IdentityDirectoryService(new MysqlRbacRepository(pool));
      const executor = new MysqlIdempotencyExecutor(pool);
      const service = new ProductionService(production, products, identity, executor);
      controller = new ProductionController(service);
      guard = new IdempotencyKeyGuard(new Reflector());
    });

    afterAll(async () => {
      if (pool && fixture) {
        const requestIds = [fixture.requestId, fixture.replayRequestId, fixture.failureRequestId];
        const placeholders = requestIds.map(() => '?').join(',');
        await pool.execute(
          `DELETE FROM operation_logs WHERE request_id IN (${placeholders})`,
          requestIds,
        );
        await pool.execute('DELETE FROM http_idempotency_records WHERE scope=? AND actor_id=?', [
          SCOPE,
          fixture.actorId,
        ]);
        await pool.execute('DELETE FROM production_batches WHERE work_order_id=?', [
          fixture.workOrderId,
        ]);
        await pool.execute('DELETE FROM work_orders WHERE id=?', [fixture.workOrderId]);
        await pool.execute('DELETE FROM products WHERE id=?', [fixture.productId]);
        await pool.execute('DELETE FROM product_categories WHERE id=?', [fixture.categoryId]);
        await pool.execute('DELETE FROM users WHERE id IN (?,?)', [
          fixture.actorId,
          fixture.ownerId,
        ]);
      }
      await pool?.end();
    });

    // 每个用例从空幂等记录开始，绝对计数断言才成立，且不受上次运行残留影响。
    beforeEach(async () => {
      await pool.execute('DELETE FROM http_idempotency_records WHERE scope=? AND actor_id=?', [
        SCOPE,
        fixture.actorId,
      ]);
    });

    it('成功：幂等记录、批次、成功审计三者同事务提交；同键同内容重放不新增写入且返回同一结果', async () => {
      const payload = {
        batchNo: fixture.successBatchNo,
        plannedQuantity: 2,
        ownerId: String(fixture.ownerId),
        planStartDate: '2026-08-01',
        planEndDate: '2026-08-31',
        remark: '闭环测试',
      };

      const first = await controller.createBatch(
        { workOrderId: String(fixture.workOrderId) },
        payload,
        commandContext(fixture.actorId, fixture.key, fixture.requestId),
      );

      // 三表同事务提交：批次行、completed 幂等记录、成功审计
      const [[batch]] = await pool.query<(RowDataPacket & { planned_quantity: string })[]>(
        'SELECT planned_quantity FROM production_batches WHERE work_order_id=? AND batch_no=?',
        [fixture.workOrderId, payload.batchNo],
      );
      expect(batch).toMatchObject({ planned_quantity: '2.0000' });

      const [[record]] = await pool.query<
        (RowDataPacket & {
          status: string;
          initial_request_id: string;
          result_json: unknown;
          completed_at: Date;
          expires_at: Date;
        })[]
      >(
        'SELECT status,initial_request_id,result_json,completed_at,expires_at FROM http_idempotency_records WHERE scope=? AND idempotency_key=?',
        [SCOPE, fixture.key],
      );
      expect(record.status).toBe('completed');
      expect(record.initial_request_id).toBe(fixture.requestId);
      expect(record.result_json).not.toBeNull();
      expect(record.completed_at).not.toBeNull();
      // 最短重放保证窗口与前端 TTL（IDEMPOTENT_INTENT_TTL_MS）一致：completed 后 12 小时
      expect(record.expires_at).not.toBeNull();
      const retentionMs =
        new Date(record.expires_at).getTime() - new Date(record.completed_at).getTime();
      expect(Math.round(retentionMs / (60 * 60 * 1000))).toBe(12);

      const [[audit]] = await pool.query<
        (RowDataPacket & {
          module: string;
          result: string;
          target_type: string;
          log_type: string;
        })[]
      >('SELECT module,result,target_type,log_type FROM operation_logs WHERE request_id=?', [
        fixture.requestId,
      ]);
      expect(audit).toMatchObject({
        module: 'production',
        result: 'success',
        target_type: 'production_batch',
        log_type: 'business',
      });

      // 同键同内容重放：不重跑 handler，批次/记录/审计计数均不增加，响应与首次完全一致（冻结快照）
      const replay = await controller.createBatch(
        { workOrderId: String(fixture.workOrderId) },
        payload,
        commandContext(fixture.actorId, fixture.key, fixture.replayRequestId),
      );
      expect(replay).toEqual(first);

      const [[batchCount]] = await pool.query<(RowDataPacket & { total: number })[]>(
        'SELECT COUNT(*) total FROM production_batches WHERE work_order_id=?',
        [fixture.workOrderId],
      );
      expect(Number(batchCount.total)).toBe(1);

      const [[recordCount]] = await pool.query<(RowDataPacket & { total: number })[]>(
        'SELECT COUNT(*) total FROM http_idempotency_records WHERE scope=? AND idempotency_key=?',
        [SCOPE, fixture.key],
      );
      expect(Number(recordCount.total)).toBe(1);

      const [[replayAuditCount]] = await pool.query<(RowDataPacket & { total: number })[]>(
        'SELECT COUNT(*) total FROM operation_logs WHERE request_id=?',
        [fixture.replayRequestId],
      );
      expect(Number(replayAuditCount.total)).toBe(0);
    });

    it('业务失败整体回滚：不残留幂等记录、批次或成功审计', async () => {
      const payload = {
        batchNo: fixture.failureBatchNo,
        plannedQuantity: 999, // 超过工单剩余数量 -> 首次执行 handler 内业务校验失败
        ownerId: String(fixture.ownerId),
      };

      await expect(
        controller.createBatch(
          { workOrderId: String(fixture.workOrderId) },
          payload,
          commandContext(fixture.actorId, fixture.failureKey, fixture.failureRequestId),
        ),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });

      const [[batchCount]] = await pool.query<(RowDataPacket & { total: number })[]>(
        'SELECT COUNT(*) total FROM production_batches WHERE work_order_id=? AND batch_no=?',
        [fixture.workOrderId, payload.batchNo],
      );
      expect(Number(batchCount.total)).toBe(0);

      const [[recordCount]] = await pool.query<(RowDataPacket & { total: number })[]>(
        'SELECT COUNT(*) total FROM http_idempotency_records WHERE scope=? AND idempotency_key=?',
        [SCOPE, fixture.failureKey],
      );
      expect(Number(recordCount.total)).toBe(0);

      // 事务内成功审计随业务回滚消失；不残留任何成功审计
      const [[successAuditCount]] = await pool.query<(RowDataPacket & { total: number })[]>(
        "SELECT COUNT(*) total FROM operation_logs WHERE request_id=? AND result='success'",
        [fixture.failureRequestId],
      );
      expect(Number(successAuditCount.total)).toBe(0);
    });

    it('IdempotencyKeyGuard 门禁（直接调用 canActivate）：已启用端点缺少 Idempotency-Key 返回 400，合法键放行', async () => {
      expect(() => guard.canActivate(guardContext({}))).toThrow(BadRequestException);
      expect(guard.canActivate(guardContext({ 'idempotency-key': 'valid-key' }))).toBe(true);
    });
  },
);

interface Fixture {
  token: string;
  actorId: number;
  ownerId: number;
  categoryId: number;
  productId: number;
  workOrderId: number;
  successBatchNo: string;
  failureBatchNo: string;
  key: string;
  requestId: string;
  replayRequestId: string;
  failureKey: string;
  failureRequestId: string;
}

const commandContext = (
  actorId: number,
  idempotencyKey: string,
  requestId: string,
): IdempotentCommandContext => ({
  actorId: String(actorId),
  requestId,
  ip: '127.0.0.1',
  userAgent: null,
  idempotencyKey,
});

/** 用真实 Controller handler 读取 @IdempotentEndpoint() 元数据的 Guard 执行上下文。 */
const guardContext = (headers: Record<string, string | undefined>): ExecutionContext =>
  ({
    getHandler: () => ProductionController.prototype.createBatch,
    getClass: () => ProductionController,
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  }) as unknown as ExecutionContext;

const createFixture = async (pool: Pool): Promise<Fixture> => {
  const token = `closed-loop-${process.pid}-${Math.floor(Math.random() * 1_000_000)}`;
  const actorId = await insert(
    pool,
    'INSERT INTO users (username,password_hash,display_name) VALUES (?,?,?)',
    [`${token}-actor`, 'hash', '闭环测试操作者'],
  );
  const ownerId = await insert(
    pool,
    'INSERT INTO users (username,password_hash,display_name) VALUES (?,?,?)',
    [`${token}-owner`, 'hash', '闭环测试负责人'],
  );
  const categoryId = await insert(
    pool,
    'INSERT INTO product_categories (category_code,category_name,item_kind) VALUES (?,?,?)',
    [`${token}-cat`, '闭环测试分类', 'finished_product'],
  );
  const productId = await insert(
    pool,
    'INSERT INTO products (item_code,product_name,category_id,unit,acquire_method) VALUES (?,?,?,?,?)',
    [`${token}-product`, '闭环测试产品', categoryId, 'pcs', 'self_made'],
  );
  const workOrderId = await insert(
    pool,
    'INSERT INTO work_orders (work_order_no,product_id,product_code_snapshot,product_name_snapshot,unit_snapshot,planned_quantity,status) VALUES (?,?,?,?,?,?,?)',
    [`${token}-wo`, productId, `${token}-product`, '闭环测试产品', 'pcs', '10.0000', 'released'],
  );
  const numericSuffix = `${process.pid}${Math.floor(Math.random() * 10_000)}`;
  return {
    token,
    actorId,
    ownerId,
    categoryId,
    productId,
    workOrderId,
    successBatchNo: `task_batch-${numericSuffix}`,
    failureBatchNo: `task_batch-${numericSuffix}9`,
    key: `${token}-create-key`,
    requestId: `${token}-req-create`,
    replayRequestId: `${token}-req-replay`,
    failureKey: `${token}-fail-key`,
    failureRequestId: `${token}-req-fail`,
  };
};

const insert = async (pool: Pool, sql: string, values: ExecuteValues[]) => {
  const [result] = await pool.execute<ResultSetHeader>(sql, values);
  return Number(result.insertId);
};

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} for MySQL integration test`);
  return value;
};
