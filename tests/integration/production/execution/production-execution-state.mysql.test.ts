import { loadWorkspaceEnv } from '../../../../packages/config/src/index.js';
import type { RowDataPacket } from '../../../../apps/api/node_modules/mysql2/promise.js';
import { describe, expect, it } from 'vitest';
import {
  setupProductionExecutionSuite,
  createFixture,
  cleanup,
  context,
  auditCount,
  completeRequiredSteps,
} from './production-execution-fixture.js';

loadWorkspaceEnv();
const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;

describeMysql('Production execution MySQL transactions', () => {
  const getContext = setupProductionExecutionSuite();

  it('requires administrator batch start before a worker starts the first step', async () => {
    const { pool, repository } = getContext();
    const fixture = await createFixture(pool, repository, 'start', { autoStart: false });
    try {
      const assigned = await repository.assignStep(
        String(fixture.batchId),
        String(fixture.firstStepRecordId),
        String(fixture.workerId),
        0,
        context(fixture.actorId, `${fixture.token}-assign`),
      );
      expect(assigned).toMatchObject({ stepStatus: 'assigned', version: 1 });
      await expect(
        repository.startStep(
          String(fixture.batchId),
          String(fixture.firstStepRecordId),
          1,
          context(fixture.workerId, `${fixture.token}-premature-start`),
        ),
      ).rejects.toMatchObject({ code: 'STEP_START_NOT_ALLOWED' });
      const [[beforeStart]] = await pool.query<
        (RowDataPacket & { status: string; started_at: Date | null; started_by: number | null })[]
      >('SELECT status,started_at,started_by FROM production_batches WHERE id=?', [
        fixture.batchId,
      ]);
      expect(beforeStart).toMatchObject({
        status: 'material_outbound',
        started_at: null,
        started_by: null,
      });
      expect(
        await auditCount(pool, `${fixture.token}-premature-start`, 'production-step.start'),
      ).toBe(0);

      const startCheck = await repository.getStartCheck(String(fixture.batchId));
      expect(startCheck).toMatchObject({
        batchStatus: 'material_outbound',
        version: 0,
        hasInitialMaterialConfiguration: true,
        hasMaterialShortage: false,
        requiresReason: false,
        canStart: true,
      });
      const startedTask = await repository.startExecution(
        String(fixture.batchId),
        { version: startCheck.version },
        context(fixture.actorId, `${fixture.token}-admin-start`),
      );
      expect(startedTask).toMatchObject({ batchStatus: 'doing', version: 1, startReason: null });

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
        (RowDataPacket & {
          batch_started_at: Date | null;
          batch_started_by: number | null;
          batch_start_reason: string | null;
          batch_start_material_snapshot: unknown;
          step_started_at: Date | null;
          work_order_status: string;
        })[]
      >(
        `SELECT b.started_at batch_started_at,b.started_by batch_started_by,
         b.start_reason batch_start_reason,b.start_material_snapshot batch_start_material_snapshot,
         s.started_at step_started_at,wo.status work_order_status
         FROM production_batches b
         JOIN batch_step_records s ON s.production_batch_id=b.id
         JOIN work_orders wo ON wo.id=b.work_order_id
         WHERE b.id=? AND s.id=?`,
        [fixture.batchId, fixture.firstStepRecordId],
      );
      expect(row?.batch_started_at).not.toBeNull();
      expect(row?.batch_started_by).toBe(fixture.actorId);
      expect(row?.batch_start_reason).toBeNull();
      expect(row?.batch_start_material_snapshot).not.toBeNull();
      expect(row?.step_started_at).not.toBeNull();
      expect(row?.work_order_status).toBe('doing');
      expect(
        await auditCount(pool, `${fixture.token}-admin-start`, 'production-execution.start'),
      ).toBe(1);
      expect(await auditCount(pool, `${fixture.token}-start`, 'production-step.start')).toBe(1);
    } finally {
      await cleanup(pool, fixture);
    }
  });

  it('rejects a non-assignee without changing state or writing success audit', async () => {
    const { pool, repository } = getContext();
    const fixture = await createFixture(pool, repository, 'actor');
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

  it('serializes competing assignments and preserves one responsible employee', async () => {
    const { pool, repository } = getContext();
    const fixture = await createFixture(pool, repository, 'race');
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
    const { pool, repository } = getContext();
    const fixture = await createFixture(pool, repository, 'audit-rollback');
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

  it('completes execution after every required step is explicitly completed and naturally replays', async () => {
    const { pool, repository, reporting } = getContext();
    const fixture = await createFixture(pool, repository, 'complete');
    try {
      await completeRequiredSteps(repository, reporting, fixture);
      const check = await repository.getCompletionCheck(String(fixture.batchId));
      expect(check).toMatchObject({
        canComplete: true,
        requiredStepCount: 2,
        completedRequiredStepCount: 2,
        finalRequiredStepId: String(fixture.secondStepRecordId),
        finalEffectiveNormalQuantity: '10.0000',
        version: 1,
      });

      const result = await repository.completeExecution(
        String(fixture.batchId),
        1,
        context(fixture.actorId, `${fixture.token}-complete`),
      );
      const replay = await repository.completeExecution(
        String(fixture.batchId),
        1,
        context(fixture.actorId, `${fixture.token}-complete-replay`),
      );
      expect(replay).toEqual(result);
      expect(result).toMatchObject({
        batchStatus: 'completed',
        completedQuantity: '10.0000',
        completedById: String(fixture.actorId),
        version: 2,
      });
      const [[batch]] = await pool.query<
        (RowDataPacket & { completed_quantity: string; qualified_quantity: string })[]
      >('SELECT completed_quantity,qualified_quantity FROM production_batches WHERE id=?', [
        fixture.batchId,
      ]);
      expect(batch).toMatchObject({
        completed_quantity: '10.0000',
        qualified_quantity: '0.0000',
      });
      expect(
        await auditCount(pool, `${fixture.token}-complete`, 'production-execution.complete'),
      ).toBe(1);
      expect(
        await auditCount(pool, `${fixture.token}-complete-replay`, 'production-execution.complete'),
      ).toBe(0);
    } finally {
      await cleanup(pool, fixture);
    }
  });

  it('rejects incomplete execution and rolls back completion if success audit fails', async () => {
    const { pool, repository, reporting } = getContext();
    const incomplete = await createFixture(pool, repository, 'complete-incomplete');
    try {
      const check = await repository.getCompletionCheck(String(incomplete.batchId));
      expect(check).toMatchObject({
        canComplete: false,
        blockers: expect.arrayContaining(['required_step_incomplete']),
      });
      await expect(
        repository.completeExecution(
          String(incomplete.batchId),
          { version: check.version, closeoutVersion: check.closeoutVersion },
          context(incomplete.actorId, `${incomplete.token}-blocked`),
        ),
      ).rejects.toMatchObject({ code: 'REQUIRED_STEP_INCOMPLETE' });
      expect(
        await auditCount(pool, `${incomplete.token}-blocked`, 'production-execution.complete'),
      ).toBe(0);
    } finally {
      await cleanup(pool, incomplete);
    }

    const rollback = await createFixture(pool, repository, 'complete-audit-rollback');
    try {
      await completeRequiredSteps(repository, reporting, rollback);
      await expect(
        repository.completeExecution(
          String(rollback.batchId),
          1,
          context(rollback.actorId, 'x'.repeat(500)),
        ),
      ).rejects.toBeDefined();
      const [[batch]] = await pool.query<
        (RowDataPacket & {
          status: string;
          completed_quantity: string;
          completed_at: Date | null;
        })[]
      >('SELECT status,completed_quantity,completed_at FROM production_batches WHERE id=?', [
        rollback.batchId,
      ]);
      expect(batch).toMatchObject({
        status: 'doing',
        completed_quantity: '0.0000',
        completed_at: null,
      });
    } finally {
      await cleanup(pool, rollback);
    }
  });
});
