import { loadWorkspaceEnv } from '../../../packages/config/src/index.js';
import {
  createPool,
  type Pool,
  type ResultSetHeader,
  type RowDataPacket,
} from '../../../apps/api/node_modules/mysql2/promise.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MysqlProductionExecutionRepository } from '../../../apps/api/src/modules/production/infrastructure/mysql-production-execution.repository.js';

loadWorkspaceEnv();
const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;

describeMysql('Production execution MySQL transactions', () => {
  let pool: Pool;
  let repository: MysqlProductionExecutionRepository;

  beforeAll(() => {
    pool = createPool({
      host: required('DB_HOST'),
      port: Number(required('DB_PORT')),
      user: required('DB_USER'),
      password: required('DB_PASSWORD'),
      database: required('DB_NAME'),
      charset: 'utf8mb4',
      timezone: '+08:00',
      connectionLimit: 6,
    });
    repository = new MysqlProductionExecutionRepository(pool);
  });

  afterAll(async () => pool?.end());

  it('assigns and starts the first step while starting the batch in one transaction', async () => {
    const fixture = await createFixture(pool, 'start');
    try {
      const assigned = await repository.assignStep(
        String(fixture.batchId),
        String(fixture.firstStepRecordId),
        String(fixture.workerId),
        0,
        context(fixture.actorId, `${fixture.token}-assign`),
      );
      expect(assigned).toMatchObject({ stepStatus: 'assigned', version: 1 });

      const started = await repository.startStep(
        String(fixture.batchId),
        String(fixture.firstStepRecordId),
        1,
        context(fixture.workerId, `${fixture.token}-start`),
      );
      expect(started.stepStatus).toBe('doing');
      expect(started.batchStatus).toBe('doing');
      expect(started.startedAt).not.toBeNull();

      const [[row]] = await pool.query<
        (RowDataPacket & { batch_started_at: Date | null; step_started_at: Date | null })[]
      >(
        `SELECT b.started_at batch_started_at,s.started_at step_started_at
         FROM production_batches b JOIN batch_step_records s ON s.production_batch_id=b.id
         WHERE b.id=? AND s.id=?`,
        [fixture.batchId, fixture.firstStepRecordId],
      );
      expect(row?.batch_started_at).not.toBeNull();
      expect(row?.step_started_at).not.toBeNull();
      expect(await auditCount(pool, `${fixture.token}-start`, 'production-step.start')).toBe(1);
    } finally {
      await cleanup(pool, fixture);
    }
  });

  it('rejects a non-assignee without changing state or writing success audit', async () => {
    const fixture = await createFixture(pool, 'actor');
    try {
      await repository.assignStep(
        String(fixture.batchId),
        String(fixture.firstStepRecordId),
        String(fixture.workerId),
        0,
        context(fixture.actorId, `${fixture.token}-assign`),
      );
      await expect(
        repository.startStep(
          String(fixture.batchId),
          String(fixture.firstStepRecordId),
          1,
          context(fixture.otherWorkerId, `${fixture.token}-wrong-worker`),
        ),
      ).rejects.toMatchObject({ code: 'NOT_STEP_ASSIGNEE' });
      const [[step]] = await pool.query<(RowDataPacket & { status: string })[]>(
        'SELECT status FROM batch_step_records WHERE id=?',
        [fixture.firstStepRecordId],
      );
      expect(step?.status).toBe('assigned');
      expect(await auditCount(pool, `${fixture.token}-wrong-worker`, 'production-step.start')).toBe(
        0,
      );
    } finally {
      await cleanup(pool, fixture);
    }
  });

  it('does not start a following step before upstream normal quantity is released', async () => {
    const fixture = await createFixture(pool, 'upstream');
    try {
      await repository.assignStep(
        String(fixture.batchId),
        String(fixture.firstStepRecordId),
        String(fixture.workerId),
        0,
        context(fixture.actorId, `${fixture.token}-assign-first`),
      );
      await repository.startStep(
        String(fixture.batchId),
        String(fixture.firstStepRecordId),
        1,
        context(fixture.workerId, `${fixture.token}-start-first`),
      );
      await repository.assignStep(
        String(fixture.batchId),
        String(fixture.secondStepRecordId),
        String(fixture.workerId),
        0,
        context(fixture.actorId, `${fixture.token}-assign-second`),
      );
      await expect(
        repository.startStep(
          String(fixture.batchId),
          String(fixture.secondStepRecordId),
          1,
          context(fixture.workerId, `${fixture.token}-start-second`),
        ),
      ).rejects.toMatchObject({ code: 'STEP_START_NOT_ALLOWED' });
    } finally {
      await cleanup(pool, fixture);
    }
  });

  it('serializes competing assignments and preserves one responsible employee', async () => {
    const fixture = await createFixture(pool, 'race');
    try {
      const results = await Promise.allSettled([
        repository.assignStep(
          String(fixture.batchId),
          String(fixture.firstStepRecordId),
          String(fixture.workerId),
          0,
          context(fixture.actorId, `${fixture.token}-race-a`),
        ),
        repository.assignStep(
          String(fixture.batchId),
          String(fixture.firstStepRecordId),
          String(fixture.otherWorkerId),
          0,
          context(fixture.actorId, `${fixture.token}-race-b`),
        ),
      ]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    } finally {
      await cleanup(pool, fixture);
    }
  });

  it('rolls back assignment when transactional success audit fails', async () => {
    const fixture = await createFixture(pool, 'audit-rollback');
    try {
      await expect(
        repository.assignStep(
          String(fixture.batchId),
          String(fixture.firstStepRecordId),
          String(fixture.workerId),
          0,
          context(fixture.actorId, 'x'.repeat(500)),
        ),
      ).rejects.toBeDefined();
      const [[step]] = await pool.query<
        (RowDataPacket & { status: string; responsible_user_id: number | null; version: number })[]
      >('SELECT status,responsible_user_id,version FROM batch_step_records WHERE id=?', [
        fixture.firstStepRecordId,
      ]);
      expect(step).toMatchObject({ status: 'pending', responsible_user_id: null, version: 0 });
    } finally {
      await cleanup(pool, fixture);
    }
  });
});

type Fixture = {
  token: string;
  actorId: number;
  workerId: number;
  otherWorkerId: number;
  categoryId: number;
  productId: number;
  processStepIds: [number, number];
  routeId: number;
  routeStepIds: [number, number];
  workOrderId: number;
  batchId: number;
  firstStepRecordId: number;
  secondStepRecordId: number;
};

const createFixture = async (pool: Pool, suffix: string): Promise<Fixture> => {
  const token = `pe-${suffix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const [[actor]] = await pool.query<(RowDataPacket & { id: number })[]>(
    'SELECT id FROM users ORDER BY id LIMIT 1',
  );
  if (!actor) throw new Error('seeded user required');
  const workerId = await insert(
    pool,
    'INSERT INTO users (username,password_hash,display_name) VALUES (?,?,?)',
    [`${token}-worker`, 'not-used-by-test', 'Execution worker'],
  );
  const otherWorkerId = await insert(
    pool,
    'INSERT INTO users (username,password_hash,display_name) VALUES (?,?,?)',
    [`${token}-other`, 'not-used-by-test', 'Other worker'],
  );
  const categoryId = await insert(
    pool,
    "INSERT INTO product_categories (category_code,category_name,item_kind) VALUES (?,?,'finished_product')",
    [`${token}-category`, 'Execution category'],
  );
  const productId = await insert(
    pool,
    "INSERT INTO products (item_code,product_name,category_id,unit,acquire_method) VALUES (?,?,?,'pcs','self_made')",
    [`${token}-product`, 'Execution product', categoryId],
  );
  const firstProcessStepId = await insert(
    pool,
    'INSERT INTO process_steps (step_code,step_name,status) VALUES (?,?,1)',
    [`${token}-step-1`, 'Execution step 1'],
  );
  const secondProcessStepId = await insert(
    pool,
    'INSERT INTO process_steps (step_code,step_name,status) VALUES (?,?,1)',
    [`${token}-step-2`, 'Execution step 2'],
  );
  const routeId = await insert(
    pool,
    "INSERT INTO process_routes (product_id,route_code,route_name,version_no,status) VALUES (?,?,?,'V1','enabled')",
    [productId, `${token}-route`, 'Execution route'],
  );
  const firstRouteStepId = await insert(
    pool,
    'INSERT INTO process_route_steps (route_id,process_step_id,step_order,step_code_snapshot,step_name_snapshot,need_record,need_inspection) VALUES (?,?,?,?,?,1,0)',
    [routeId, firstProcessStepId, 1, `${token}-step-1`, 'Execution step 1'],
  );
  const secondRouteStepId = await insert(
    pool,
    'INSERT INTO process_route_steps (route_id,process_step_id,step_order,step_code_snapshot,step_name_snapshot,need_record,need_inspection) VALUES (?,?,?,?,?,1,0)',
    [routeId, secondProcessStepId, 2, `${token}-step-2`, 'Execution step 2'],
  );
  const workOrderId = await insert(
    pool,
    "INSERT INTO work_orders (work_order_no,product_id,product_code_snapshot,product_name_snapshot,unit_snapshot,planned_quantity,status) VALUES (?,?,?,?,?,'10.0000','released')",
    [`${token}-wo`, productId, `${token}-product`, 'Execution product', 'pcs'],
  );
  const batchId = await insert(
    pool,
    "INSERT INTO production_batches (work_order_id,product_id,batch_no,route_id,planned_quantity,status) VALUES (?,?,?,?,'10.0000','material_outbound')",
    [workOrderId, productId, `${token}-batch`, routeId],
  );
  const firstStepRecordId = await insert(
    pool,
    'INSERT INTO batch_step_records (production_batch_id,route_step_id,step_order_snapshot,step_code_snapshot,step_name_snapshot,need_record_snapshot,need_inspection_snapshot,unit_snapshot,created_by,updated_by) VALUES (?,?,?,?,?,1,0,?,?,?)',
    [
      batchId,
      firstRouteStepId,
      1,
      `${token}-step-1`,
      'Execution step 1',
      'pcs',
      actor.id,
      actor.id,
    ],
  );
  const secondStepRecordId = await insert(
    pool,
    'INSERT INTO batch_step_records (production_batch_id,route_step_id,step_order_snapshot,step_code_snapshot,step_name_snapshot,need_record_snapshot,need_inspection_snapshot,unit_snapshot,created_by,updated_by) VALUES (?,?,?,?,?,1,0,?,?,?)',
    [
      batchId,
      secondRouteStepId,
      2,
      `${token}-step-2`,
      'Execution step 2',
      'pcs',
      actor.id,
      actor.id,
    ],
  );
  return {
    token,
    actorId: actor.id,
    workerId,
    otherWorkerId,
    categoryId,
    productId,
    processStepIds: [firstProcessStepId, secondProcessStepId],
    routeId,
    routeStepIds: [firstRouteStepId, secondRouteStepId],
    workOrderId,
    batchId,
    firstStepRecordId,
    secondStepRecordId,
  };
};

const cleanup = async (pool: Pool, fixture: Fixture): Promise<void> => {
  await pool.execute('DELETE FROM operation_logs WHERE request_id LIKE ?', [`${fixture.token}%`]);
  await pool.execute('DELETE FROM batch_step_records WHERE production_batch_id=?', [
    fixture.batchId,
  ]);
  await pool.execute('DELETE FROM production_batches WHERE id=?', [fixture.batchId]);
  await pool.execute('DELETE FROM work_orders WHERE id=?', [fixture.workOrderId]);
  await pool.execute('DELETE FROM process_route_steps WHERE route_id=?', [fixture.routeId]);
  await pool.execute('DELETE FROM process_routes WHERE id=?', [fixture.routeId]);
  await pool.execute('DELETE FROM process_steps WHERE id IN (?,?)', fixture.processStepIds);
  await pool.execute('DELETE FROM products WHERE id=?', [fixture.productId]);
  await pool.execute('DELETE FROM product_categories WHERE id=?', [fixture.categoryId]);
  await pool.execute('DELETE FROM users WHERE id IN (?,?)', [
    fixture.workerId,
    fixture.otherWorkerId,
  ]);
};

const insert = async (pool: Pool, sql: string, values: unknown[]): Promise<number> => {
  const [result] = await pool.execute<ResultSetHeader>(sql, values as never);
  return Number(result.insertId);
};

const context = (actorId: number, requestId: string) => ({
  actorId: String(actorId),
  requestId,
  ip: null,
  userAgent: null,
});

const auditCount = async (pool: Pool, requestId: string, action: string): Promise<number> => {
  const [[row]] = await pool.query<(RowDataPacket & { count: number })[]>(
    'SELECT COUNT(*) count FROM operation_logs WHERE request_id=? AND action=?',
    [requestId, action],
  );
  return Number(row?.count ?? 0);
};

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};
