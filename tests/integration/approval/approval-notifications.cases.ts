import { expect, it } from 'vitest';
import {
  flushAfterCommit,
  notificationsFor,
  publishFlow,
  roleAssignee,
  userAssignee,
  createUser,
  createProduct,
  context,
  SCENE_CODE,
  notificationHookEvents,
  type ApprovalMysqlContext,
} from './approval-fixture.js';

export const registerApprovalNotificationCases = (getContext: () => ApprovalMysqlContext): void => {
  it('publishes node, final approval, and applicant notifications with real action and instance references', async () => {
    const { pool, fixture, approvals } = getContext();

    await publishFlow([
      roleAssignee('通知首级', fixture.assignmentRoleId),
      roleAssignee('通知末级', fixture.assignmentRoleId),
    ]);
    const product = await createProduct(pool, fixture, 'notification-lifecycle');
    const submitted = await approvals.submit(
      { sceneCode: SCENE_CODE, subjectId: String(product.productId), expectedVersion: 0 },
      context(fixture.actorId, 'notification-lifecycle-submit'),
    );
    await flushAfterCommit();

    const submittedAction = submitted.actions[0]!;
    const initial = (await notificationsFor(pool, submitted.id))[0]!;
    expect(initial).toMatchObject({
      eventType: 'approval_task_assigned',
      eventKey: `approval:${submittedAction.id}:approval_task_assigned:${submitted.steps[0]!.id}`,
      sourceType: 'approval_action',
      sourceId: submittedAction.id,
      targetType: 'approval_instance',
      targetId: submitted.id,
      actionId: submittedAction.id,
      actionInstanceId: submitted.id,
      actionType: 'submitted',
      recipientIds: [String(fixture.actorId), String(fixture.peerId)].sort(),
    });

    const first = await approvals.approve(
      submitted.id,
      { version: submitted.version, stepId: submitted.steps[0]!.id },
      context(fixture.actorId, 'notification-lifecycle-first'),
    );
    await flushAfterCommit();
    const firstAction = first.actions.at(-1)!;
    const afterFirst = await notificationsFor(pool, submitted.id);
    expect(afterFirst).toHaveLength(2);
    expect(afterFirst[1]).toMatchObject({
      eventType: 'approval_task_assigned',
      eventKey: `approval:${firstAction.id}:approval_task_assigned:${first.steps[1]!.id}`,
      sourceId: firstAction.id,
      targetId: submitted.id,
      actionId: firstAction.id,
      actionInstanceId: submitted.id,
      actionType: 'approved',
      recipientIds: [String(fixture.actorId), String(fixture.peerId)].sort(),
    });

    const final = await approvals.approve(
      submitted.id,
      { version: first.version, stepId: first.steps[1]!.id },
      context(fixture.actorId, 'notification-lifecycle-final'),
    );
    await flushAfterCommit();
    const finalAction = final.actions.at(-1)!;
    const facts = await notificationsFor(pool, submitted.id);
    expect(facts).toHaveLength(3);
    expect(facts[2]).toMatchObject({
      eventType: 'approval_approved',
      eventKey: `approval:${finalAction.id}:approval_approved`,
      sourceId: finalAction.id,
      targetId: submitted.id,
      actionId: finalAction.id,
      actionInstanceId: submitted.id,
      actionType: 'approved',
      recipientIds: [String(fixture.actorId)],
    });
    for (const fact of facts) {
      expect(fact.sourceId).toBe(fact.actionId);
      expect(fact.actionInstanceId).toBe(submitted.id);
      expect(fact.targetId).toBe(submitted.id);
    }
    expect(notificationHookEvents).toHaveLength(3);
  });

  it('publishes a rejection notification only to the applicant and references the rejected action', async () => {
    const { pool, fixture, approvals } = getContext();

    await publishFlow([roleAssignee('通知驳回节点', fixture.assignmentRoleId)]);
    const product = await createProduct(pool, fixture, 'notification-rejected');
    const submitted = await approvals.submit(
      { sceneCode: SCENE_CODE, subjectId: String(product.productId), expectedVersion: 0 },
      context(fixture.actorId, 'notification-rejected-submit'),
    );
    const rejected = await approvals.reject(
      submitted.id,
      { version: submitted.version, stepId: submitted.steps[0]!.id, comment: '请补充依据' },
      context(fixture.peerId, 'notification-rejected-decision'),
    );
    await flushAfterCommit();

    const rejectedAction = rejected.actions.at(-1)!;
    const facts = await notificationsFor(pool, submitted.id);
    expect(facts).toHaveLength(2);
    expect(facts[1]).toMatchObject({
      eventType: 'approval_rejected',
      eventKey: `approval:${rejectedAction.id}:approval_rejected`,
      sourceId: rejectedAction.id,
      targetId: submitted.id,
      actionId: rejectedAction.id,
      actionInstanceId: submitted.id,
      actionType: 'rejected',
      recipientIds: [String(fixture.actorId)],
    });
    expect(rejected.status).toBe('rejected');
  });

  it('does not backfill the first notification when a role member is added after submission', async () => {
    const { pool, fixture, approvals } = getContext();

    await publishFlow([
      roleAssignee('动态通知首级', fixture.assignmentRoleId),
      roleAssignee('动态通知后续', fixture.assignmentRoleId),
    ]);
    const product = await createProduct(pool, fixture, 'notification-dynamic');
    const submitted = await approvals.submit(
      { sceneCode: SCENE_CODE, subjectId: String(product.productId), expectedVersion: 0 },
      context(fixture.actorId, 'notification-dynamic-submit'),
    );
    const newMember = await createUser(
      pool,
      fixture.token,
      'notification-new-member',
      '新增通知审批人',
    );
    fixture.extraUserIds.push(newMember);
    await pool.execute('INSERT INTO user_roles (user_id,role_id) VALUES (?,?),(?,?)', [
      newMember,
      fixture.assignmentRoleId,
      newMember,
      fixture.qualificationRoleId,
    ]);
    try {
      const beforeActivation = (await notificationsFor(pool, submitted.id))[0]!;
      expect(beforeActivation.recipientIds).not.toContain(String(newMember));

      const first = await approvals.approve(
        submitted.id,
        { version: submitted.version, stepId: submitted.steps[0]!.id },
        context(fixture.actorId, 'notification-dynamic-first'),
      );
      await flushAfterCommit();
      const facts = await notificationsFor(pool, submitted.id);
      expect(facts).toHaveLength(2);
      expect(facts[1]!.recipientIds).toEqual(
        [String(fixture.actorId), String(fixture.peerId), String(newMember)].sort(),
      );
      expect(first.steps[1]!.status).toBe('pending');
    } finally {
      await pool.execute('DELETE FROM user_roles WHERE user_id=?', [newMember]);
    }
  });

  it('uses the current eligible set when withdrawing and does not reuse the original recipients', async () => {
    const { pool, fixture, approvals } = getContext();

    await publishFlow([
      roleAssignee('撤回通知首级', fixture.assignmentRoleId),
      roleAssignee('撤回通知后续', fixture.assignmentRoleId),
    ]);
    const product = await createProduct(pool, fixture, 'notification-withdrawn');
    const submitted = await approvals.submit(
      { sceneCode: SCENE_CODE, subjectId: String(product.productId), expectedVersion: 0 },
      context(fixture.actorId, 'notification-withdrawn-submit'),
    );
    await pool.execute('DELETE FROM user_roles WHERE role_id=? AND user_id<>?', [
      fixture.assignmentRoleId,
      fixture.actorId,
    ]);
    try {
      const withdrawn = await approvals.withdraw(
        submitted.id,
        { version: submitted.version, comment: '撤回申请' },
        context(fixture.actorId, 'notification-withdrawn-command'),
      );
      await flushAfterCommit();
      const withdrawnAction = withdrawn.actions.at(-1)!;
      const facts = await notificationsFor(pool, submitted.id);
      expect(facts).toHaveLength(2);
      expect(facts[0]!.recipientIds).toEqual(
        [String(fixture.actorId), String(fixture.peerId)].sort(),
      );
      expect(facts[1]).toMatchObject({
        eventType: 'approval_withdrawn',
        eventKey: `approval:${withdrawnAction.id}:approval_withdrawn`,
        sourceId: withdrawnAction.id,
        targetId: submitted.id,
        actionId: withdrawnAction.id,
        actionInstanceId: submitted.id,
        actionType: 'withdrawn',
        recipientIds: [String(fixture.actorId)],
      });
      expect(withdrawn.status).toBe('withdrawn');
    } finally {
      await pool.execute('INSERT IGNORE INTO user_roles (user_id,role_id) VALUES (?,?)', [
        fixture.peerId,
        fixture.assignmentRoleId,
      ]);
    }
  });

  it('keeps the previous approval pending when the activated next node has no eligible user and creates no empty notification', async () => {
    const { pool, fixture, approvals } = getContext();

    await publishFlow([
      roleAssignee('无人通知首级', fixture.assignmentRoleId),
      userAssignee('暂时停用后续', fixture.designatedId),
    ]);
    const product = await createProduct(pool, fixture, 'notification-no-next-user');
    const submitted = await approvals.submit(
      { sceneCode: SCENE_CODE, subjectId: String(product.productId), expectedVersion: 0 },
      context(fixture.actorId, 'notification-no-next-user-submit'),
    );
    await pool.execute('UPDATE users SET status=0 WHERE id=?', [fixture.designatedId]);
    try {
      const first = await approvals.approve(
        submitted.id,
        { version: submitted.version, stepId: submitted.steps[0]!.id },
        context(fixture.actorId, 'notification-no-next-user-first'),
      );
      await flushAfterCommit();
      const facts = await notificationsFor(pool, submitted.id);
      expect(facts).toHaveLength(1);
      expect(facts[0]!.eventType).toBe('approval_task_assigned');
      expect(first).toMatchObject({ status: 'pending', version: 1 });
      expect(first.steps[0]!.status).toBe('approved');
      expect(first.steps[1]!.status).toBe('blocked');
      expect(first.actions.map((action) => action.actionType)).toEqual(['submitted', 'approved']);
      expect(notificationHookEvents).toHaveLength(1);
    } finally {
      await pool.execute('UPDATE users SET status=1 WHERE id=?', [fixture.designatedId]);
    }
  });
};
