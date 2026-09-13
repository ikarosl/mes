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
  ApprovalAssignee,
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
let flowRepositoryRef: MysqlApprovalFlowRepository | undefined;

/**
 * Approval 的真实 MySQL 回归覆盖：节点单执行记录、实时资格、用户节点、固定选版、
 * 分页前过滤、并发决定、业务事务回滚和真实 HTTP 管线。所有候选人都由 Identity
 * 实时计算，测试不会读取或写入已经删除的 approval_tasks。
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
    if (!/(?:_test|_ci)$/.test(database))
      throw new Error('approval integration tests require a dedicated *_test or *_ci database');
    pool = createPool({
      host: requiredEnv('DB_HOST'),
      port: Number(requiredEnv('DB_PORT')),
      user: requiredEnv('DB_USER'),
      password: requiredEnv('DB_PASSWORD'),
      database,
      charset: 'utf8mb4',
      timezone: '+08:00',
      connectionLimit: 12,
    });
    fixture = await createFixture(pool);
    contextFixture = fixture;
    identity = new IdentityDirectoryService(new MysqlRbacRepository(pool));
    handlers = new ApprovalSubjectHandlerRegistry();
    products = new MysqlProductCatalogRepository(pool);
    bomHandler = new ProductBomApprovalHandler(products, handlers);
    bomHandler.onModuleInit();
    flows = new MysqlApprovalFlowRepository(pool, identity, handlers);
    flowRepositoryRef = flows;
    approvals = new ApprovalService(
      new MysqlApprovalRepository(pool, identity, handlers, flows),
      flows,
    );
    fixture.publishedFlow = await publishFlow([
      roleAssignee('业务确认', fixture.assignmentRoleId),
      roleAssignee('技术确认', fixture.assignmentRoleId),
    ]);
  });

  afterAll(async () => {
    const appPool = app?.get(DATABASE_POOL) as Pool | undefined;
    await app?.close();
    await appPool?.end();
    if (pool && fixture) await cleanupFixture(pool, fixture);
    await pool?.end();
  });

  beforeEach(async () => {
    // Tests deliberately revoke membership/permissions; restore only the fixture baseline.
    await pool.execute(
      'INSERT IGNORE INTO user_roles (user_id,role_id) VALUES (?,?),(?,?),(?,?),(?,?),(?,?)',
      [
        fixture.actorId,
        fixture.assignmentRoleId,
        fixture.actorId,
        fixture.qualificationRoleId,
        fixture.peerId,
        fixture.assignmentRoleId,
        fixture.peerId,
        fixture.qualificationRoleId,
        fixture.designatedId,
        fixture.qualificationRoleId,
      ],
    );
    await pool.execute(
      'INSERT IGNORE INTO role_permissions (role_id,permission_id) VALUES (?,?),(?,?)',
      [
        fixture.qualificationRoleId,
        fixture.decidePermissionId,
        fixture.qualificationRoleId,
        fixture.viewPermissionId,
      ],
    );
  });

  it('uses one node execution record and keeps flow version fixed while a newer flow is published', async () => {
    const product = await createProduct(pool, fixture, 'single-node');
    const submitted = await approvals.submit(
      { sceneCode: SCENE_CODE, subjectId: String(product.productId), expectedVersion: 0 },
      context(fixture.actorId, 'single-node-submit'),
    );
    expect(submitted).toMatchObject({
      status: 'pending',
      flowVersionNo: fixture.publishedFlow.published!.versionNo,
      snapshotSchemaVersion: 2,
      version: 0,
    });
    expect(submitted.steps).toHaveLength(2);
    expect(submitted.steps[0]).toMatchObject({
      status: 'pending',
      assigneeType: 'role',
      roleId: String(fixture.assignmentRoleId),
      assigneeUserId: null,
    });
    expect(submitted.steps[0]!.eligibleUsers.map((user) => user.id)).toEqual(
      expect.arrayContaining([String(fixture.actorId), String(fixture.peerId)]),
    );
    expect(submitted.steps[1]!.eligibleUsers).toEqual([]);
    const [[taskTable]] = await pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM information_schema.tables
       WHERE table_schema=DATABASE() AND table_name='approval_tasks'`,
    );
    expect(Number(taskTable.total)).toBe(0);
    const [removedColumns] = await pool.query<(RowDataPacket & { column_name: string })[]>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema=DATABASE() AND table_name='approval_instance_steps'
         AND column_name IN ('assignment_round','blocked_reason')`,
    );
    expect(removedColumns).toHaveLength(0);

    const newer = await publishFlow([
      roleAssignee('业务确认（新版）', fixture.assignmentRoleId),
      userAssignee('指定技术确认', fixture.designatedId),
    ]);
    expect(newer.published!.versionNo).toBeGreaterThan(submitted.flowVersionNo);
    const stillBound = await approvals.getInstance(submitted.id, String(fixture.actorId), true);
    expect(stillBound.flowVersionNo).toBe(submitted.flowVersionNo);
    expect(stillBound.steps[1]).toMatchObject({
      assigneeType: 'role',
      roleId: String(fixture.assignmentRoleId),
      status: 'waiting',
    });
  });

  it('resolves qualifications through all active roles and lets a newly added member decide an activated node', async () => {
    await publishFlow([
      roleAssignee('动态角色节点', fixture.assignmentRoleId),
      roleAssignee('动态后续节点', fixture.assignmentRoleId),
    ]);
    const product = await createProduct(pool, fixture, 'dynamic');
    const submitted = await approvals.submit(
      { sceneCode: SCENE_CODE, subjectId: String(product.productId), expectedVersion: 0 },
      context(fixture.actorId, 'dynamic-submit'),
    );

    const actorEligibility = await identity.getApprovalActorEligibility(String(fixture.actorId));
    const roleCandidates = await identity.listApprovalEligibleUserIds(
      String(fixture.assignmentRoleId),
    );
    expect(actorEligibility.canDecide).toBe(true);
    expect(actorEligibility.roleIds).toContain(String(fixture.assignmentRoleId));
    expect(roleCandidates).toEqual(
      expect.arrayContaining([String(fixture.actorId), String(fixture.peerId)]),
    );

    // A member can retain approval:decide through another active role while no longer
    // belonging to this node's configured assignment role. The pending item must disappear
    // from that user's todo view and a direct command must leave no action evidence.
    await pool.execute('DELETE FROM user_roles WHERE user_id=? AND role_id=?', [
      fixture.peerId,
      fixture.assignmentRoleId,
    ]);
    const peerTodo = await approvals.listInstances(
      { scope: 'todo', subjectId: String(product.productId), page: 1, pageSize: 10 },
      String(fixture.peerId),
      false,
    );
    expect(peerTodo.total).toBe(0);
    const [[peerActionBefore]] = await pool.query<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) total FROM approval_actions WHERE instance_id=?',
      [submitted.id],
    );
    await expect(
      approvals.approve(
        submitted.id,
        { version: submitted.version, stepId: submitted.steps[0]!.id },
        context(fixture.peerId, 'dynamic-removed-assignment-role'),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const [[peerActionAfter]] = await pool.query<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) total FROM approval_actions WHERE instance_id=?',
      [submitted.id],
    );
    expect(Number(peerActionAfter.total)).toBe(Number(peerActionBefore.total));

    const newMember = await insert(
      pool,
      'INSERT INTO users (username,password_hash,display_name) VALUES (?,?,?)',
      [`${fixture.token}-new-member`, 'integration-test-hash', '动态新增审批人'],
    );
    fixture.extraUserIds.push(newMember);
    await pool.execute('INSERT INTO user_roles (user_id,role_id) VALUES (?,?),(?,?)', [
      newMember,
      fixture.assignmentRoleId,
      newMember,
      fixture.qualificationRoleId,
    ]);
    await pool.execute('DELETE FROM user_roles WHERE user_id=? AND role_id=?', [
      fixture.actorId,
      fixture.qualificationRoleId,
    ]);
    const blockedForActor = await approvals.getInstance(
      submitted.id,
      String(fixture.actorId),
      true,
    );
    expect(blockedForActor.steps[0]).toMatchObject({
      status: 'pending',
      blockedReason: null,
    });
    expect(blockedForActor.canApprove).toBe(false);
    const [[beforeRejectedDecision]] = await pool.query<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) total FROM approval_actions WHERE instance_id=?',
      [submitted.id],
    );
    await expect(
      approvals.approve(
        submitted.id,
        { version: submitted.version, stepId: submitted.steps[0]!.id },
        context(fixture.actorId, 'dynamic-revoked-actor'),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const [[afterRejectedDecision]] = await pool.query<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) total FROM approval_actions WHERE instance_id=?',
      [submitted.id],
    );
    expect(Number(afterRejectedDecision.total)).toBe(Number(beforeRejectedDecision.total));

    const newMemberDetail = await approvals.getInstance(submitted.id, String(newMember), false);
    expect(newMemberDetail.canApprove).toBe(true);
    const approved = await approvals.approve(
      submitted.id,
      { version: submitted.version, stepId: submitted.steps[0]!.id },
      context(newMember, 'dynamic-new-member-approve'),
    );
    expect(approved.steps[0]!.status).toBe('approved');
    expect(approved.steps[1]!.status).toBe('pending');
  });

  it('keeps an active node pending with dynamic blocked projection and naturally recovers after qualification returns', async () => {
    await publishFlow([
      roleAssignee('无候选节点', fixture.assignmentRoleId),
      roleAssignee('恢复后续节点', fixture.assignmentRoleId),
    ]);
    const product = await createProduct(pool, fixture, 'blocked');
    const submitted = await approvals.submit(
      { sceneCode: SCENE_CODE, subjectId: String(product.productId), expectedVersion: 0 },
      context(fixture.actorId, 'blocked-submit'),
    );
    await pool.execute('DELETE FROM user_roles WHERE role_id=?', [fixture.qualificationRoleId]);
    const blocked = await approvals.getInstance(submitted.id, String(fixture.actorId), true);
    expect(blocked.steps[0]).toMatchObject({
      status: 'blocked',
      blockedReason: 'no_eligible_assignee',
    });
    const [[storedStep]] = await pool.query<
      (RowDataPacket & { status: string; ended_at: Date | null })[]
    >('SELECT status,ended_at FROM approval_instance_steps WHERE id=?', [submitted.steps[0]!.id]);
    expect(storedStep).toMatchObject({ status: 'pending', ended_at: null });
    const [actions] = await pool.query<(RowDataPacket & { action_type: string })[]>(
      'SELECT action_type FROM approval_actions WHERE instance_id=? ORDER BY action_no',
      [submitted.id],
    );
    expect(actions.map((action) => action.action_type)).toEqual(['submitted']);
    const todo = await approvals.listInstances(
      { scope: 'todo', page: 1, pageSize: 10 },
      String(fixture.actorId),
      false,
    );
    expect(todo.items.map((item) => item.id)).not.toContain(submitted.id);

    await pool.execute('INSERT INTO user_roles (user_id,role_id) VALUES (?,?),(?,?)', [
      fixture.actorId,
      fixture.qualificationRoleId,
      fixture.peerId,
      fixture.qualificationRoleId,
    ]);
    const recovered = await approvals.getInstance(submitted.id, String(fixture.actorId), true);
    expect(recovered.steps[0]).toMatchObject({ status: 'pending', blockedReason: null });
    expect(recovered.canApprove).toBe(true);
    const approved = await approvals.approve(
      submitted.id,
      { version: submitted.version, stepId: submitted.steps[0]!.id },
      context(fixture.actorId, 'blocked-recovered-approve'),
    );
    expect(approved.steps[0]!.status).toBe('approved');
  });

  it('supports a designated user without assignment-role membership and rechecks account and permission state', async () => {
    await publishFlow([userAssignee('指定用户节点', fixture.designatedId)]);
    await pool.execute('DELETE FROM user_roles WHERE user_id=? AND role_id=?', [
      fixture.designatedId,
      fixture.assignmentRoleId,
    ]);
    const userEligibility = await identity.getApprovalActorEligibility(
      String(fixture.designatedId),
    );
    expect(userEligibility.canDecide).toBe(true);
    expect(userEligibility.roleIds).not.toContain(String(fixture.assignmentRoleId));

    const disabledProduct = await createProduct(pool, fixture, 'designated-disabled');
    const disabledSubmitted = await approvals.submit(
      { sceneCode: SCENE_CODE, subjectId: String(disabledProduct.productId), expectedVersion: 0 },
      context(fixture.actorId, 'designated-disabled-submit'),
    );
    expect(disabledSubmitted.steps[0]).toMatchObject({
      assigneeType: 'user',
      roleId: null,
      assigneeUserId: String(fixture.designatedId),
    });
    await pool.execute('UPDATE users SET status=0 WHERE id=?', [fixture.designatedId]);
    await expect(
      approvals.approve(
        disabledSubmitted.id,
        { version: disabledSubmitted.version, stepId: disabledSubmitted.steps[0]!.id },
        context(fixture.designatedId, 'designated-disabled-decide'),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await pool.execute('UPDATE users SET status=1 WHERE id=?', [fixture.designatedId]);

    const revokedProduct = await createProduct(pool, fixture, 'designated-revoked');
    const revokedSubmitted = await approvals.submit(
      { sceneCode: SCENE_CODE, subjectId: String(revokedProduct.productId), expectedVersion: 0 },
      context(fixture.actorId, 'designated-revoked-submit'),
    );
    await pool.execute(
      'DELETE rp FROM role_permissions rp WHERE rp.role_id=? AND rp.permission_id=?',
      [fixture.qualificationRoleId, fixture.decidePermissionId],
    );
    await expect(
      approvals.approve(
        revokedSubmitted.id,
        { version: revokedSubmitted.version, stepId: revokedSubmitted.steps[0]!.id },
        context(fixture.designatedId, 'designated-revoked-decide'),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await pool.execute('INSERT INTO role_permissions (role_id,permission_id) VALUES (?,?)', [
      fixture.qualificationRoleId,
      fixture.decidePermissionId,
    ]);
    const approved = await approvals.approve(
      revokedSubmitted.id,
      { version: revokedSubmitted.version, stepId: revokedSubmitted.steps[0]!.id },
      context(fixture.designatedId, 'designated-restored-decide'),
    );
    expect(approved.status).toBe('approved');
  });

  it('filters todo pagination before LIMIT and exposes historical access to applicants and actual actors', async () => {
    const [pending] = await pool.query<
      (RowDataPacket & { id: number; version: number; created_by: number })[]
    >(
      "SELECT id,version,created_by FROM approval_instances WHERE status='pending' AND created_by=?",
      [fixture.actorId],
    );
    for (const row of pending) {
      await approvals.withdraw(
        String(row.id),
        { version: Number(row.version), comment: 'pagination fixture reset' },
        context(fixture.actorId, `pagination-reset-${row.id}`),
      );
    }
    await publishFlow([userAssignee('pagination old assignee', fixture.designatedId)]);
    const eligibleProduct = await createProduct(pool, fixture, 'pagination-eligible');
    const eligible = await approvals.submit(
      { sceneCode: SCENE_CODE, subjectId: String(eligibleProduct.productId), expectedVersion: 0 },
      context(fixture.actorId, 'pagination-eligible-submit'),
    );
    await publishFlow([userAssignee('pagination new assignee', fixture.actorId)]);
    const ineligibleProduct = await createProduct(pool, fixture, 'pagination-ineligible');
    const ineligible = await approvals.submit(
      { sceneCode: SCENE_CODE, subjectId: String(ineligibleProduct.productId), expectedVersion: 0 },
      context(fixture.actorId, 'pagination-ineligible-submit'),
    );
    const eligiblePage = await approvals.listInstances(
      { scope: 'todo', page: 1, pageSize: 1 },
      String(fixture.designatedId),
      false,
    );
    expect(eligiblePage.total).toBe(1);
    expect(eligiblePage.items).toHaveLength(1);
    expect(eligiblePage.items[0]!.id).toBe(eligible.id);
    const applicant = await approvals.getInstance(ineligible.id, String(fixture.actorId), false);
    expect(applicant.id).toBe(ineligible.id);
    const actor = await approvals.approve(
      eligible.id,
      { version: eligible.version, stepId: eligible.steps[0]!.id },
      context(fixture.designatedId, 'pagination-actual-actor'),
    );
    expect(actor.status).toBe('approved');
    const actualActor = await approvals.getInstance(
      eligible.id,
      String(fixture.designatedId),
      false,
    );
    expect(actualActor.actions.at(-1)).toMatchObject({
      actionType: 'approved',
      actorId: String(fixture.designatedId),
    });
    await pool.execute('DELETE FROM user_roles WHERE user_id=?', [fixture.designatedId]);
    const actualActorAfterRevocation = await approvals.getInstance(
      eligible.id,
      String(fixture.designatedId),
      false,
    );
    expect(actualActorAfterRevocation.id).toBe(eligible.id);
    await expect(
      approvals.getInstance(eligible.id, String(fixture.peerId), false),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('records exactly one decision when two qualified users decide the same node concurrently', async () => {
    await publishFlow([
      roleAssignee('并发节点', fixture.assignmentRoleId),
      userAssignee('并发末级', fixture.designatedId),
    ]);
    const product = await createProduct(pool, fixture, 'concurrent');
    const submitted = await approvals.submit(
      { sceneCode: SCENE_CODE, subjectId: String(product.productId), expectedVersion: 0 },
      context(fixture.actorId, 'concurrent-submit'),
    );
    const outcomes = await Promise.allSettled([
      approvals.approve(
        submitted.id,
        { version: submitted.version, stepId: submitted.steps[0]!.id },
        context(fixture.actorId, 'concurrent-actor'),
      ),
      approvals.approve(
        submitted.id,
        { version: submitted.version, stepId: submitted.steps[0]!.id },
        context(fixture.peerId, 'concurrent-peer'),
      ),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const loser = outcomes.find((outcome) => outcome.status === 'rejected') as
      PromiseRejectedResult | undefined;
    expect(loser?.reason).toMatchObject({
      code: expect.stringMatching(/^(CONFLICT|CONCURRENT_MODIFICATION)$/),
    });
    const current = await approvals.getInstance(submitted.id, String(fixture.actorId), true);
    expect(current.actions.filter((action) => action.actionType === 'approved')).toHaveLength(1);
    expect(current.steps[0]!.status).toBe('approved');
    expect(current.steps[1]!.status).toBe('pending');
    const [[beforeLateDecision]] = await pool.query<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) total FROM approval_actions WHERE instance_id=?',
      [submitted.id],
    );
    await expect(
      approvals.approve(
        submitted.id,
        { version: current.version, stepId: current.steps[0]!.id },
        context(fixture.actorId, 'concurrent-late-old-step'),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    const [[afterLateDecision]] = await pool.query<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) total FROM approval_actions WHERE instance_id=?',
      [submitted.id],
    );
    expect(Number(afterLateDecision.total)).toBe(Number(beforeLateDecision.total));
  });

  it('rolls back the final business effect and approval evidence together when finalization fails', async () => {
    await publishFlow([
      roleAssignee('回滚首级', fixture.assignmentRoleId),
      roleAssignee('回滚末级', fixture.assignmentRoleId),
    ]);
    const product = await createProduct(pool, fixture, 'final-rollback');
    const submitted = await approvals.submit(
      { sceneCode: SCENE_CODE, subjectId: String(product.productId), expectedVersion: 0 },
      context(fixture.actorId, 'final-rollback-submit'),
    );
    const first = await approvals.approve(
      submitted.id,
      { version: submitted.version, stepId: submitted.steps[0]!.id },
      context(fixture.actorId, 'final-rollback-first'),
    );
    await pool.execute('UPDATE materials SET status=0 WHERE id=?', [product.materialId]);
    await expect(
      approvals.approve(
        submitted.id,
        { version: first.version, stepId: first.steps[1]!.id },
        context(fixture.actorId, 'final-rollback-final-fails'),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const afterFailure = await approvals.getInstance(submitted.id, String(fixture.actorId), true);
    expect(afterFailure).toMatchObject({ status: 'pending', version: first.version });
    expect(afterFailure.steps[1]).toMatchObject({ status: 'pending' });
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
      { version: first.version, stepId: first.steps[1]!.id },
      context(fixture.actorId, 'final-rollback-retry'),
    );
    expect(approved.status).toBe('approved');
  });

  it('freezes BOM evidence, blocks edits through rejection/approval, and restores draft state for a resubmission', async () => {
    await publishFlow([
      roleAssignee('冻结首级', fixture.assignmentRoleId),
      roleAssignee('冻结末级', fixture.assignmentRoleId),
    ]);
    const product = await createProduct(pool, fixture, 'freeze');
    const submitted = await approvals.submit(
      { sceneCode: SCENE_CODE, subjectId: String(product.productId), expectedVersion: 0 },
      context(fixture.actorId, 'freeze-submit'),
    );
    expect(submitted.subjectSnapshot.materials[0]).not.toHaveProperty('isKeyMaterial');
    expect(submitted.subjectSnapshot.materials[0]).not.toHaveProperty('needBatchRecord');
    await expect(
      products.replaceMaterials(
        String(product.productId),
        {
          version: 1,
          items: [{ materialId: String(product.materialId), quantityPerUnit: 2, unit: 'kg' }],
        },
        context(fixture.actorId, 'freeze-edit-pending'),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await pool.execute('UPDATE materials SET material_name=? WHERE id=?', [
      `${product.materialName}-renamed`,
      product.materialId,
    ]);
    const historical = await approvals.getInstance(submitted.id, String(fixture.actorId), true);
    expect(historical.materialNames[String(product.materialId)]).toBe(
      `${product.materialName}-renamed`,
    );
    const first = await approvals.approve(
      submitted.id,
      { version: submitted.version, stepId: submitted.steps[0]!.id },
      context(fixture.actorId, 'freeze-first'),
    );
    const approved = await approvals.approve(
      submitted.id,
      { version: first.version, stepId: first.steps[1]!.id },
      context(fixture.actorId, 'freeze-final'),
    );
    expect(approved.status).toBe('approved');
    expect(approved.actions.map((action) => action.actionType)).toEqual([
      'submitted',
      'approved',
      'approved',
    ]);
    expect(await productState(pool, product.productId)).toMatchObject({
      bom_status: 'approved',
      bom_approval_instance_id: Number(submitted.id),
      bom_locked_by: fixture.actorId,
      version: 2,
    });
    await expect(
      products.replaceMaterials(
        String(product.productId),
        {
          version: 2,
          items: [{ materialId: String(product.materialId), quantityPerUnit: 3, unit: 'kg' }],
        },
        context(fixture.actorId, 'freeze-edit-approved'),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const rejectedProduct = await createProduct(pool, fixture, 'reject-restore');
    const rejection = await approvals.submit(
      { sceneCode: SCENE_CODE, subjectId: String(rejectedProduct.productId), expectedVersion: 0 },
      context(fixture.actorId, 'reject-restore-submit'),
    );
    const rejected = await approvals.reject(
      rejection.id,
      { version: rejection.version, stepId: rejection.steps[0]!.id, comment: '请补充工艺依据' },
      context(fixture.peerId, 'reject-restore-decision'),
    );
    expect(rejected.actions.at(-1)).toMatchObject({
      actionType: 'rejected',
      actorId: String(fixture.peerId),
    });
    expect(await productState(pool, rejectedProduct.productId)).toMatchObject({
      bom_status: 'draft',
      version: 2,
    });
    const resubmitted = await approvals.submit(
      { sceneCode: SCENE_CODE, subjectId: String(rejectedProduct.productId), expectedVersion: 2 },
      context(fixture.actorId, 'reject-restore-resubmit'),
    );
    expect(resubmitted.status).toBe('pending');
  });

  it('rolls back a binding failure after the Product write, including graph and transactional audit', async () => {
    await publishFlow([roleAssignee('绑定回滚', fixture.assignmentRoleId)]);
    const product = await createProduct(pool, fixture, 'bind-rollback');
    const originalBind = bomHandler.bindApproval.bind(bomHandler);
    let reached = false;
    bomHandler.bindApproval = async (subjectId, instanceId, version, audit) => {
      await originalBind(subjectId, instanceId, version, audit);
      reached = true;
      throw new ApprovalSubjectError('CONFLICT', 'injected bind failure');
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
    expect(reached).toBe(true);
    expect(await productState(pool, product.productId)).toMatchObject({
      bom_status: 'draft',
      bom_approval_instance_id: null,
      bom_locked_at: null,
      bom_locked_by: null,
      version: 0,
    });
    const [[instances]] = await pool.query<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) total FROM approval_instances WHERE subject_type=? AND subject_id=?',
      ['product', product.productId],
    );
    const [[actions]] = await pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM approval_actions a JOIN approval_instances i ON i.id=a.instance_id
       WHERE i.subject_type=? AND i.subject_id=?`,
      ['product', product.productId],
    );
    const [[audit]] = await pool.query<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) total FROM operation_logs WHERE request_id=?',
      [`${fixture.token}-bind-rollback-submit`],
    );
    expect(Number(instances.total)).toBe(0);
    expect(Number(actions.total)).toBe(0);
    expect(Number(audit.total)).toBe(0);
  });

  it('serializes withdrawal against final approval and leaves one terminal decision with matching BOM state', async () => {
    await publishFlow([
      roleAssignee('撤回首级', fixture.assignmentRoleId),
      roleAssignee('撤回末级', fixture.assignmentRoleId),
    ]);
    const product = await createProduct(pool, fixture, 'withdraw-race');
    const submitted = await approvals.submit(
      { sceneCode: SCENE_CODE, subjectId: String(product.productId), expectedVersion: 0 },
      context(fixture.actorId, 'withdraw-race-submit'),
    );
    const first = await approvals.approve(
      submitted.id,
      { version: submitted.version, stepId: submitted.steps[0]!.id },
      context(fixture.actorId, 'withdraw-race-first'),
    );
    const outcomes = await Promise.allSettled([
      approvals.withdraw(
        submitted.id,
        { version: first.version, comment: '并发撤回决定' },
        context(fixture.actorId, 'withdraw-race-withdraw'),
      ),
      approvals.approve(
        submitted.id,
        { version: first.version, stepId: first.steps[1]!.id },
        context(fixture.actorId, 'withdraw-race-final'),
      ),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const winner = outcomes.find((outcome) => outcome.status === 'fulfilled') as
      PromiseFulfilledResult<ApprovalInstanceDetail> | undefined;
    expect(winner).toBeDefined();
    const loser = outcomes.find(
      (outcome) => outcome.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(loser.reason).toMatchObject({
      code: expect.stringMatching(/^(CONFLICT|CONCURRENT_MODIFICATION)$/),
    });
    const terminal = winner!.value.actions.filter(
      (action) =>
        action.actionType === 'withdrawn' ||
        (action.actionType === 'approved' && action.stepId === winner!.value.steps[1]!.id),
    );
    expect(terminal).toHaveLength(1);
    const state = await productState(pool, product.productId);
    if (winner!.value.status === 'approved') {
      expect(state).toMatchObject({
        bom_status: 'approved',
        bom_approval_instance_id: Number(submitted.id),
      });
    } else {
      expect(state).toMatchObject({ bom_status: 'draft', bom_approval_instance_id: null });
    }
  });

  it('rejects stale draft identity/version writes and keeps the published flow unchanged', async () => {
    const before = await flowsForContext().getFlow(SCENE_CODE);
    const draft = await flowsForContext().saveFlowDraft(
      SCENE_CODE,
      {
        name: 'stale draft check',
        draftId: null,
        version: null,
        steps: [roleAssignee('草稿节点', fixture.assignmentRoleId)],
      },
      context(fixture.actorId, 'stale-draft-create'),
    );
    await expect(
      flowsForContext().saveFlowDraft(
        SCENE_CODE,
        {
          name: 'wrong draft identity',
          draftId: draft.draft!.id,
          version: draft.draft!.version - 1,
          steps: [roleAssignee('wrong', fixture.assignmentRoleId)],
        },
        context(fixture.actorId, 'stale-draft-save'),
      ),
    ).rejects.toMatchObject({ code: 'CONCURRENT_MODIFICATION' });
    await expect(
      flowsForContext().publishFlow(
        SCENE_CODE,
        { draftId: draft.draft!.id, version: draft.draft!.version - 1 },
        context(fixture.actorId, 'stale-draft-publish'),
      ),
    ).rejects.toMatchObject({ code: 'CONCURRENT_MODIFICATION' });
    const published = await flowsForContext().publishFlow(
      SCENE_CODE,
      { draftId: draft.draft!.id, version: draft.draft!.version },
      context(fixture.actorId, 'stale-draft-publish-valid'),
    );
    expect(published.published?.versionNo).toBeGreaterThan(before.published?.versionNo ?? 0);
    expect(published.draft).toBeNull();
  });

  it('uses the real HTTP pipeline for global configuration/user options and rejects legacy inputs', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.use(requestContextMiddleware);
    app.useGlobalPipes(createValidationPipe());
    await app.init();

    const token = await signAccessToken(fixture.actorId, `${fixture.token}-actor`);
    const scenes = await request(app.getHttpServer())
      .get('/api/approval/scenes')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Request-Id', randomUUID());
    expect(scenes.status).toBe(200);
    const userOptions = await request(app.getHttpServer())
      .get('/api/approval/user-options')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Request-Id', randomUUID());
    expect(userOptions.status).toBe(200);
    expect(Array.isArray(userOptions.body)).toBe(true);
    expect(userOptions.body.map((user: { id: string }) => user.id)).toContain(
      String(fixture.designatedId),
    );
    await pool.execute('UPDATE users SET status=0 WHERE id=?', [fixture.designatedId]);
    const disabledUserOptions = await request(app.getHttpServer())
      .get('/api/approval/user-options')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Request-Id', randomUUID());
    expect(disabledUserOptions.status).toBe(200);
    expect(disabledUserOptions.body.map((user: { id: string }) => user.id)).not.toContain(
      String(fixture.designatedId),
    );
    await pool.execute('UPDATE users SET status=1 WHERE id=?', [fixture.designatedId]);
    const forbidden = await request(app.getHttpServer())
      .get('/api/approval/scenes')
      .set('Authorization', `Bearer ${await signAccessToken(fixture.outsiderId, fixture.token)}`)
      .set('X-Request-Id', randomUUID());
    expect(forbidden.status).toBe(403);
    const userOptionsForbidden = await request(app.getHttpServer())
      .get('/api/approval/user-options')
      .set('Authorization', `Bearer ${await signAccessToken(fixture.outsiderId, fixture.token)}`)
      .set('X-Request-Id', randomUUID());
    expect(userOptionsForbidden.status).toBe(403);
    const legacyDecision = await request(app.getHttpServer())
      .post('/api/approval/instances/999999/approve')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Request-Id', randomUUID())
      .send({ version: 0, taskId: '1' });
    expect(legacyDecision.status).toBe(400);
    expect(String(legacyDecision.body.message)).toContain('taskId');
    const clientQualification = await request(app.getHttpServer())
      .get('/api/approval/instances?page=1&pageSize=10&roleIds=1&userId=1&canApprove=true')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Request-Id', randomUUID());
    expect(clientQualification.status).toBe(400);
    const reassignment = await request(app.getHttpServer())
      .post('/api/approval/instances/999999/reassign')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Request-Id', randomUUID())
      .send({ version: 0 });
    expect(reassignment.status).toBe(404);
  });
});

interface Fixture {
  token: string;
  actorId: number;
  peerId: number;
  designatedId: number;
  outsiderId: number;
  assignmentRoleId: number;
  qualificationRoleId: number;
  categoryId: number;
  materialCategoryId: number;
  decidePermissionId: number;
  viewPermissionId: number;
  configurePermissionId: number;
  productManagePermissionId: number;
  productIds: number[];
  extraUserIds: number[];
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
  const token = `appr-${process.pid}-${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const actorId = await createUser(pool, token, 'actor', '审批集成申请人');
  const peerId = await createUser(pool, token, 'peer', '审批集成同级人');
  const designatedId = await createUser(pool, token, 'designated', '审批集成指定人');
  const outsiderId = await createUser(pool, token, 'outsider', '审批集成无权限人');
  const assignmentRoleId = await insert(
    pool,
    'INSERT INTO roles (name,code,description,status) VALUES (?,?,?,1)',
    ['审批分配角色', `${token}-assignment-role`, '审批节点分配角色'],
  );
  const qualificationRoleId = await insert(
    pool,
    'INSERT INTO roles (name,code,description,status) VALUES (?,?,?,1)',
    ['审批资格角色', `${token}-qualification-role`, '仅提供审批资格'],
  );
  const permissionCodes = [
    PERMISSIONS.approval.configure,
    PERMISSIONS.approval.decide,
    PERMISSIONS.approval.view,
    PERMISSIONS.product.products.manageBom,
  ];
  const [permissionRows] = await pool.query<(RowDataPacket & { id: number; code: string })[]>(
    'SELECT id,code FROM permissions WHERE code IN (?) AND status=1 AND deleted_at IS NULL',
    [permissionCodes],
  );
  const permissionIds = new Map(permissionRows.map((row) => [row.code, Number(row.id)]));
  for (const code of permissionCodes) {
    if (!permissionIds.has(code))
      throw new Error(`Missing permission ${code}; run migrations first`);
  }
  const configurePermissionId = permissionIds.get(PERMISSIONS.approval.configure)!;
  const decidePermissionId = permissionIds.get(PERMISSIONS.approval.decide)!;
  const viewPermissionId = permissionIds.get(PERMISSIONS.approval.view)!;
  const productManagePermissionId = permissionIds.get(PERMISSIONS.product.products.manageBom)!;
  await pool.execute(
    'INSERT INTO role_permissions (role_id,permission_id) VALUES (?,?),(?,?),(?,?),(?,?)',
    [
      assignmentRoleId,
      configurePermissionId,
      assignmentRoleId,
      viewPermissionId,
      assignmentRoleId,
      productManagePermissionId,
      qualificationRoleId,
      decidePermissionId,
    ],
  );
  await pool.execute(
    'INSERT INTO user_roles (user_id,role_id) VALUES (?,?),(?,?),(?,?),(?,?),(?,?)',
    [
      actorId,
      assignmentRoleId,
      actorId,
      qualificationRoleId,
      peerId,
      assignmentRoleId,
      peerId,
      qualificationRoleId,
      designatedId,
      qualificationRoleId,
    ],
  );
  const categoryId = await insert(
    pool,
    'INSERT INTO product_categories (category_code,category_name,item_kind,created_by,updated_by) VALUES (?,?,?,?,?)',
    [`${token}-finished-category`, '审批集成成品分类', 'finished_product', actorId, actorId],
  );
  const materialCategoryId = await insert(
    pool,
    'INSERT INTO product_categories (category_code,category_name,item_kind,created_by,updated_by) VALUES (?,?,?,?,?)',
    [`${token}-material-category`, '审批集成物料分类', 'material', actorId, actorId],
  );
  return {
    token,
    actorId,
    peerId,
    designatedId,
    outsiderId,
    assignmentRoleId,
    qualificationRoleId,
    categoryId,
    materialCategoryId,
    decidePermissionId,
    viewPermissionId,
    configurePermissionId,
    productManagePermissionId,
    productIds: [],
    extraUserIds: [],
    publishedFlow: { sceneCode: SCENE_CODE, name: '', published: null, draft: null },
  };
};

const publishFlow = async (
  steps: (ApprovalAssignee & { name: string })[],
): Promise<ApprovalFlowDetail> => {
  if (!contextFixture) throw new Error('approval fixture is not initialized');
  const current = await flowsForContext().getFlow(SCENE_CODE);
  const currentSteps = current.published?.steps ?? [];
  const payloadSteps = steps.map((step, index) => ({
    ...step,
    nodeCode: currentSteps[index]?.nodeCode ?? undefined,
  }));
  const flowRepository = flowsForContext();
  const draft = await flowRepository.saveFlowDraft(
    SCENE_CODE,
    {
      name: `BOM 审批版本 ${Date.now()}`,
      draftId: null,
      version: null,
      steps: payloadSteps,
    },
    context(contextFixture.actorId, `flow-draft-${randomUUID()}`),
  );
  const published = await flowRepository.publishFlow(
    SCENE_CODE,
    { draftId: draft.draft!.id, version: draft.draft!.version },
    context(contextFixture.actorId, `flow-publish-${randomUUID()}`),
  );
  contextFixture.publishedFlow = published;
  return published;
};

const flowsForContext = (): MysqlApprovalFlowRepository => {
  if (!contextFixture || !flowRepositoryRef)
    throw new Error('approval flow repository is not initialized');
  return flowRepositoryRef;
};

const roleAssignee = (name: string, roleId: number): ApprovalAssignee & { name: string } => ({
  name,
  assigneeType: 'role',
  roleId: String(roleId),
  assigneeUserId: null,
});

const userAssignee = (name: string, userId: number): ApprovalAssignee & { name: string } => ({
  name,
  assigneeType: 'user',
  roleId: null,
  assigneeUserId: String(userId),
});

const createUser = async (
  pool: Pool,
  token: string,
  suffix: string,
  name: string,
): Promise<number> =>
  insert(pool, 'INSERT INTO users (username,password_hash,display_name) VALUES (?,?,?)', [
    `${token}-${suffix}`,
    'integration-test-hash',
    name,
  ]);

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

const context = (actorId: number, suffix: string): CommandContext => {
  if (!contextFixture) throw new Error('approval fixture is not initialized');
  return {
    actorId: String(actorId),
    requestId: `${contextFixture.token}-${suffix}`,
    ip: '127.0.0.1',
    userAgent: 'approval-integration-test',
  };
};

const cleanupFixture = async (pool: Pool, current: Fixture): Promise<void> => {
  const productMarks = placeholders(current.productIds);
  if (current.productIds.length) {
    await pool.execute(
      `UPDATE products SET bom_status='draft',bom_approval_instance_id=NULL,bom_locked_at=NULL,bom_locked_by=NULL WHERE id IN (${productMarks})`,
      current.productIds,
    );
    const [instances] = await pool.query<(RowDataPacket & { id: number })[]>(
      `SELECT id FROM approval_instances WHERE scene_code=? AND subject_type='product' AND subject_id IN (${productMarks})`,
      [SCENE_CODE, ...current.productIds],
    );
    const instanceIds = instances.map((row) => Number(row.id));
    if (instanceIds.length) {
      const marks = placeholders(instanceIds);
      await pool.execute(
        `DELETE FROM approval_actions WHERE instance_id IN (${marks})`,
        instanceIds,
      );
      await pool.execute(
        `DELETE FROM approval_instance_steps WHERE instance_id IN (${marks})`,
        instanceIds,
      );
      await pool.execute(`DELETE FROM approval_instances WHERE id IN (${marks})`, instanceIds);
    }
    const [materials] = await pool.query<(RowDataPacket & { id: number })[]>(
      `SELECT DISTINCT material_id id FROM product_materials WHERE product_id IN (${productMarks})`,
      current.productIds,
    );
    await pool.execute(
      `UPDATE products SET bom_status='draft',bom_approval_instance_id=NULL,bom_locked_at=NULL,bom_locked_by=NULL WHERE id IN (${productMarks})`,
      current.productIds,
    );
    await pool.execute(
      `DELETE FROM product_materials WHERE product_id IN (${productMarks})`,
      current.productIds,
    );
    const materialIds = materials.map((row) => Number(row.id));
    if (materialIds.length)
      await pool.execute(
        `DELETE FROM materials WHERE id IN (${placeholders(materialIds)})`,
        materialIds,
      );
    await pool.execute(`DELETE FROM products WHERE id IN (${productMarks})`, current.productIds);
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
      const marks = placeholders(versionIds);
      const [leftoverInstances] = await pool.query<
        (RowDataPacket & { id: number; subject_id: number })[]
      >(
        `SELECT id,subject_id FROM approval_instances WHERE flow_version_id IN (${marks})`,
        versionIds,
      );
      if (leftoverInstances.length) {
        const leftoverIds = leftoverInstances.map((row) => Number(row.id));
        const leftoverMarks = placeholders(leftoverIds);
        const subjectIds = [...new Set(leftoverInstances.map((row) => Number(row.subject_id)))];
        if (subjectIds.length) {
          await pool.execute(
            `UPDATE products SET bom_status='draft',bom_approval_instance_id=NULL,bom_locked_at=NULL,bom_locked_by=NULL WHERE id IN (${placeholders(subjectIds)})`,
            subjectIds,
          );
        }
        await pool.execute(
          `DELETE FROM approval_actions WHERE instance_id IN (${leftoverMarks})`,
          leftoverIds,
        );
        await pool.execute(
          `DELETE FROM approval_instance_steps WHERE instance_id IN (${leftoverMarks})`,
          leftoverIds,
        );
        await pool.execute(
          `DELETE FROM approval_instances WHERE id IN (${leftoverMarks})`,
          leftoverIds,
        );
      }
      await pool.execute(
        `DELETE FROM approval_flow_steps WHERE flow_version_id IN (${marks})`,
        versionIds,
      );
      await pool.execute(
        'UPDATE approval_flow_definitions SET published_version_id=NULL WHERE id=?',
        [definition.id],
      );
      await pool.execute(`DELETE FROM approval_flow_versions WHERE id IN (${marks})`, versionIds);
    }
    await pool.execute('DELETE FROM approval_flow_definitions WHERE id=?', [definition.id]);
  }
  await pool.execute('DELETE FROM operation_logs WHERE request_id LIKE ?', [`${current.token}%`]);
  await pool.execute('DELETE FROM product_categories WHERE id IN (?,?)', [
    current.categoryId,
    current.materialCategoryId,
  ]);
  if (current.extraUserIds.length) {
    await pool.execute(
      `DELETE FROM user_roles WHERE user_id IN (${placeholders(current.extraUserIds)})`,
      current.extraUserIds,
    );
    await pool.execute(
      `DELETE FROM users WHERE id IN (${placeholders(current.extraUserIds)})`,
      current.extraUserIds,
    );
  }
  await pool.execute('DELETE FROM user_roles WHERE user_id IN (?,?,?,?)', [
    current.actorId,
    current.peerId,
    current.designatedId,
    current.outsiderId,
  ]);
  await pool.execute('DELETE FROM roles WHERE id IN (?,?)', [
    current.assignmentRoleId,
    current.qualificationRoleId,
  ]);
  await pool.execute('DELETE FROM users WHERE id IN (?,?,?,?)', [
    current.actorId,
    current.peerId,
    current.designatedId,
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

const insert = async (pool: Pool, sql: string, values: ExecuteValues[]): Promise<number> => {
  const [result] = await pool.execute<ResultSetHeader>(sql, values);
  return Number(result.insertId);
};

const placeholders = (values: readonly unknown[]): string => values.map(() => '?').join(',');

const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} for MySQL integration test`);
  return value;
};
