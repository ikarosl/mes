import '../../../apps/api/node_modules/reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
// supertest has no usable declaration when imported through the API workspace path.
// @ts-expect-error supertest is runtime-only for this integration suite.
import request from '../../../apps/api/node_modules/supertest';
import { loadWorkspaceEnv } from '../../../packages/config/src/index.js';
import { APPROVAL_SCENE_CODES, PERMISSIONS } from '../../../packages/constants/src/index.js';
import type {
  ApprovalFlowDetail,
  ApprovalInstanceDetail,
  ApprovalInstanceStep,
} from '../../../packages/contracts/src/index.js';
import { AppModule } from '../../../apps/api/src/app.module.js';
import { requestContextMiddleware } from '../../../apps/api/src/common/http/request-context.middleware.js';
import { DATABASE_POOL } from '../../../apps/api/src/infrastructure/database/database.module.js';
import { createValidationPipe } from '../../../apps/api/src/presentation/http/validation.pipe.js';
import { ApprovalService } from '../../../apps/api/src/modules/approval/application/approval.service.js';
import { ApprovalSubjectHandlerRegistry } from '../../../apps/api/src/modules/approval/application/approval-subject-handler.registry.js';
import { ApprovalSubjectError } from '../../../apps/api/src/modules/approval/public.js';
import { MysqlApprovalFlowRepository } from '../../../apps/api/src/modules/approval/infrastructure/mysql-approval-flow.repository.js';
import { MysqlApprovalRepository } from '../../../apps/api/src/modules/approval/infrastructure/mysql-approval.repository.js';
import { IdentityDirectoryService } from '../../../apps/api/src/modules/identity/application/identity-directory.service.js';
import { MysqlRbacRepository } from '../../../apps/api/src/modules/identity/infrastructure/mysql-rbac.repository.js';
import { ProductBomApprovalHandler } from '../../../apps/api/src/modules/product/application/product-bom-approval.handler.js';
import { MysqlProductCatalogRepository } from '../../../apps/api/src/modules/product/infrastructure/mysql-product-catalog.repository.js';
import type { CommandContext } from '../../../apps/api/src/common/audit/audit.types.js';

loadWorkspaceEnv();

const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;
const SCENE_CODE = APPROVAL_SCENE_CODES.bom;
let contextFixture: Fixture | undefined;

/**
 * Approval BOM 的真实 MySQL 闭环：流程配置、选版、Product 送审冻结、ANY 多级审批、
 * 历史查询、重分派、并发竞争和失败事务都走真实 Repository/Service。只有权限入口的
 * 两个边界用例启动真实 Nest 应用，以验证 AuthGuard 和 ValidationPipe 的实际行为。
 */
describeMysql('Approval BOM workflow (real MySQL)', () => {
  let pool: Pool;
  let app: INestApplication | undefined;
  let fixture: Fixture;
  let identity: IdentityDirectoryService;
  let handlers: ApprovalSubjectHandlerRegistry;
  let products: MysqlProductCatalogRepository;
  let flows: MysqlApprovalFlowRepository;
  let approvals: ApprovalService;
  let bomHandler: ProductBomApprovalHandler;

  beforeAll(async () => {
    const database = requiredEnv('DB_NAME');
    if (!/(?:_test|_ci)$/.test(database)) {
      throw new Error('approval integration tests require a dedicated *_test or *_ci database');
    }
    pool = createPool({
      host: requiredEnv('DB_HOST'),
      port: Number(requiredEnv('DB_PORT')),
      user: requiredEnv('DB_USER'),
      password: requiredEnv('DB_PASSWORD'),
      database,
      charset: 'utf8mb4',
      timezone: '+08:00',
      connectionLimit: 8,
    });
    fixture = await createFixture(pool);
    contextFixture = fixture;
    await removeEmptyPreviousFlow(pool);

    identity = new IdentityDirectoryService(new MysqlRbacRepository(pool));
    handlers = new ApprovalSubjectHandlerRegistry();
    products = new MysqlProductCatalogRepository(pool);
    bomHandler = new ProductBomApprovalHandler(products, handlers);
    bomHandler.onModuleInit();
    flows = new MysqlApprovalFlowRepository(pool, identity, handlers);
    approvals = new ApprovalService(
      new MysqlApprovalRepository(pool, identity, handlers, flows),
      flows,
    );
    fixture.publishedFlow = await configureFlow(flows, fixture);
  });

  afterAll(async () => {
    const appPool = app?.get(DATABASE_POOL) as Pool | undefined;
    await app?.close();
    await appPool?.end();
    if (pool && fixture) await cleanupFixture(pool, fixture);
    await pool?.end();
  });

  // The reassign test intentionally removes role membership. Restore the fixture's baseline before
  // every later case so one test's eligibility mutation cannot change another case's candidates.
  beforeEach(async () => {
    await pool.execute('INSERT IGNORE INTO user_roles (user_id,role_id) VALUES (?,?),(?,?),(?,?)', [
      fixture.actorId,
      fixture.role1Id,
      fixture.actorId,
      fixture.role2Id,
      fixture.peerId,
      fixture.role1Id,
    ]);
  });

  it('locks the published flow version while an edited draft remains isolated and stale writes fail', async () => {
    const published = fixture.publishedFlow.published;
    const draft = fixture.publishedFlow.draft;
    expect(published).toMatchObject({ status: 'published', versionNo: 1 });
    expect(draft).toMatchObject({ status: 'draft', versionNo: 2, version: 1 });
    expect(published?.steps[0]).toMatchObject({ name: '业务确认' });
    expect(published?.steps[0]?.nodeCode).toBeTruthy();
    expect(draft?.steps[0]).toMatchObject({
      name: '业务确认（草稿）',
      nodeCode: published?.steps[0]?.nodeCode,
    });

    await expect(
      flows.saveFlowDraft(
        SCENE_CODE,
        {
          name: '过期草稿',
          draftId: draft!.id,
          version: 0,
          steps: [
            {
              nodeCode: published!.steps[0]!.nodeCode,
              name: '错误覆盖',
              roleId: String(fixture.role1Id),
            },
          ],
        },
        context(fixture.actorId, 'flow-stale-save'),
      ),
    ).rejects.toMatchObject({ code: 'CONCURRENT_MODIFICATION' });
    await expect(
      flows.publishFlow(
        SCENE_CODE,
        { draftId: draft!.id, version: 0 },
        context(fixture.actorId, 'flow-stale-publish'),
      ),
    ).rejects.toMatchObject({ code: 'CONCURRENT_MODIFICATION' });

    const current = await flows.getFlow(SCENE_CODE);
    expect(current.published?.id).toBe(published?.id);
    expect(current.published?.steps[0]?.name).toBe('业务确认');
    expect(current.draft?.steps[0]?.name).toBe('业务确认（草稿）');
  });

  it('submits a v2 BOM snapshot, blocks edits, allows self review across independent ANY levels, and permanently locks after final approval', async () => {
    const product = await createProduct(pool, fixture, 'approve');
    const submitted = await approvals.submit(
      { sceneCode: SCENE_CODE, subjectId: String(product.productId), expectedVersion: 0 },
      context(fixture.actorId, 'approve-submit'),
    );

    expect(submitted).toMatchObject({
      status: 'pending',
      subjectId: String(product.productId),
      flowVersionNo: fixture.publishedFlow.published!.versionNo,
      snapshotSchemaVersion: 2,
      version: 0,
      canWithdraw: true,
    });
    expect(submitted.subjectSnapshot.materials[0]).not.toHaveProperty('isKeyMaterial');
    expect(submitted.subjectSnapshot.materials[0]).not.toHaveProperty('needBatchRecord');
    expect(submitted.materialNames[String(product.materialId)]).toBe(product.materialName);
    expect(submitted.steps[0]).toMatchObject({ status: 'pending', assignmentRound: 1 });
    expect(submitted.steps[1]).toMatchObject({ status: 'waiting', assignmentRound: 0 });
    expect(submitted.steps[0]!.tasks.map((task) => task.assigneeId)).toEqual(
      expect.arrayContaining([String(fixture.actorId), String(fixture.peerId)]),
    );

    await expect(
      products.replaceMaterials(
        String(product.productId),
        {
          version: 1,
          items: [
            {
              materialId: String(product.materialId),
              quantityPerUnit: 2,
              unit: 'kg',
            },
          ],
        },
        context(fixture.actorId, 'approve-pending-edit'),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      products.replaceMaterials(
        String(product.productId),
        {
          version: 1,
          items: [
            {
              materialId: String(product.materialId),
              quantityPerUnit: 2,
              unit: 'kg',
            },
          ],
        },
        context(fixture.actorId, 'approve-pending-edit-repeat'),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const actorFirstTask = taskFor(submitted.steps[0], fixture.actorId);
    const peerFirstTask = taskFor(submitted.steps[0], fixture.peerId);
    const firstApproved = await approvals.approve(
      submitted.id,
      { version: submitted.version, taskId: actorFirstTask.id },
      context(fixture.actorId, 'approve-level-1'),
    );
    expect(firstApproved.status).toBe('pending');
    expect(firstApproved.steps[0]).toMatchObject({ status: 'approved', assignmentRound: 1 });
    expect(firstApproved.steps[1]).toMatchObject({ status: 'pending', assignmentRound: 1 });
    expect(firstApproved.steps[1]!.tasks).toHaveLength(1);
    expect(firstApproved.steps[1]!.tasks[0]!.assigneeId).toBe(String(fixture.actorId));

    // The losing first-level task is closed by the same ANY decision and cannot be reused.
    await expect(
      approvals.approve(
        submitted.id,
        { version: firstApproved.version, taskId: peerFirstTask.id },
        context(fixture.peerId, 'approve-peer-stale'),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const secondTask = firstApproved.steps[1]!.tasks[0]!;
    const finalApproved = await approvals.approve(
      submitted.id,
      { version: firstApproved.version, taskId: secondTask.id },
      context(fixture.actorId, 'approve-level-2'),
    );
    expect(finalApproved.status).toBe('approved');
    expect(finalApproved.steps.map((step) => step.status)).toEqual(['approved', 'approved']);
    expect(
      finalApproved.steps[0]!.tasks.find((task) => task.id === peerFirstTask.id),
    ).toMatchObject({ status: 'closed', closeReason: 'peer_decided', assignmentRound: 1 });
    expect(finalApproved.actions.map((action) => action.actionType)).toEqual([
      'submitted',
      'approved',
      'approved',
    ]);
    expect(finalApproved.actions.map((action) => action.actionNo)).toEqual([1, 2, 3]);

    const [[productRow]] = await pool.query<
      (RowDataPacket & {
        bom_status: string;
        bom_approval_instance_id: number;
        bom_locked_at: Date | null;
        bom_locked_by: number | null;
        version: number;
      })[]
    >(
      'SELECT bom_status,bom_approval_instance_id,bom_locked_at,bom_locked_by,version FROM products WHERE id=?',
      [product.productId],
    );
    expect(productRow).toMatchObject({
      bom_status: 'approved',
      bom_approval_instance_id: Number(submitted.id),
      bom_locked_by: fixture.actorId,
      version: 2,
    });
    expect(productRow.bom_locked_at).not.toBeNull();

    await expect(
      products.replaceMaterials(
        String(product.productId),
        {
          version: 2,
          items: [
            {
              materialId: String(product.materialId),
              quantityPerUnit: 2,
              unit: 'kg',
            },
          ],
        },
        context(fixture.actorId, 'approve-locked-edit'),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    await pool.execute('UPDATE materials SET material_name=? WHERE id=?', [
      `${product.materialName}-renamed`,
      product.materialId,
    ]);
    const historical = await approvals.getInstance(finalApproved.id, String(fixture.actorId), true);
    expect(historical.subjectSnapshot.materials[0]!.itemCode).toBe(product.materialCode);
    expect(historical.materialNames[String(product.materialId)]).toBe(
      `${product.materialName}-renamed`,
    );
  });

  it('rolls back Product binding, the approval graph, and transactional audit when bind fails after its write', async () => {
    const product = await createProduct(pool, fixture, 'bind-rollback');
    const originalBind = bomHandler.bindApproval.bind(bomHandler);
    let bindReached = false;
    bomHandler.bindApproval = async (
      subjectId: string,
      instanceId: string,
      expectedVersion: number,
      audit: CommandContext,
    ) => {
      await originalBind(subjectId, instanceId, expectedVersion, audit);
      bindReached = true;
      throw new ApprovalSubjectError('CONFLICT', '测试注入：绑定完成后失败');
    };
    try {
      await expect(
        approvals.submit(
          { sceneCode: SCENE_CODE, subjectId: String(product.productId), expectedVersion: 0 },
          context(fixture.actorId, 'bind-rollback-submit'),
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    } finally {
      bomHandler.bindApproval = originalBind;
    }
    expect(bindReached).toBe(true);

    expect(await productState(pool, product.productId)).toMatchObject({
      bom_status: 'draft',
      bom_approval_instance_id: null,
      bom_locked_at: null,
      bom_locked_by: null,
      version: 0,
    });
    const [[instanceCount]] = await pool.query<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) total FROM approval_instances WHERE scene_code=? AND subject_type=? AND subject_id=?',
      [SCENE_CODE, 'product', product.productId],
    );
    const [[stepCount]] = await pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM approval_instance_steps s
       JOIN approval_instances i ON i.id=s.instance_id
       WHERE i.scene_code=? AND i.subject_type=? AND i.subject_id=?`,
      [SCENE_CODE, 'product', product.productId],
    );
    const [[taskCount]] = await pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM approval_tasks t
       JOIN approval_instance_steps s ON s.id=t.instance_step_id
       JOIN approval_instances i ON i.id=s.instance_id
       WHERE i.scene_code=? AND i.subject_type=? AND i.subject_id=?`,
      [SCENE_CODE, 'product', product.productId],
    );
    const [[actionCount]] = await pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM approval_actions a
       JOIN approval_instances i ON i.id=a.instance_id
       WHERE i.scene_code=? AND i.subject_type=? AND i.subject_id=?`,
      [SCENE_CODE, 'product', product.productId],
    );
    const [[auditCount]] = await pool.query<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) total FROM operation_logs WHERE request_id=?',
      [`${fixture.token}-bind-rollback-submit`],
    );
    expect(Number(instanceCount.total)).toBe(0);
    expect(Number(stepCount.total)).toBe(0);
    expect(Number(taskCount.total)).toBe(0);
    expect(Number(actionCount.total)).toBe(0);
    expect(Number(auditCount.total)).toBe(0);
  });

  it('rejects and withdraws independently restore editable draft state while history remains visible in all and mine scopes', async () => {
    const rejectedProduct = await createProduct(pool, fixture, 'reject');
    const rejected = await approvals.submit(
      { sceneCode: SCENE_CODE, subjectId: String(rejectedProduct.productId), expectedVersion: 0 },
      context(fixture.actorId, 'reject-submit'),
    );
    const rejectTask = taskFor(rejected.steps[0], fixture.peerId);
    const rejectedDetail = await approvals.reject(
      rejected.id,
      { version: rejected.version, taskId: rejectTask.id, comment: '请补充工艺依据' },
      context(fixture.peerId, 'reject-decision'),
    );
    expect(rejectedDetail.status).toBe('rejected');
    expect(rejectedDetail.actions.at(-1)).toMatchObject({
      actionType: 'rejected',
      comment: '请补充工艺依据',
    });
    expect(rejectedDetail.subjectSnapshot.productId).toBe(String(rejectedProduct.productId));

    const rejectedRow = await productState(pool, rejectedProduct.productId);
    expect(rejectedRow).toMatchObject({
      bom_status: 'draft',
      bom_approval_instance_id: null,
      version: 2,
    });
    await expect(
      products.replaceMaterials(
        String(rejectedProduct.productId),
        {
          version: 2,
          items: [
            {
              materialId: String(rejectedProduct.materialId),
              quantityPerUnit: 3,
              unit: 'kg',
            },
          ],
        },
        context(fixture.actorId, 'reject-edit-after-end'),
      ),
    ).resolves.toBeUndefined();

    const withdrawnProduct = await createProduct(pool, fixture, 'withdraw');
    const submitted = await approvals.submit(
      { sceneCode: SCENE_CODE, subjectId: String(withdrawnProduct.productId), expectedVersion: 0 },
      context(fixture.actorId, 'withdraw-submit'),
    );
    const withdrawn = await approvals.withdraw(
      submitted.id,
      { version: submitted.version, comment: '需求调整，撤回修改' },
      context(fixture.actorId, 'withdraw-decision'),
    );
    expect(withdrawn.status).toBe('withdrawn');
    expect(
      withdrawn.steps[0]!.tasks.every((task) => task.closeReason === 'instance_withdrawn'),
    ).toBe(true);
    expect(withdrawn.actions.at(-1)).toMatchObject({
      actionType: 'withdrawn',
      comment: '需求调整，撤回修改',
    });
    expect(await productState(pool, withdrawnProduct.productId)).toMatchObject({
      bom_status: 'draft',
      bom_approval_instance_id: null,
      version: 2,
    });

    const mine = await approvals.listInstances(
      { scope: 'mine', subjectId: String(rejectedProduct.productId), page: 1, pageSize: 10 },
      fixture.actorId.toString(),
      false,
    );
    expect(mine.items.map((item) => item.id)).toContain(rejected.id);
    const peerAll = await approvals.listInstances(
      { scope: 'all', subjectId: String(rejectedProduct.productId), page: 1, pageSize: 10 },
      fixture.peerId.toString(),
      false,
    );
    expect(peerAll.items.map((item) => item.id)).toContain(rejected.id);
    const peerTodo = await approvals.listInstances(
      { scope: 'todo', subjectId: String(rejectedProduct.productId), page: 1, pageSize: 10 },
      fixture.peerId.toString(),
      false,
    );
    expect(peerTodo.total).toBe(0);
  });

  it('invalidates old assignment rounds, blocks when no eligible user exists, and recreates only the current round', async () => {
    const product = await createProduct(pool, fixture, 'reassign');
    const submitted = await approvals.submit(
      { sceneCode: SCENE_CODE, subjectId: String(product.productId), expectedVersion: 0 },
      context(fixture.actorId, 'reassign-submit'),
    );
    const oldTask = taskFor(submitted.steps[0], fixture.actorId);
    await pool.execute('DELETE FROM user_roles WHERE role_id=? AND user_id IN (?,?)', [
      fixture.role1Id,
      fixture.actorId,
      fixture.peerId,
    ]);

    const noTodo = await approvals.listInstances(
      { scope: 'todo', subjectId: String(product.productId), page: 1, pageSize: 10 },
      String(fixture.actorId),
      false,
    );
    expect(noTodo.total).toBe(0);

    const blocked = await approvals.reassign(
      submitted.id,
      { version: submitted.version, comment: '原审批组已撤销，请重新计算候选人' },
      context(fixture.actorId, 'reassign-empty'),
    );
    expect(blocked.steps[0]).toMatchObject({
      status: 'blocked',
      blockedReason: 'no_eligible_assignee',
      assignmentRound: 2,
    });
    expect(blocked.steps[0]!.tasks.find((task) => task.id === oldTask.id)).toMatchObject({
      status: 'closed',
      closeReason: 'reassigned',
      assignmentRound: 1,
    });

    await pool.execute('INSERT INTO user_roles (user_id,role_id) VALUES (?,?)', [
      fixture.actorId,
      fixture.role1Id,
    ]);
    const reassigned = await approvals.reassign(
      submitted.id,
      { version: blocked.version, comment: '审批人已恢复，生成新一轮待办' },
      context(fixture.actorId, 'reassign-restored'),
    );
    expect(reassigned.steps[0]).toMatchObject({ status: 'pending', assignmentRound: 3 });
    expect(reassigned.steps[0]!.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ assigneeId: String(fixture.actorId), assignmentRound: 3 }),
      ]),
    );
    expect(
      reassigned.steps[0]!.tasks.filter(
        (task) => task.assignmentRound === 1 && task.status === 'closed',
      ),
    ).toHaveLength(2);
    const newTask = reassigned.steps[0]!.tasks.find(
      (task) => task.assignmentRound === 3 && task.status === 'pending',
    );
    expect(newTask).toBeDefined();
    await expect(
      approvals.approve(
        submitted.id,
        { version: reassigned.version, taskId: oldTask.id },
        context(fixture.actorId, 'reassign-old-round'),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const first = await approvals.approve(
      submitted.id,
      {
        version: reassigned.version,
        taskId: newTask!.id,
      },
      context(fixture.actorId, 'reassign-approve-first'),
    );
    const second = await approvals.approve(
      submitted.id,
      { version: first.version, taskId: first.steps[1]!.tasks[0]!.id },
      context(fixture.actorId, 'reassign-approve-second'),
    );
    expect(second.status).toBe('approved');
  });

  it('serializes competing ANY decisions and leaves exactly one winner before the next level', async () => {
    const product = await createProduct(pool, fixture, 'race');
    const submitted = await approvals.submit(
      { sceneCode: SCENE_CODE, subjectId: String(product.productId), expectedVersion: 0 },
      context(fixture.actorId, 'race-submit'),
    );
    const actorTask = taskFor(submitted.steps[0], fixture.actorId);
    const peerTask = taskFor(submitted.steps[0], fixture.peerId);
    const outcomes = await Promise.allSettled([
      approvals.approve(
        submitted.id,
        { version: submitted.version, taskId: actorTask.id },
        context(fixture.actorId, 'race-actor'),
      ),
      approvals.approve(
        submitted.id,
        { version: submitted.version, taskId: peerTask.id },
        context(fixture.peerId, 'race-peer'),
      ),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
    expect(rejected?.status).toBe('rejected');
    expect((rejected as PromiseRejectedResult).reason).toMatchObject({
      code: 'CONCURRENT_MODIFICATION',
    });

    const current = await approvals.getInstance(submitted.id, String(fixture.actorId), true);
    expect(current.steps[0]!.tasks.filter((task) => task.status === 'approved')).toHaveLength(1);
    expect(
      current.steps[0]!.tasks.filter((task) => task.closeReason === 'peer_decided'),
    ).toHaveLength(1);
    expect(current.steps[1]!.status).toBe('pending');
    const final = await approvals.approve(
      current.id,
      { version: current.version, taskId: current.steps[1]!.tasks[0]!.id },
      context(fixture.actorId, 'race-final'),
    );
    expect(final.status).toBe('approved');
  });

  it('rolls back the final business effect and approval evidence together when the current material becomes invalid', async () => {
    const product = await createProduct(pool, fixture, 'rollback');
    const submitted = await approvals.submit(
      { sceneCode: SCENE_CODE, subjectId: String(product.productId), expectedVersion: 0 },
      context(fixture.actorId, 'rollback-submit'),
    );
    const first = await approvals.approve(
      submitted.id,
      { version: submitted.version, taskId: taskFor(submitted.steps[0], fixture.actorId).id },
      context(fixture.actorId, 'rollback-first'),
    );
    const finalTask = first.steps[1]!.tasks[0]!;
    await pool.execute('UPDATE materials SET status=0 WHERE id=?', [product.materialId]);
    await expect(
      approvals.approve(
        submitted.id,
        { version: first.version, taskId: finalTask.id },
        context(fixture.actorId, 'rollback-final-fails'),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });

    const afterFailure = await approvals.getInstance(submitted.id, String(fixture.actorId), true);
    expect(afterFailure.status).toBe('pending');
    expect(afterFailure.version).toBe(first.version);
    expect(afterFailure.steps[1]).toMatchObject({ status: 'pending', assignmentRound: 1 });
    expect(afterFailure.steps[1]!.tasks[0]).toMatchObject({ status: 'pending' });
    expect(afterFailure.actions.map((action) => action.actionType)).toEqual([
      'submitted',
      'approved',
    ]);
    expect(await productState(pool, product.productId)).toMatchObject({
      bom_status: 'pending_approval',
      version: 1,
    });

    await pool.execute('UPDATE materials SET status=1 WHERE id=?', [product.materialId]);
    const approved = await approvals.approve(
      submitted.id,
      { version: first.version, taskId: finalTask.id },
      context(fixture.actorId, 'rollback-final-retry'),
    );
    expect(approved.status).toBe('approved');
  });

  it('serializes withdrawal against final approval so one terminal transition and one consistent Product state win', async () => {
    const product = await createProduct(pool, fixture, 'withdraw-race');
    const submitted = await approvals.submit(
      { sceneCode: SCENE_CODE, subjectId: String(product.productId), expectedVersion: 0 },
      context(fixture.actorId, 'withdraw-race-submit'),
    );
    const first = await approvals.approve(
      submitted.id,
      { version: submitted.version, taskId: taskFor(submitted.steps[0], fixture.actorId).id },
      context(fixture.actorId, 'withdraw-race-first'),
    );
    const finalTask = first.steps[1]!.tasks[0]!;
    const outcomes = await Promise.allSettled([
      approvals.withdraw(
        submitted.id,
        { version: first.version, comment: '并发撤回竞速' },
        context(fixture.actorId, 'withdraw-race-withdraw'),
      ),
      approvals.approve(
        submitted.id,
        { version: first.version, taskId: finalTask.id },
        context(fixture.actorId, 'withdraw-race-approve'),
      ),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const winner = outcomes.find((outcome) => outcome.status === 'fulfilled') as
      PromiseFulfilledResult<ApprovalInstanceDetail> | undefined;
    expect(winner).toBeDefined();
    const loser = outcomes.find((outcome) => outcome.status === 'rejected') as
      PromiseRejectedResult | undefined;
    expect(loser?.reason).toMatchObject({
      code: expect.stringMatching(/^(CONFLICT|CONCURRENT_MODIFICATION)$/),
    });
    const winnerDetail = winner!.value;
    expect(['approved', 'withdrawn']).toContain(winnerDetail.status);
    const terminalActions = winnerDetail.actions.filter(
      (action) =>
        action.actionType === 'withdrawn' ||
        (action.actionType === 'approved' && action.stepId === winnerDetail.steps[1]?.id),
    );
    expect(terminalActions).toHaveLength(1);

    const state = await productState(pool, product.productId);
    if (winnerDetail.status === 'approved') {
      expect(state).toMatchObject({
        bom_status: 'approved',
        bom_approval_instance_id: Number(submitted.id),
        bom_locked_by: fixture.actorId,
        version: 2,
      });
      expect(state?.bom_locked_at).not.toBeNull();
    } else {
      expect(state).toMatchObject({
        bom_status: 'draft',
        bom_approval_instance_id: null,
        bom_locked_at: null,
        bom_locked_by: null,
        version: 2,
      });
    }
    const [[terminalCount]] = await pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM approval_actions
       WHERE instance_id=? AND (action_type='withdrawn' OR (action_type='approved' AND instance_step_id=?))`,
      [submitted.id, winnerDetail.steps[1]?.id],
    );
    expect(Number(terminalCount.total)).toBe(1);
  });

  it('enforces real HTTP permissions and rejects unknown DTO fields before touching the flow', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.use(requestContextMiddleware);
    app.useGlobalPipes(createValidationPipe());
    await app.init();

    const forbidden = await request(app.getHttpServer())
      .get('/api/approval/scenes')
      .set('Authorization', `Bearer ${await signAccessToken(fixture.outsiderId, fixture.token)}`)
      .set('X-Request-Id', randomUUID());
    expect(forbidden.status).toBe(403);

    const decisionForbidden = await request(app.getHttpServer())
      .post('/api/approval/instances/999999/approve')
      .set('Authorization', `Bearer ${await signAccessToken(fixture.outsiderId, fixture.token)}`)
      .set('X-Request-Id', randomUUID())
      .send({ version: 0, taskId: '1' });
    expect(decisionForbidden.status).toBe(403);

    const httpProduct = await createProduct(pool, fixture, 'http-dto');
    const missingBomVersion = await request(app.getHttpServer())
      .put(`/api/product/products/${httpProduct.productId}/materials`)
      .set('Authorization', `Bearer ${await signAccessToken(fixture.actorId, fixture.token)}`)
      .set('X-Request-Id', randomUUID())
      .send({
        items: [{ materialId: String(httpProduct.materialId), quantityPerUnit: 1, unit: 'kg' }],
      });
    expect(missingBomVersion.status).toBe(400);
    expect(missingBomVersion.body).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    expect(String(missingBomVersion.body.message)).toContain('version');

    const oldBomField = await request(app.getHttpServer())
      .put(`/api/product/products/${httpProduct.productId}/materials`)
      .set('Authorization', `Bearer ${await signAccessToken(fixture.actorId, fixture.token)}`)
      .set('X-Request-Id', randomUUID())
      .send({
        version: 0,
        items: [
          {
            materialId: String(httpProduct.materialId),
            quantityPerUnit: 1,
            unit: 'kg',
            isKeyMaterial: true,
          },
        ],
      });
    expect(oldBomField.status).toBe(400);
    expect(oldBomField.body).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    expect(String(oldBomField.body.message)).toContain('isKeyMaterial');

    const before = await flows.getFlow(SCENE_CODE);
    const unknownField = await request(app.getHttpServer())
      .put(`/api/approval/scenes/${SCENE_CODE}/flow/draft`)
      .set('Authorization', `Bearer ${await signAccessToken(fixture.actorId, fixture.token)}`)
      .set('X-Request-Id', randomUUID())
      .send({
        name: '未知字段拒绝',
        draftId: null,
        version: null,
        steps: [
          {
            nodeCode: before.published!.steps[0]!.nodeCode,
            name: '业务确认',
            roleId: String(fixture.role1Id),
          },
          {
            nodeCode: before.published!.steps[1]!.nodeCode,
            name: '技术确认',
            roleId: String(fixture.role2Id),
          },
        ],
        unexpected: true,
      });
    expect(unknownField.status).toBe(400);
    expect(unknownField.body).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    expect(String(unknownField.body.message)).toContain('unexpected');
    const after = await flows.getFlow(SCENE_CODE);
    expect(after).toEqual(before);
  });
});

interface Fixture {
  token: string;
  actorId: number;
  peerId: number;
  outsiderId: number;
  role1Id: number;
  role2Id: number;
  categoryId: number;
  materialCategoryId: number;
  productIds: number[];
  publishedFlow: ApprovalFlowDetail;
}

interface ProductFixture {
  productId: number;
  materialId: number;
  materialCode: string;
  itemCode: string;
  materialName: string;
}

const createFixture = async (pool: Pool): Promise<Fixture> => {
  // Keep generated natural keys below the schema's 64 character code limit.
  const token = `appr-${process.pid}-${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const actorId = await insert(
    pool,
    'INSERT INTO users (username,password_hash,display_name) VALUES (?,?,?)',
    [`${token}-actor`, 'integration-test-hash', '审批集成测试申请人'],
  );
  const peerId = await insert(
    pool,
    'INSERT INTO users (username,password_hash,display_name) VALUES (?,?,?)',
    [`${token}-peer`, 'integration-test-hash', '审批集成测试同级审批人'],
  );
  const outsiderId = await insert(
    pool,
    'INSERT INTO users (username,password_hash,display_name) VALUES (?,?,?)',
    [`${token}-outsider`, 'integration-test-hash', '审批集成测试无权限用户'],
  );
  const role1Id = await insert(
    pool,
    'INSERT INTO roles (name,code,description,status) VALUES (?,?,?,1)',
    ['审批集成一级', `${token}-role-1`, '审批集成测试一级角色'],
  );
  const role2Id = await insert(
    pool,
    'INSERT INTO roles (name,code,description,status) VALUES (?,?,?,1)',
    ['审批集成二级', `${token}-role-2`, '审批集成测试二级角色'],
  );
  const permissionCodes = [
    PERMISSIONS.approval.configure,
    PERMISSIONS.approval.decide,
    PERMISSIONS.approval.reassign,
    PERMISSIONS.approval.view,
    PERMISSIONS.product.products.manageBom,
  ];
  const [permissionRows] = await pool.query<(RowDataPacket & { id: number; code: string })[]>(
    'SELECT id,code FROM permissions WHERE code IN (?) AND status=1 AND deleted_at IS NULL',
    [permissionCodes],
  );
  const permissionIds = new Map(permissionRows.map((row) => [row.code, Number(row.id)]));
  for (const code of permissionCodes) {
    const permissionId = permissionIds.get(code);
    if (!permissionId) throw new Error(`Missing permission ${code}; run migrations first`);
    await pool.execute('INSERT INTO role_permissions (role_id,permission_id) VALUES (?,?)', [
      role1Id,
      permissionId,
    ]);
    await pool.execute('INSERT INTO role_permissions (role_id,permission_id) VALUES (?,?)', [
      role2Id,
      permissionId,
    ]);
  }
  await pool.execute('INSERT INTO user_roles (user_id,role_id) VALUES (?,?),(?,?),(?,?)', [
    actorId,
    role1Id,
    actorId,
    role2Id,
    peerId,
    role1Id,
  ]);
  const categoryId = await insert(
    pool,
    'INSERT INTO product_categories (category_code,category_name,item_kind,created_by,updated_by) VALUES (?,?,?, ?,?)',
    [`${token}-finished-category`, '审批集成成品分类', 'finished_product', actorId, actorId],
  );
  const materialCategoryId = await insert(
    pool,
    'INSERT INTO product_categories (category_code,category_name,item_kind,created_by,updated_by) VALUES (?,?,?, ?,?)',
    [`${token}-material-category`, '审批集成物料分类', 'material', actorId, actorId],
  );
  return {
    token,
    actorId,
    peerId,
    outsiderId,
    role1Id,
    role2Id,
    categoryId,
    materialCategoryId,
    productIds: [],
    publishedFlow: { sceneCode: SCENE_CODE, name: '', published: null, draft: null },
  };
};

const configureFlow = async (
  flowRepository: MysqlApprovalFlowRepository,
  current: Fixture,
): Promise<ApprovalFlowDetail> => {
  const draft = await flowRepository.saveFlowDraft(
    SCENE_CODE,
    {
      name: 'BOM 两级审批',
      draftId: null,
      version: null,
      steps: [
        { name: '业务确认', roleId: String(current.role1Id) },
        { name: '技术确认', roleId: String(current.role2Id) },
      ],
    },
    context(current.actorId, 'flow-create'),
  );
  expect(draft.draft).toMatchObject({ version: 1, versionNo: 1, status: 'draft' });
  const published = await flowRepository.publishFlow(
    SCENE_CODE,
    { draftId: draft.draft!.id, version: draft.draft!.version },
    context(current.actorId, 'flow-publish'),
  );
  return flowRepository
    .saveFlowDraft(
      SCENE_CODE,
      {
        name: 'BOM 两级审批（编辑中）',
        draftId: null,
        version: null,
        steps: [
          {
            nodeCode: published.published!.steps[0]!.nodeCode,
            name: '业务确认（草稿）',
            roleId: String(current.role1Id),
          },
          {
            nodeCode: published.published!.steps[1]!.nodeCode,
            name: '技术确认（草稿）',
            roleId: String(current.role2Id),
          },
        ],
      },
      context(current.actorId, 'flow-new-draft'),
    )
    .then((edited) => {
      expect(published.published?.versionNo).toBe(1);
      return edited;
    });
};

const createProduct = async (
  pool: Pool,
  current: Fixture,
  suffix: string,
): Promise<ProductFixture> => {
  const productCode = `${current.token}-${suffix}-product`;
  const itemCode = productCode.toUpperCase();
  const materialCode = `${current.token}-${suffix}-material`;
  const materialName = `审批集成物料-${suffix}`;
  const productId = await insert(
    pool,
    'INSERT INTO products (item_code,product_name,category_id,unit,acquire_method,spec_values,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?)',
    [
      itemCode,
      `审批集成产品-${suffix}`,
      current.categoryId,
      'pcs',
      'self_made',
      '[]',
      current.actorId,
      current.actorId,
    ],
  );
  const materialId = await insert(
    pool,
    'INSERT INTO materials (material_code,material_name,category_id,unit,acquire_method,created_by,updated_by) VALUES (?,?,?,?,?,?,?)',
    [
      materialCode,
      materialName,
      current.materialCategoryId,
      'kg',
      'purchased',
      current.actorId,
      current.actorId,
    ],
  );
  await pool.execute(
    'INSERT INTO product_materials (product_id,material_id,quantity_per_unit,unit,status,remark,created_by,updated_by) VALUES (?,?,?, ?,1,?,?,?)',
    [productId, materialId, '1.0000', 'kg', null, current.actorId, current.actorId],
  );
  current.productIds.push(productId);
  return { productId, materialId, materialCode, itemCode, materialName };
};

const productState = async (pool: Pool, productId: number) => {
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

const taskFor = (step: ApprovalInstanceStep | undefined, assigneeId: number) => {
  if (!step) throw new Error('approval step is missing');
  const task = step.tasks.find((candidate) => candidate.assigneeId === String(assigneeId));
  if (!task) throw new Error(`task for ${assigneeId} is missing`);
  return task;
};

const context = (actorId: number, suffix: string): CommandContext => {
  // Vitest calls this only after beforeAll has created the fixture; fail clearly if setup aborts.
  if (!contextFixture) throw new Error('approval fixture is not initialized');
  return {
    actorId: String(actorId),
    requestId: `${contextFixture.token}-${suffix}`,
    ip: '127.0.0.1',
    userAgent: 'approval-integration-test',
  };
};

const removeEmptyPreviousFlow = async (pool: Pool): Promise<void> => {
  const [[definition]] = await pool.query<(RowDataPacket & { id: number })[]>(
    'SELECT id FROM approval_flow_definitions WHERE scene_code=? AND is_deleted=0',
    [SCENE_CODE],
  );
  if (!definition) return;
  const [[count]] = await pool.query<(RowDataPacket & { total: number })[]>(
    'SELECT COUNT(*) total FROM approval_instances WHERE scene_code=?',
    [SCENE_CODE],
  );
  if (Number(count?.total ?? 0) > 0) {
    throw new Error(
      'approval integration database contains approval history; use the dedicated test database or clean its fixtures',
    );
  }
  const [versions] = await pool.query<(RowDataPacket & { id: number })[]>(
    'SELECT id FROM approval_flow_versions WHERE definition_id=?',
    [definition.id],
  );
  const versionIds = versions.map((row) => Number(row.id));
  if (versionIds.length) {
    const versionMarks = placeholders(versionIds);
    await pool.execute(
      `DELETE FROM approval_flow_steps WHERE flow_version_id IN (${versionMarks})`,
      versionIds,
    );
    await pool.execute(
      'UPDATE approval_flow_definitions SET published_version_id=NULL WHERE id=?',
      [definition.id],
    );
    await pool.execute(
      `DELETE FROM approval_flow_versions WHERE id IN (${versionMarks})`,
      versionIds,
    );
  }
  await pool.execute('DELETE FROM approval_flow_definitions WHERE id=?', [definition.id]);
};

const cleanupFixture = async (pool: Pool, current: Fixture): Promise<void> => {
  const productIds = current.productIds;
  const productMarks = placeholders(productIds);
  let materialIds: number[] = [];
  if (productIds.length) {
    const [materialRows] = await pool.query<(RowDataPacket & { id: number })[]>(
      `SELECT DISTINCT material_id id FROM product_materials WHERE product_id IN (${productMarks})`,
      productIds,
    );
    materialIds = materialRows.map((row) => Number(row.id));
    await pool.execute(
      `UPDATE products SET bom_status='draft',bom_approval_instance_id=NULL,bom_locked_at=NULL,bom_locked_by=NULL WHERE id IN (${productMarks})`,
      productIds,
    );
    const [instances] = await pool.query<(RowDataPacket & { id: number })[]>(
      `SELECT id FROM approval_instances WHERE scene_code=? AND subject_type=? AND subject_id IN (${productMarks})`,
      [SCENE_CODE, 'product', ...productIds],
    );
    const instanceIds = instances.map((row) => Number(row.id));
    if (instanceIds.length) {
      const instanceMarks = placeholders(instanceIds);
      await pool.execute(
        `DELETE FROM approval_actions WHERE instance_id IN (${instanceMarks})`,
        instanceIds,
      );
      await pool.execute(
        `DELETE FROM approval_tasks WHERE instance_step_id IN (SELECT id FROM approval_instance_steps WHERE instance_id IN (${instanceMarks}))`,
        instanceIds,
      );
      await pool.execute(
        `DELETE FROM approval_instance_steps WHERE instance_id IN (${instanceMarks})`,
        instanceIds,
      );
      await pool.execute(
        `DELETE FROM approval_instances WHERE id IN (${instanceMarks})`,
        instanceIds,
      );
    }
  }
  const [definitions] = await pool.query<(RowDataPacket & { id: number })[]>(
    'SELECT id FROM approval_flow_definitions WHERE scene_code=?',
    [SCENE_CODE],
  );
  for (const definition of definitions) {
    const [versions] = await pool.query<(RowDataPacket & { id: number })[]>(
      'SELECT id FROM approval_flow_versions WHERE definition_id=?',
      [definition.id],
    );
    const versionIds = versions.map((row) => Number(row.id));
    if (versionIds.length) {
      const versionMarks = placeholders(versionIds);
      await pool.execute(
        `DELETE FROM approval_flow_steps WHERE flow_version_id IN (${versionMarks})`,
        versionIds,
      );
      await pool.execute(
        'UPDATE approval_flow_definitions SET published_version_id=NULL WHERE id=?',
        [definition.id],
      );
      await pool.execute(
        `DELETE FROM approval_flow_versions WHERE id IN (${versionMarks})`,
        versionIds,
      );
    }
    await pool.execute('DELETE FROM approval_flow_definitions WHERE id=?', [definition.id]);
  }
  await pool.execute('DELETE FROM operation_logs WHERE request_id LIKE ?', [`${current.token}%`]);
  if (productIds.length) {
    await pool.execute(
      `DELETE FROM product_materials WHERE product_id IN (${productMarks})`,
      productIds,
    );
    if (materialIds.length) {
      const materialMarks = placeholders(materialIds);
      await pool.execute(`DELETE FROM materials WHERE id IN (${materialMarks})`, materialIds);
    }
    await pool.execute(`DELETE FROM products WHERE id IN (${productMarks})`, productIds);
  }
  await pool.execute('DELETE FROM materials WHERE material_code LIKE ?', [`${current.token}%`]);
  await pool.execute('DELETE FROM product_categories WHERE id IN (?,?)', [
    current.categoryId,
    current.materialCategoryId,
  ]);
  await pool.execute('DELETE FROM user_roles WHERE user_id IN (?,?,?)', [
    current.actorId,
    current.peerId,
    current.outsiderId,
  ]);
  await pool.execute('DELETE FROM roles WHERE id IN (?,?)', [current.role1Id, current.role2Id]);
  await pool.execute('DELETE FROM users WHERE id IN (?,?,?)', [
    current.actorId,
    current.peerId,
    current.outsiderId,
  ]);
};

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

const insert = async (pool: Pool, sql: string, values: ExecuteValues[]) => {
  const [result] = await pool.execute<ResultSetHeader>(sql, values);
  return Number(result.insertId);
};

const placeholders = (values: readonly unknown[]): string => values.map(() => '?').join(',');

const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} for MySQL integration test`);
  return value;
};
