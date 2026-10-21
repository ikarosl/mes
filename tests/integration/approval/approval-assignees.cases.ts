import { expect, it } from 'vitest';
import { type RowDataPacket } from '../../../apps/api/node_modules/mysql2/promise.js';
import {
  publishFlow,
  roleAssignee,
  userAssignee,
  createProduct,
  insert,
  context,
  SCENE_CODE,
  type ApprovalMysqlContext,
} from './approval-fixture.js';

export const registerApprovalFlowVersionCases = (getContext: () => ApprovalMysqlContext): void => {
  it('uses one node execution record and keeps flow version fixed while a newer flow is published', async () => {
    const { pool, fixture, approvals } = getContext();

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
      assigneeSourceCode: null,
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
      assigneeSourceCode: null,
      roleId: String(fixture.assignmentRoleId),
      status: 'waiting',
    });
  });
};

export const registerApprovalAssigneeCases = (getContext: () => ApprovalMysqlContext): void => {
  it('resolves qualifications through all active roles and lets a newly added member decide an activated node', async () => {
    const { pool, fixture, identity, approvals } = getContext();

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
    const { pool, fixture, approvals } = getContext();

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
    const { pool, fixture, identity, approvals } = getContext();

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
      assigneeSourceCode: null,
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
    const { pool, fixture, approvals } = getContext();

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
};
