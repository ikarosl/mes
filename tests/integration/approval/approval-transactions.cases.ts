import { expect, it, vi } from 'vitest';
import { type RowDataPacket } from '../../../apps/api/node_modules/mysql2/promise.js';
import type { ApprovalInstanceDetail } from '../../../packages/contracts/src/index.js';
import { ApprovalSubjectError } from '../../../apps/api/src/modules/approval/public.js';
import {
  flushAfterCommit,
  notificationsFor,
  notificationCountForActor,
  publishFlow,
  roleAssignee,
  userAssignee,
  createProduct,
  productState,
  context,
  SCENE_CODE,
  notificationHookEvents,
  notificationServiceRef,
  type ApprovalMysqlContext,
} from './approval-fixture.js';

export const registerApprovalNotificationRollbackCases = (
  getContext: () => ApprovalMysqlContext,
): void => {
  it('rolls back approval, Product, actions, audit, and notification hook when publishing fails', async () => {
    const { pool, fixture, approvals } = getContext();

    await publishFlow([roleAssignee('通知失败节点', fixture.assignmentRoleId)]);
    const product = await createProduct(pool, fixture, 'notification-failure');
    const submitted = await approvals.submit(
      { sceneCode: SCENE_CODE, subjectId: String(product.productId), expectedVersion: 0 },
      context(fixture.actorId, 'notification-failure-submit'),
    );
    await flushAfterCommit();
    const beforeFailure = await notificationsFor(pool, submitted.id);
    if (!notificationServiceRef) throw new Error('notification service is not initialized');
    const publish = vi
      .spyOn(notificationServiceRef, 'publish')
      .mockRejectedValueOnce(new Error('injected notification failure'));
    try {
      await expect(
        approvals.approve(
          submitted.id,
          { version: submitted.version, stepId: submitted.steps[0]!.id },
          context(fixture.actorId, 'notification-failure-approve'),
        ),
      ).rejects.toThrow('injected notification failure');
    } finally {
      publish.mockRestore();
    }
    await flushAfterCommit();

    const afterFailure = await approvals.getInstance(submitted.id, String(fixture.actorId), true);
    expect(afterFailure).toMatchObject({ status: 'pending', version: submitted.version });
    expect(afterFailure.steps[0]!.status).toBe('pending');
    expect(afterFailure.actions.map((action) => action.actionType)).toEqual(['submitted']);
    expect(await productState(pool, product.productId)).toMatchObject({
      bom_status: 'pending_approval',
      version: 1,
    });
    expect(await notificationsFor(pool, submitted.id)).toEqual(beforeFailure);
    expect(notificationHookEvents).toHaveLength(1);
    const [[audit]] = await pool.query<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) total FROM operation_logs WHERE request_id=?',
      [`${fixture.token}-notification-failure-approve`],
    );
    expect(Number(audit.total)).toBe(0);
  });
};

export const registerApprovalDecisionTransactionCases = (
  getContext: () => ApprovalMysqlContext,
): void => {
  it('records exactly one decision when two qualified users decide the same node concurrently', async () => {
    const { pool, fixture, approvals } = getContext();

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
    const { pool, fixture, approvals } = getContext();

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
    await flushAfterCommit();
    const notificationsAfterFailure = await notificationsFor(pool, submitted.id);
    expect(notificationsAfterFailure).toHaveLength(2);
    expect(notificationsAfterFailure.map((notification) => notification.eventType)).toEqual([
      'approval_task_assigned',
      'approval_task_assigned',
    ]);
    expect(notificationHookEvents).toHaveLength(2);
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
    const { pool, fixture, products, approvals } = getContext();

    await publishFlow([
      roleAssignee('冻结首级', fixture.assignmentRoleId),
      roleAssignee('冻结末级', fixture.assignmentRoleId),
    ]);
    const product = await createProduct(pool, fixture, 'freeze');
    const submitted = await approvals.submit(
      { sceneCode: SCENE_CODE, subjectId: String(product.productId), expectedVersion: 0 },
      context(fixture.actorId, 'freeze-submit'),
    );
    const snapshot = submitted.subjectSnapshot;
    if (!('materials' in snapshot)) throw new Error('Expected BOM approval evidence');
    expect(snapshot.materials[0]).not.toHaveProperty('isKeyMaterial');
    expect(snapshot.materials[0]).not.toHaveProperty('needBatchRecord');
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
    const { pool, fixture, approvals, bomHandler } = getContext();

    await publishFlow([roleAssignee('绑定回滚', fixture.assignmentRoleId)]);
    const product = await createProduct(pool, fixture, 'bind-rollback');
    const notificationsBefore = await notificationCountForActor(pool, fixture.actorId);
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
    await flushAfterCommit();
    expect(await notificationCountForActor(pool, fixture.actorId)).toBe(notificationsBefore);
    expect(notificationHookEvents).toHaveLength(0);
  });

  it('serializes withdrawal against final approval and leaves one terminal decision with matching BOM state', async () => {
    const { pool, fixture, approvals } = getContext();

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
};
