import '../../../apps/api/node_modules/reflect-metadata';
import { loadWorkspaceEnv } from '../../../packages/config/src/index.js';
import {
  createPool,
  type ExecuteValues,
  type Pool,
  type ResultSetHeader,
  type RowDataPacket,
} from '../../../apps/api/node_modules/mysql2/promise.js';
import { SignJWT } from '../../../apps/api/node_modules/jose';
import { Test } from '../../../apps/api/node_modules/@nestjs/testing';
import type { INestApplication } from '../../../apps/api/node_modules/@nestjs/common';
// supertest 不携带类型声明（package.json 无 types 字段），@types/supertest 只声明 'supertest'
// 裸模块、对路径导入不生效；运行时从 apps/api 的 node_modules 路径导入（与 sibling 测试一致），
// 类型按 any 使用，响应断言全部由 vitest 校验。
// @ts-expect-error supertest 无内置类型，见上方注释
import request from '../../../apps/api/node_modules/supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module.js';
import { requestContextMiddleware } from '../../../apps/api/src/common/http/request-context.middleware.js';
import { DATABASE_POOL } from '../../../apps/api/src/infrastructure/database/database.module.js';
import { createValidationPipe } from '../../../apps/api/src/presentation/http/validation.pipe.js';
import { CREATE_BATCH_IDEMPOTENCY_SCOPE } from '../../../apps/api/src/modules/production/application/idempotency/create-batch-idempotency.contract.js';

loadWorkspaceEnv();

const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;

// scope 唯一事实来源是后端幂等契约文件，测试不得单独硬编码字符串。
const SCOPE = CREATE_BATCH_IDEMPOTENCY_SCOPE;

/**
 * createBatch 真实 HTTP 管线集成测试（真实 Nest 测试应用 + 真实 MySQL）。
 *
 * 用 Test.createTestingModule 编译 AppModule，走真实注册路径：APP_GUARD（AuthGuard 先、
 * IdempotencyKeyGuard 后）、APP_INTERCEPTOR（AuditInterceptor）、APP_FILTER（HttpExceptionFilter）
 * 均由模块 provider 装配；再复刻 main.ts 的全局前缀 /api、requestContextMiddleware、
 * createValidationPipe 三处手工装配。测试不手工调用 guard/filter/interceptor。
 *
 * 认证方案：真实鉴权。用 jose 以同一 JWT_SECRET/JWT_ISSUER/JWT_AUDIENCE 为测试库里真实存在、
 * 且经 roles -> role_permissions -> permissions 拥有 `production:batches:create` 权限的用户签发
 * access token，AuthGuard 与 AuthService.authenticate 照常执行（审计 actorId 外键因此合法）。
 *
 * 覆盖 closed-loop 测试（直接构造对象、无 HTTP 管线）未覆盖的：Guard 注册顺序（401 先于幂等
 * 门禁）、DTO Pipe 校验、CurrentIdempotentCommandContext 装饰器取值、AuditInterceptor 失败审计、
 * HttpExceptionFilter 最终错误 envelope。
 */
describeMysql('createBatch HTTP pipeline (real Nest app + real MySQL)', () => {
  let app: INestApplication;
  let pool: Pool;
  let fixture: Fixture;
  let accessToken: string;
  let createBatchUrl: string;

  const createPayload = () => ({
    batchNo: fixture.batchNo,
    plannedQuantity: 2,
    ownerId: String(fixture.ownerId),
    planStartDate: '2026-08-01',
    planEndDate: '2026-08-31',
    remark: 'HTTP 管线测试',
  });

  const postBatch = (options: {
    token?: string | null;
    key?: string;
    requestId?: string;
    body: Record<string, unknown>;
  }) => {
    let req = request(app.getHttpServer()).post(createBatchUrl);
    // 默认携带真实鉴权 token；显式传 null 表示不带凭证（未认证用例）。
    if (options.token !== null)
      req = req.set('Authorization', `Bearer ${options.token ?? accessToken}`);
    if (options.key !== undefined) req = req.set('Idempotency-Key', options.key);
    if (options.requestId !== undefined) req = req.set('X-Request-Id', options.requestId);
    return req.send(options.body);
  };

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
    accessToken = await signAccessToken(fixture.actorId, `${fixture.token}-actor`);
    createBatchUrl = `/api/production/work-orders/${fixture.workOrderId}/batches`;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.use(requestContextMiddleware);
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (pool && fixture) {
      // 所有请求都带确定性的 x-request-id，按 request_id 精确清理审计行；
      // AuthGuard 的 401 安全审计行不写 request_id，按本次 fixture 唯一的 action 精确清理。
      const requestIds = [
        fixture.noAuthRequestId,
        fixture.missingKeyRequestId,
        fixture.createRequestId,
        fixture.replayRequestId,
        fixture.conflictCreateRequestId,
        fixture.conflictRequestId,
        fixture.validationRequestId,
      ];
      const placeholders = requestIds.map(() => '?').join(',');
      await pool.execute(
        `DELETE FROM operation_logs WHERE request_id IN (${placeholders})`,
        requestIds,
      );
      await pool.execute("DELETE FROM operation_logs WHERE action=? AND remark='HTTP 401'", [
        `POST /api/production/work-orders/${fixture.workOrderId}/batches`,
      ]);
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
      await pool.execute('DELETE FROM users WHERE id IN (?,?)', [fixture.actorId, fixture.ownerId]);
      await pool.execute('DELETE FROM roles WHERE id=?', [fixture.roleId]);
    }
    await pool?.end();
    // AppModule 内部由 createDatabasePool 创建的应用池，显式关闭避免进程悬挂。
    const appPool = app?.get(DATABASE_POOL) as Pool | undefined;
    await appPool?.end();
  });

  // 幂等记录与批次从空状态开始，绝对计数断言才成立，且不受上次运行残留影响。
  beforeEach(async () => {
    await pool.execute('DELETE FROM http_idempotency_records WHERE scope=? AND actor_id=?', [
      SCOPE,
      fixture.actorId,
    ]);
    await pool.execute('DELETE FROM production_batches WHERE work_order_id=?', [
      fixture.workOrderId,
    ]);
  });

  it('未认证请求返回 401：AuthGuard 先于 IdempotencyKeyGuard 执行（带合法键也 401 而非 400）', async () => {
    // 携带合法 Idempotency-Key 仍 401：若幂等门禁先执行会先 400，由此证明注册顺序。
    const response = await postBatch({
      token: null,
      key: fixture.createKey,
      requestId: fixture.noAuthRequestId,
      body: createPayload(),
    });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
      message: '缺少访问令牌',
      path: createBatchUrl,
    });
    // 请求上下文中间件与异常过滤器生效：错误 envelope 回显 requestId 与响应头
    expect(response.body.requestId).toBe(fixture.noAuthRequestId);
    expect(response.headers['x-request-id']).toBe(fixture.noAuthRequestId);
  });

  it('认证但缺少 Idempotency-Key 返回 400 VALIDATION_ERROR，不落任何幂等记录', async () => {
    const response = await postBatch({
      requestId: fixture.missingKeyRequestId,
      body: createPayload(),
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: '缺少必填的 Idempotency-Key',
      path: createBatchUrl,
    });
    expect(response.body.requestId).toBe(fixture.missingKeyRequestId);

    const [[recordCount]] = await pool.query<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) total FROM http_idempotency_records WHERE scope=? AND actor_id=?',
      [SCOPE, fixture.actorId],
    );
    expect(Number(recordCount.total)).toBe(0);
  });

  it('成功：HTTP 201 + 批次落库 + completed 幂等记录 + 事务内成功审计；同键同 body 重放返回同一响应且不新增写入', async () => {
    const first = await postBatch({
      key: fixture.createKey,
      requestId: fixture.createRequestId,
      body: createPayload(),
    });

    // 成功路径无统一 envelope（HttpExceptionFilter 注释：成功负载原样返回），断言批次详情结构
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      workOrderId: String(fixture.workOrderId),
      batchNo: fixture.batchNo,
      plannedQuantity: '2.0000',
      status: 'pending',
      ownerId: String(fixture.ownerId),
    });
    expect(typeof first.body.id).toBe('string');

    const [[batch]] = await pool.query<(RowDataPacket & { planned_quantity: string })[]>(
      'SELECT planned_quantity FROM production_batches WHERE work_order_id=? AND batch_no=?',
      [fixture.workOrderId, fixture.batchNo],
    );
    expect(batch).toMatchObject({ planned_quantity: '2.0000' });

    const [[record]] = await pool.query<
      (RowDataPacket & { status: string; initial_request_id: string })[]
    >(
      'SELECT status,initial_request_id FROM http_idempotency_records WHERE scope=? AND idempotency_key=?',
      [SCOPE, fixture.createKey],
    );
    expect(record.status).toBe('completed');
    expect(record.initial_request_id).toBe(fixture.createRequestId);

    // 事务内成功审计由 CurrentIdempotentCommandContext 提供 requestId/actorId，与请求上下文一致
    const [[successAudit]] = await pool.query<
      (RowDataPacket & {
        module: string;
        result: string;
        target_type: string;
        log_type: string;
        user_id: number;
      })[]
    >('SELECT module,result,target_type,log_type,user_id FROM operation_logs WHERE request_id=?', [
      fixture.createRequestId,
    ]);
    expect(successAudit).toMatchObject({
      module: 'production',
      result: 'success',
      target_type: 'production_batch',
      log_type: 'business',
      user_id: fixture.actorId,
    });

    // 同键同内容重放：不重跑 handler，批次/记录/审计计数均不增加，响应与首次完全一致（冻结快照）
    const replay = await postBatch({
      key: fixture.createKey,
      requestId: fixture.replayRequestId,
      body: createPayload(),
    });
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);

    const [[batchCount]] = await pool.query<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) total FROM production_batches WHERE work_order_id=?',
      [fixture.workOrderId],
    );
    expect(Number(batchCount.total)).toBe(1);

    const [[recordCount]] = await pool.query<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) total FROM http_idempotency_records WHERE scope=? AND idempotency_key=?',
      [SCOPE, fixture.createKey],
    );
    expect(Number(recordCount.total)).toBe(1);

    const [[replayAuditCount]] = await pool.query<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) total FROM operation_logs WHERE request_id=?',
      [fixture.replayRequestId],
    );
    expect(Number(replayAuditCount.total)).toBe(0);
  });

  it('同键不同 body 返回 409 IDEMPOTENCY_CONFLICT，错误 envelope 形状完整且 AuditInterceptor 写入失败审计', async () => {
    const first = await postBatch({
      key: fixture.conflictKey,
      requestId: fixture.conflictCreateRequestId,
      body: createPayload(),
    });
    expect(first.status).toBe(201);

    const conflict = await postBatch({
      key: fixture.conflictKey,
      requestId: fixture.conflictRequestId,
      body: { ...createPayload(), plannedQuantity: 3 },
    });

    // HttpExceptionFilter 最终错误 envelope：status/code/message/requestId/timestamp/path
    expect(conflict.status).toBe(409);
    expect(conflict.body).toMatchObject({
      status: 409,
      code: 'IDEMPOTENCY_CONFLICT',
      message: 'The idempotency key was already used with a different request.',
      path: createBatchUrl,
    });
    expect(conflict.body.requestId).toBe(fixture.conflictRequestId);
    expect(conflict.headers['x-request-id']).toBe(fixture.conflictRequestId);
    expect(conflict.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // AuditInterceptor 捕获 ConcurrencyError 写 failed 审计，携带 HTTP 状态与错误码
    const [[failedAudit]] = await pool.query<
      (RowDataPacket & {
        module: string;
        result: string;
        user_id: number;
        http_status: number;
        error_code: string;
      })[]
    >(
      'SELECT module,result,user_id,http_status,error_code FROM operation_logs WHERE request_id=?',
      [fixture.conflictRequestId],
    );
    expect(failedAudit).toMatchObject({
      module: 'production',
      result: 'failed',
      user_id: fixture.actorId,
      http_status: 409,
      error_code: 'IDEMPOTENCY_CONFLICT',
    });
  });

  it('DTO Pipe：带合法键但 body 非法（缺少 plannedQuantity）返回 400 VALIDATION_ERROR', async () => {
    const response = await postBatch({
      key: fixture.validationKey,
      requestId: fixture.validationRequestId,
      body: { batchNo: fixture.batchNo },
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      path: createBatchUrl,
    });
    expect(String(response.body.message)).toContain('plannedQuantity');
    expect(response.body.requestId).toBe(fixture.validationRequestId);

    const [[recordCount]] = await pool.query<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) total FROM http_idempotency_records WHERE scope=? AND actor_id=?',
      [SCOPE, fixture.actorId],
    );
    expect(Number(recordCount.total)).toBe(0);
  });
});

/** 以真实鉴权管线使用的同一密钥/签发者/受众为真实存在的用户签发 access token。 */
const signAccessToken = async (userId: number, username: string): Promise<string> => {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ username, kind: 'access' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(String(userId))
    .setIssuer(requiredEnv('JWT_ISSUER'))
    .setAudience(requiredEnv('JWT_AUDIENCE'))
    .setIssuedAt()
    .setExpirationTime(now + 15 * 60)
    .sign(new TextEncoder().encode(requiredEnv('JWT_SECRET')));
};

interface Fixture {
  token: string;
  actorId: number;
  ownerId: number;
  roleId: number;
  categoryId: number;
  productId: number;
  workOrderId: number;
  batchNo: string;
  createKey: string;
  conflictKey: string;
  validationKey: string;
  noAuthRequestId: string;
  missingKeyRequestId: string;
  createRequestId: string;
  replayRequestId: string;
  conflictCreateRequestId: string;
  conflictRequestId: string;
  validationRequestId: string;
}

const createFixture = async (pool: Pool): Promise<Fixture> => {
  const token = `http-pipe-${process.pid}-${Math.floor(Math.random() * 1_000_000)}`;
  const actorId = await insert(
    pool,
    'INSERT INTO users (username,password_hash,display_name) VALUES (?,?,?)',
    [`${token}-actor`, 'hash', 'HTTP 管线测试操作者'],
  );
  const ownerId = await insert(
    pool,
    'INSERT INTO users (username,password_hash,display_name) VALUES (?,?,?)',
    [`${token}-owner`, 'hash', 'HTTP 管线测试负责人'],
  );
  // 真实鉴权要求用户经 roles -> role_permissions -> permissions 拥有端点权限；
  // `production:batches:create` 权限行由生产核心 migration（202607300001）作为代码绑定目录提供。
  const [[permission]] = await pool.query<(RowDataPacket & { id: number })[]>(
    "SELECT id FROM permissions WHERE code='production:batches:create' AND status=1 AND deleted_at IS NULL",
  );
  if (!permission)
    throw new Error(
      'Missing migration-managed permission production:batches:create; run migrations first',
    );
  const roleId = await insert(
    pool,
    'INSERT INTO roles (name,code,description,status) VALUES (?,?,?,1)',
    [`${token}-role`, `${token}-role`, 'HTTP 管线测试角色'],
  );
  await pool.execute('INSERT INTO user_roles (user_id,role_id) VALUES (?,?)', [actorId, roleId]);
  await pool.execute('INSERT INTO role_permissions (role_id,permission_id) VALUES (?,?)', [
    roleId,
    permission.id,
  ]);
  const categoryId = await insert(
    pool,
    'INSERT INTO product_categories (category_code,category_name,item_kind) VALUES (?,?,?)',
    [`${token}-cat`, 'HTTP 管线测试分类', 'finished_product'],
  );
  const productId = await insert(
    pool,
    'INSERT INTO products (item_code,product_name,category_id,unit,acquire_method) VALUES (?,?,?,?,?)',
    [`${token}-product`, 'HTTP 管线测试产品', categoryId, 'pcs', 'self_made'],
  );
  const workOrderId = await insert(
    pool,
    'INSERT INTO work_orders (work_order_no,product_id,product_code_snapshot,product_name_snapshot,unit_snapshot,planned_quantity,status) VALUES (?,?,?,?,?,?,?)',
    [
      `${token}-wo`,
      productId,
      `${token}-product`,
      'HTTP 管线测试产品',
      'pcs',
      '10.0000',
      'released',
    ],
  );
  const numericSuffix = `${process.pid}${Math.floor(Math.random() * 10_000)}`;
  return {
    token,
    actorId,
    ownerId,
    roleId,
    categoryId,
    productId,
    workOrderId,
    batchNo: `task_batch-${numericSuffix}`,
    createKey: `${token}-create-key`,
    conflictKey: `${token}-conflict-key`,
    validationKey: `${token}-validation-key`,
    noAuthRequestId: `${token}-req-noauth`,
    missingKeyRequestId: `${token}-req-nokey`,
    createRequestId: `${token}-req-create`,
    replayRequestId: `${token}-req-replay`,
    conflictCreateRequestId: `${token}-req-conflict-create`,
    conflictRequestId: `${token}-req-conflict`,
    validationRequestId: `${token}-req-validation`,
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
