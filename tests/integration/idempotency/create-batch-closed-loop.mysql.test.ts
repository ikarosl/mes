import '../../../apps/api/node_modules/reflect-metadata';
import { loadWorkspaceEnv } from '../../../packages/config/src/index.js';
import { BUSINESS_NUMBER_PREFIX } from '../../../packages/constants/src/index.js';
import { withTransaction } from '../../../apps/api/node_modules/@company/database/dist/index.js';
import {
  createPool,
  type ExecuteValues,
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from '../../../apps/api/node_modules/mysql2/promise.js';
import {
  BadRequestException,
  type ExecutionContext,
} from '../../../apps/api/node_modules/@nestjs/common';
import { Reflector } from '../../../apps/api/node_modules/@nestjs/core';
import { Test, type TestingModule } from '../../../apps/api/node_modules/@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { IdempotentCommandContext } from '../../../apps/api/src/common/audit/audit.types.js';
import { DATABASE_POOL } from '../../../apps/api/src/infrastructure/database/database.module.js';
import { InventoryReservationsModule } from '../../../apps/api/src/infrastructure/inventory-reservations/inventory-reservations.module.js';
import { IdempotencyKeyGuard } from '../../../apps/api/src/infrastructure/idempotency/idempotency-key.guard.js';
import { MysqlProductCatalogRepository } from '../../../apps/api/src/modules/product/infrastructure/mysql-product-catalog.repository.js';
import { ProductionController } from '../../../apps/api/src/modules/production/presentation/http/production.controller.js';
import { CREATE_BATCH_IDEMPOTENCY_SCOPE } from '../../../apps/api/src/modules/production/application/idempotency/production-idempotency-scopes.contract.js';
import {
  approveBomForProduction,
  cleanupApprovedBom,
  type ApprovedBomFixture,
} from './approval-bom-fixture.js';

loadWorkspaceEnv();

const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;

// scope 唯一事实来源是后端幂等契约文件，测试不得单独硬编码字符串。
const SCOPE = CREATE_BATCH_IDEMPOTENCY_SCOPE;

/**
 * createBatch application/database 幂等闭环（真实 MySQL）：通过真实 Nest 模块装配取得
 * ProductionController -> ProductionService -> MysqlIdempotencyExecutor -> 批次 Repository，手工构造
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
  'createBatch application/database idempotency closed-loop (real Nest DI + MySQL, 无 HTTP 管线)',
  () => {
    let pool: Pool;
    let moduleRef: TestingModule | undefined;
    let controller: ProductionController;
    let productCatalog: MysqlProductCatalogRepository;
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
      // 组合根提供 Inventory 的生产预留端口，并间接装配真实 Production/Product/Approval 模块。
      // 所有 Repository 和 executor 共用此测试池，嵌套事务才复用同一活跃连接。
      moduleRef = await Test.createTestingModule({ imports: [InventoryReservationsModule] })
        .overrideProvider(DATABASE_POOL)
        .useValue(pool)
        .compile();
      await moduleRef.init();
      controller = moduleRef.get(ProductionController);
      productCatalog = moduleRef.get(MysqlProductCatalogRepository);
      guard = new IdempotencyKeyGuard(new Reflector());
      fixture = await createFixture(pool);
      fixture.approval = await approveBomForProduction({
        pool,
        token: fixture.token,
        actorId: fixture.actorId,
        roleId: fixture.roleId,
        productId: fixture.productId,
        expectedProductVersion: 0,
      });
    });

    afterAll(async () => {
      try {
        if (pool && fixture) await cleanupFixture(pool, fixture);
      } finally {
        try {
          await moduleRef?.close();
        } finally {
          await pool?.end();
        }
      }
    });

    // 各场景独立从空批次、幂等记录和请求审计开始，不依赖成功场景先执行。
    beforeEach(async () => {
      await cleanupBatchState(pool, fixture);
    });

    it('成功：幂等记录、批次、成功审计三者同事务提交；同键同内容重放不新增写入且返回同一结果', async () => {
      const payload = {
        routeId: String(fixture.routeId),
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
      expect(first).toMatchObject({
        workOrderId: String(fixture.workOrderId),
        routeId: String(fixture.routeId),
        plannedQuantity: '2',
        status: 'pending',
        ownerId: String(fixture.ownerId),
      });
      expect(first.batchNo).toMatch(
        new RegExp(`^${BUSINESS_NUMBER_PREFIX.production_batch}\\d{8}-[1-9]\\d*$`),
      );

      // 三表同事务提交：批次行、completed 幂等记录、成功审计
      const [[batch]] = await pool.query<
        (RowDataPacket & { batch_no: string; planned_quantity: number })[]
      >('SELECT batch_no,planned_quantity FROM production_batches WHERE id=? AND work_order_id=?', [
        first.id,
        fixture.workOrderId,
      ]);
      expect(batch).toMatchObject({ batch_no: first.batchNo, planned_quantity: 2 });
      const [steps] = await pool.query<
        (RowDataPacket & { route_step_id: number; status: string })[]
      >('SELECT route_step_id,status FROM batch_step_records WHERE production_batch_id=?', [
        first.id,
      ]);
      expect(steps).toHaveLength(1);
      expect(steps[0]).toMatchObject({ route_step_id: fixture.routeStepId, status: 'pending' });

      const [[bomLock]] = await pool.query<
        (RowDataPacket & {
          bom_status: string;
          bom_approval_instance_id: number | null;
          bom_locked_at: Date | null;
          bom_locked_by: number | null;
          version: number;
        })[]
      >(
        'SELECT bom_status,bom_approval_instance_id,bom_locked_at,bom_locked_by,version FROM products WHERE id=?',
        [fixture.productId],
      );
      expect(bomLock).toMatchObject({
        bom_status: 'approved',
        bom_approval_instance_id: fixture.approval?.approvalInstanceId,
        bom_locked_by: fixture.actorId,
        version: 2,
      });
      expect(bomLock.bom_locked_at).not.toBeNull();

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
      expect(
        typeof record.result_json === 'string'
          ? JSON.parse(record.result_json)
          : record.result_json,
      ).toEqual(first);
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
      >(
        "SELECT module,result,target_type,log_type FROM operation_logs WHERE request_id=? AND action='production-batch.create'",
        [fixture.requestId],
      );
      expect(audit).toMatchObject({
        module: 'production',
        result: 'success',
        target_type: 'production_batch',
        log_type: 'business',
      });
      const committedSequence = await productionBatchSequenceState(pool);

      // 同键同内容重放：不重跑 handler，批次/记录/审计计数均不增加，响应与首次完全一致（冻结快照）
      const replay = await controller.createBatch(
        { workOrderId: String(fixture.workOrderId) },
        payload,
        commandContext(fixture.actorId, fixture.key, fixture.replayRequestId),
      );
      expect(replay).toEqual(first);
      expect(await productionBatchSequenceState(pool)).toEqual(committedSequence);
      const [[stepCount]] = await pool.query<(RowDataPacket & { total: number })[]>(
        'SELECT COUNT(*) total FROM batch_step_records WHERE production_batch_id=?',
        [first.id],
      );
      expect(Number(stepCount.total)).toBe(1);

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

      const [[lockAuditCount]] = await pool.query<(RowDataPacket & { total: number })[]>(
        "SELECT COUNT(*) total FROM operation_logs WHERE request_id=? AND action='bom.approve'",
        [fixture.requestId],
      );
      // 生产任务只读取批准事实；BOM 的永久锁定审计来自审批事务，不能被任务创建重复写入。
      expect(Number(lockAuditCount.total)).toBe(0);

      await expect(
        productCatalog.replaceMaterials(
          String(fixture.productId),
          {
            version: 2,
            items: [
              {
                materialId: String(fixture.materialId),
                quantityPerUnit: 1,
                unit: 'pcs',
              },
            ],
          },
          commandContext(fixture.actorId, 'not-used', `${fixture.requestId}-locked-edit`),
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT', message: expect.stringContaining('永久锁定') });
    });

    it('业务失败整体回滚：不残留幂等记录、批次或成功审计', async () => {
      const beforeBom = await productLockState(pool, fixture.productId);
      expect(beforeBom).toMatchObject({
        bom_status: 'approved',
        bom_approval_instance_id: fixture.approval?.approvalInstanceId,
        bom_locked_by: fixture.actorId,
        version: 2,
      });
      const beforeSequence = await productionBatchSequenceState(pool);
      const payload = {
        routeId: String(fixture.routeId),
        plannedQuantity: 999, // 超过工单剩余数量 -> 首次执行 handler 内业务校验失败
        ownerId: String(fixture.ownerId),
      };

      await expect(
        controller.createBatch(
          { workOrderId: String(fixture.workOrderId) },
          payload,
          commandContext(fixture.actorId, fixture.failureKey, fixture.failureRequestId),
        ),
      ).rejects.toMatchObject({
        code: 'INVALID_INPUT',
        message: '生产批次计划数量超过工单剩余数量',
      });

      const [[batchCount]] = await pool.query<(RowDataPacket & { total: number })[]>(
        'SELECT COUNT(*) total FROM production_batches WHERE work_order_id=?',
        [fixture.workOrderId],
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

      expect(await productLockState(pool, fixture.productId)).toEqual(beforeBom);
      expect(await productionBatchSequenceState(pool)).toEqual(beforeSequence);
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
  roleId: number;
  categoryId: number;
  materialCategoryId: number;
  productId: number;
  materialId: number;
  processStepId: number;
  routeId: number;
  routeStepId: number;
  workOrderId: number;
  key: string;
  requestId: string;
  replayRequestId: string;
  failureKey: string;
  failureRequestId: string;
  approval?: ApprovedBomFixture;
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

// 基础夹具一次提交；任一步失败都会回滚，beforeAll 不会留下未返回的半套资料。
const createFixture = (pool: Pool): Promise<Fixture> =>
  withTransaction(pool, async (connection) => {
    const token = `closed-loop-${process.pid}-${Math.floor(Math.random() * 1_000_000)}`;
    const actorId = await insert(
      connection,
      'INSERT INTO users (username,password_hash,display_name) VALUES (?,?,?)',
      [`${token}-actor`, 'hash', '闭环测试操作者'],
    );
    const ownerId = await insert(
      connection,
      'INSERT INTO users (username,password_hash,display_name) VALUES (?,?,?)',
      [`${token}-owner`, 'hash', '闭环测试负责人'],
    );
    const roleId = await insert(
      connection,
      'INSERT INTO roles (name,code,description,status) VALUES (?,?,?,1)',
      [`${token}-role`, `${token}-role`, '闭环测试审批角色'],
    );
    const categoryId = await insert(
      connection,
      'INSERT INTO item_categories (category_code,category_name,item_kind) VALUES (?,?,?)',
      [`${token}-cat`, '闭环测试分类', 'finished_product'],
    );
    const productId = await insert(
      connection,
      'INSERT INTO products (item_code,product_name,category_id,unit,acquire_method) VALUES (?,?,?,?,?)',
      [`${token}-product`, '闭环测试产品', categoryId, 'pcs', 'self_made'],
    );
    const materialCategoryId = await insert(
      connection,
      'INSERT INTO item_categories (category_code,category_name,item_kind) VALUES (?,?,?)',
      [`${token}-material-cat`, '闭环测试物料分类', 'material'],
    );
    const materialId = await insert(
      connection,
      'INSERT INTO materials (material_code,material_name,category_id,unit,acquire_method) VALUES (?,?,?,?,?)',
      [`${token}-material`, '闭环测试物料', materialCategoryId, 'pcs', 'purchased'],
    );
    await connection.execute(
      `INSERT INTO product_materials
       (product_id,material_id,quantity_per_unit,unit)
     VALUES (?,?,?,?)`,
      [productId, materialId, 1, 'pcs'],
    );
    const processStepId = await insert(
      connection,
      'INSERT INTO process_steps (step_code,step_name) VALUES (?,?)',
      [`${token}-step`, '闭环测试工序'],
    );
    const routeId = await insert(
      connection,
      "INSERT INTO process_routes (route_code,route_name,version_no,status) VALUES (?,?,?,'enabled')",
      [`${token}-route`, '闭环测试路线', 'v1'],
    );
    const routeStepId = await insert(
      connection,
      `INSERT INTO process_route_steps
       (route_id,process_step_id,step_order,step_code_snapshot,step_name_snapshot)
     VALUES (?,?,1,?,?)`,
      [routeId, processStepId, `${token}-step`, '闭环测试工序'],
    );
    const workOrderId = await insert(
      connection,
      `INSERT INTO work_orders
       (work_order_no,order_type,product_id,product_code_snapshot,product_name_snapshot,
        unit_snapshot,planned_quantity,work_order_owner_id,plan_start_date,plan_end_date,
        status,released_at,created_by,updated_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,'released',NOW(),?,?)`,
      [
        `${token}-wo`,
        'mass_production',
        productId,
        `${token}-product`,
        '闭环测试产品',
        'pcs',
        10,
        ownerId,
        '2026-08-01',
        '2026-08-31',
        actorId,
        actorId,
      ],
    );
    return {
      token,
      actorId,
      ownerId,
      roleId,
      categoryId,
      materialCategoryId,
      productId,
      materialId,
      processStepId,
      routeId,
      routeStepId,
      workOrderId,
      key: `${token}-create-key`,
      requestId: `${token}-req-create`,
      replayRequestId: `${token}-req-replay`,
      failureKey: `${token}-fail-key`,
      failureRequestId: `${token}-req-fail`,
    };
  });

const cleanupBatchState = async (pool: Pool, fixture: Fixture): Promise<void> => {
  await pool.execute('DELETE FROM http_idempotency_records WHERE scope=? AND actor_id=?', [
    SCOPE,
    fixture.actorId,
  ]);
  const requestIds = [fixture.requestId, fixture.replayRequestId, fixture.failureRequestId];
  await pool.execute(
    `DELETE FROM operation_logs WHERE request_id IN (${requestIds.map(() => '?').join(',')})`,
    requestIds,
  );
  await pool.execute(
    `DELETE s FROM batch_step_records s JOIN production_batches b ON b.id=s.production_batch_id
     WHERE b.work_order_id=?`,
    [fixture.workOrderId],
  );
  await pool.execute('DELETE FROM production_batches WHERE work_order_id=?', [fixture.workOrderId]);
};

const cleanupFixture = async (pool: Pool, fixture: Fixture): Promise<void> => {
  if (fixture.approval) {
    await cleanupApprovedBom(pool, fixture.approval);
  } else {
    // 审批 helper 在返回前失败时，按本夹具独有产品/角色找回已经提交的申请和流程。
    const [[instance]] = await pool.query<(RowDataPacket & { id: number })[]>(
      "SELECT id FROM approval_instances WHERE subject_type='product' AND subject_id=? ORDER BY id DESC LIMIT 1",
      [fixture.productId],
    );
    const [[flow]] = await pool.query<(RowDataPacket & { definition_id: number })[]>(
      `SELECT DISTINCT v.definition_id FROM approval_flow_versions v
       JOIN approval_flow_steps s ON s.flow_version_id=v.id WHERE s.role_id=?`,
      [fixture.roleId],
    );
    await cleanupApprovedBom(pool, {
      token: fixture.token,
      productId: fixture.productId,
      approvalInstanceId: instance?.id,
      flowDefinitionId: flow?.definition_id,
    });
  }
  await cleanupBatchState(pool, fixture);
  await pool.execute('DELETE FROM work_orders WHERE id=?', [fixture.workOrderId]);
  await pool.execute('DELETE FROM product_materials WHERE product_id=?', [fixture.productId]);
  await pool.execute('DELETE FROM products WHERE id=?', [fixture.productId]);
  await pool.execute('DELETE FROM process_route_steps WHERE route_id=?', [fixture.routeId]);
  await pool.execute('DELETE FROM process_routes WHERE id=?', [fixture.routeId]);
  await pool.execute('DELETE FROM process_steps WHERE id=?', [fixture.processStepId]);
  await pool.execute('DELETE FROM materials WHERE id=?', [fixture.materialId]);
  await pool.execute('DELETE FROM item_categories WHERE id IN (?,?)', [
    fixture.categoryId,
    fixture.materialCategoryId,
  ]);
  await pool.execute('DELETE FROM role_permissions WHERE role_id=?', [fixture.roleId]);
  await pool.execute('DELETE FROM user_roles WHERE user_id IN (?,?)', [
    fixture.actorId,
    fixture.ownerId,
  ]);
  await pool.execute('DELETE FROM roles WHERE id=?', [fixture.roleId]);
  await pool.execute('DELETE FROM users WHERE id IN (?,?)', [fixture.actorId, fixture.ownerId]);
};

const productionBatchSequenceState = async (pool: Pool) => {
  const [rows] = await pool.query<
    (RowDataPacket & { number_date: string; last_sequence: string })[]
  >(
    `SELECT DATE_FORMAT(number_date,'%Y-%m-%d') number_date,CAST(last_sequence AS CHAR) last_sequence
     FROM business_number_daily_sequence WHERE number_kind='production_batch' ORDER BY number_date`,
  );
  return rows;
};

const productLockState = async (pool: Pool, productId: number) => {
  const [[row]] = await pool.query<
    (RowDataPacket & {
      bom_status: string;
      bom_approval_instance_id: number | null;
      bom_locked_at: Date | null;
      bom_locked_by: number | null;
      version: number;
    })[]
  >(
    'SELECT bom_status,bom_approval_instance_id,bom_locked_at,bom_locked_by,version FROM products WHERE id=?',
    [productId],
  );
  return row;
};

const insert = async (db: Pool | PoolConnection, sql: string, values: ExecuteValues[]) => {
  const [result] = await db.execute<ResultSetHeader>(sql, values);
  return Number(result.insertId);
};

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} for MySQL integration test`);
  return value;
};
