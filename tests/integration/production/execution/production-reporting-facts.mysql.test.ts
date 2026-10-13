import { loadWorkspaceEnv } from '../../../../packages/config/src/index.js';
import type { RowDataPacket } from '../../../../apps/api/node_modules/mysql2/promise.js';
import { describe, expect, it } from 'vitest';
import {
  setupProductionExecutionSuite,
  createFixture,
  cleanup,
  context,
  idempotentContext,
  auditCount,
} from './production-execution-fixture.js';

loadWorkspaceEnv();
const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;

describeMysql('Production execution MySQL transactions', () => {
  const getContext = setupProductionExecutionSuite();

  it('records split reports, creates pending abnormal disposition and consumes the unified report limit', async () => {
    const { pool, repository, reporting } = getContext();
    const fixture = await createFixture(pool, repository, 'report');
    try {
      await repository.assignStep(
        String(fixture.batchId),
        String(fixture.firstStepRecordId),
        String(fixture.workerId),
        0,
        context(fixture.actorId, `${fixture.token}-assign`),
      );
      await repository.startStep(
        String(fixture.batchId),
        String(fixture.firstStepRecordId),
        1,
        context(fixture.workerId, `${fixture.token}-start`),
      );
      await reporting.createReport(
        String(fixture.batchId),
        String(fixture.firstStepRecordId),
        { version: 2, normalQuantity: 4, abnormalQuantity: 0, remark: 'normal split' },
        context(fixture.workerId, `${fixture.token}-report-normal`),
      );
      const first = await reporting.createReport(
        String(fixture.batchId),
        String(fixture.firstStepRecordId),
        {
          version: 3,
          normalQuantity: 0,
          abnormalQuantity: 1,
          abnormalOrigin: 'current_step',
          remark: 'abnormal split',
        },
        context(fixture.workerId, `${fixture.token}-report-abnormal`),
      );
      expect(first).toMatchObject({ stepStatus: 'doing', effectiveNormalQuantity: '4.0000' });
      expect(first.abnormalDisposition).toMatchObject({ reviewStatus: 'pending_review' });
      const second = await reporting.createReport(
        String(fixture.batchId),
        String(fixture.firstStepRecordId),
        { version: 4, normalQuantity: 5, abnormalQuantity: 0, remark: null },
        context(fixture.workerId, `${fixture.token}-report-2`),
      );
      expect(second).toMatchObject({
        stepStatus: 'doing',
        effectiveReportedQuantity: '10.0000',
        effectiveNormalQuantity: '9.0000',
        effectiveAbnormalQuantity: '1.0000',
        availableReportQuantity: '0.0000',
      });
      const summaries = await reporting.listExecutionBatches({
        keyword: fixture.token,
        page: 1,
        pageSize: 20,
      });
      expect(summaries).toMatchObject({
        total: 1,
        items: [
          {
            id: String(fixture.batchId),
            completedStepCount: 0,
            totalStepCount: 2,
            effectiveAbnormalQuantity: '1.0000',
            pendingAbnormalCount: 1,
          },
        ],
      });
      await expect(
        reporting.createReport(
          String(fixture.batchId),
          String(fixture.firstStepRecordId),
          { version: 5, normalQuantity: 1, abnormalQuantity: 0, remark: null },
          context(fixture.workerId, `${fixture.token}-report-over-capacity`),
        ),
      ).rejects.toMatchObject({ code: 'STEP_REPORT_QUANTITY_EXCEEDED' });
      expect(
        await auditCount(pool, `${fixture.token}-report-2`, 'production-step-report.create'),
      ).toBe(1);
    } finally {
      await cleanup(pool, fixture);
    }
  });

  it('closes a source-bound rework as separate immutable result reports in one transaction', async () => {
    const { pool, repository, reporting, abnormal } = getContext();
    const fixture = await createFixture(pool, repository, 'rework');
    try {
      await repository.assignStep(
        String(fixture.batchId),
        String(fixture.firstStepRecordId),
        String(fixture.workerId),
        0,
        context(fixture.actorId, `${fixture.token}-assign`),
      );
      await repository.startStep(
        String(fixture.batchId),
        String(fixture.firstStepRecordId),
        1,
        context(fixture.workerId, `${fixture.token}-start`),
      );
      await reporting.createReport(
        String(fixture.batchId),
        String(fixture.firstStepRecordId),
        { version: 2, normalQuantity: 8, abnormalQuantity: 0, remark: 'source normal' },
        context(fixture.workerId, `${fixture.token}-source-normal-report`),
      );
      const source = await reporting.createReport(
        String(fixture.batchId),
        String(fixture.firstStepRecordId),
        {
          version: 3,
          normalQuantity: 0,
          abnormalQuantity: 2,
          abnormalOrigin: 'current_step',
          remark: 'source abnormal',
        },
        context(fixture.workerId, `${fixture.token}-source-abnormal-report`),
      );
      const dispositionId = source.abnormalDisposition?.dispositionId;
      expect(dispositionId).toBeDefined();

      const approved = await abnormal.approveRework(
        dispositionId!,
        { version: 0, remark: 'repair it' },
        context(fixture.actorId, `${fixture.token}-approve`),
      );
      expect(approved).toMatchObject({
        sourceReportId: source.report.reportId,
        responsibleUserId: String(fixture.workerId),
        reworkQuantity: '2.0000',
        status: 'pending',
      });
      const started = await abnormal.startRework(
        approved.reworkId,
        approved.version,
        context(fixture.actorId, `${fixture.token}-rework-start`),
      );
      const completed = await abnormal.completeRework(
        approved.reworkId,
        { version: started.version, normalQuantity: 2, abnormalQuantity: 0, remark: 'repaired' },
        context(fixture.actorId, `${fixture.token}-rework-complete`),
      );
      expect(completed).toMatchObject({
        rework: { status: 'completed' },
        normalReport: {
          normalQuantity: '2.0000',
          abnormalQuantity: '0.0000',
          reportType: 'normal',
        },
        abnormalReport: null,
        abnormalDisposition: null,
      });
      expect(completed.rework.completedNormalReportId).toBe(completed.normalReport!.reportId);
      expect(completed.rework.completedAbnormalReportId).toBeNull();

      await expect(
        reporting.correctReport(
          String(fixture.batchId),
          String(fixture.firstStepRecordId),
          completed.normalReport!.reportId,
          { version: 5, normalQuantity: 1, reason: 'must use rework flow' },
          context(fixture.actorId, `${fixture.token}-forbidden-correction`),
        ),
      ).rejects.toMatchObject({ code: 'STEP_REPORT_DEPENDENCY_CONFLICT' });
      expect(
        await auditCount(pool, `${fixture.token}-rework-complete`, 'production-rework.complete'),
      ).toBe(1);
    } finally {
      await cleanup(pool, fixture);
    }
  });

  it('corrects a normal report without changing an explicitly completed step', async () => {
    const { pool, repository, reporting } = getContext();
    const fixture = await createFixture(pool, repository, 'correct');
    try {
      await repository.assignStep(
        String(fixture.batchId),
        String(fixture.firstStepRecordId),
        String(fixture.workerId),
        0,
        context(fixture.actorId, `${fixture.token}-assign`),
      );
      await repository.startStep(
        String(fixture.batchId),
        String(fixture.firstStepRecordId),
        1,
        context(fixture.workerId, `${fixture.token}-start`),
      );
      const original = await reporting.createReport(
        String(fixture.batchId),
        String(fixture.firstStepRecordId),
        { version: 2, normalQuantity: 10, abnormalQuantity: 0, remark: null },
        context(fixture.workerId, `${fixture.token}-report`),
      );
      const completedStep = await repository.completeStep(
        String(fixture.batchId),
        String(fixture.firstStepRecordId),
        3,
        context(fixture.actorId, `${fixture.token}-complete-step`),
        true,
      );
      const corrected = await reporting.correctReport(
        String(fixture.batchId),
        String(fixture.firstStepRecordId),
        original.report.reportId,
        { version: completedStep.version, normalQuantity: 9, reason: '数量录入更正' },
        context(fixture.actorId, `${fixture.token}-correct`),
      );
      expect(corrected).toMatchObject({
        stepStatus: 'completed',
        effectiveNormalQuantity: '9.0000',
      });
      expect(corrected.reversal.reversalOfReportId).toBe(original.report.reportId);
      expect(corrected.replacement.correctionOfReportId).toBe(original.report.reportId);
      const [[count]] = await pool.query<(RowDataPacket & { count: number })[]>(
        'SELECT COUNT(*) count FROM batch_step_reports WHERE batch_step_record_id=?',
        [fixture.firstStepRecordId],
      );
      expect(Number(count?.count)).toBe(3);
    } finally {
      await cleanup(pool, fixture);
    }
  });

  it('serializes concurrent reports with the same step version', async () => {
    const { pool, repository, reporting } = getContext();
    const fixture = await createFixture(pool, repository, 'report-race');
    try {
      await repository.assignStep(
        String(fixture.batchId),
        String(fixture.firstStepRecordId),
        String(fixture.workerId),
        0,
        context(fixture.actorId, `${fixture.token}-assign`),
      );
      await repository.startStep(
        String(fixture.batchId),
        String(fixture.firstStepRecordId),
        1,
        context(fixture.workerId, `${fixture.token}-start`),
      );
      const results = await Promise.allSettled([
        reporting.createReport(
          String(fixture.batchId),
          String(fixture.firstStepRecordId),
          { version: 2, normalQuantity: 6, abnormalQuantity: 0 },
          context(fixture.workerId, `${fixture.token}-race-a`),
        ),
        reporting.createReport(
          String(fixture.batchId),
          String(fixture.firstStepRecordId),
          { version: 2, normalQuantity: 6, abnormalQuantity: 0 },
          context(fixture.workerId, `${fixture.token}-race-b`),
        ),
      ]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    } finally {
      await cleanup(pool, fixture);
    }
  });

  it('replays report creation and correction without duplicating immutable facts', async () => {
    const { pool, repository, reporting, reportingService } = getContext();
    const fixture = await createFixture(pool, repository, 'report-idempotency');
    try {
      await repository.assignStep(
        String(fixture.batchId),
        String(fixture.firstStepRecordId),
        String(fixture.workerId),
        0,
        context(fixture.actorId, `${fixture.token}-assign`),
      );
      await repository.startStep(
        String(fixture.batchId),
        String(fixture.firstStepRecordId),
        1,
        context(fixture.workerId, `${fixture.token}-start`),
      );
      const createPayload = { version: 2, normalQuantity: 4, abnormalQuantity: 0, remark: null };
      const createKey = `${fixture.token}-create-key`;
      const first = await reportingService.createReport(
        String(fixture.batchId),
        String(fixture.firstStepRecordId),
        createPayload,
        idempotentContext(fixture.workerId, `${fixture.token}-create-first`, createKey),
      );
      const replay = await reportingService.createReport(
        String(fixture.batchId),
        String(fixture.firstStepRecordId),
        createPayload,
        idempotentContext(fixture.workerId, `${fixture.token}-create-replay`, createKey),
      );
      expect(replay).toEqual(first);
      await expect(
        reportingService.createReport(
          String(fixture.batchId),
          String(fixture.firstStepRecordId),
          { ...createPayload, normalQuantity: 3 },
          idempotentContext(fixture.workerId, `${fixture.token}-create-conflict`, createKey),
        ),
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });

      await reporting.createReport(
        String(fixture.batchId),
        String(fixture.firstStepRecordId),
        { version: 3, normalQuantity: 6, abnormalQuantity: 0 },
        context(fixture.workerId, `${fixture.token}-complete`),
      );
      const correctionPayload = {
        version: 4,
        normalQuantity: 3,
        reason: '响应丢失重试',
      };
      const correctionKey = `${fixture.token}-correct-key`;
      const corrected = await reportingService.correctReport(
        String(fixture.batchId),
        String(fixture.firstStepRecordId),
        first.report.reportId,
        correctionPayload,
        idempotentContext(fixture.actorId, `${fixture.token}-correct-first`, correctionKey),
      );
      const correctedReplay = await reportingService.correctReport(
        String(fixture.batchId),
        String(fixture.firstStepRecordId),
        first.report.reportId,
        correctionPayload,
        idempotentContext(fixture.actorId, `${fixture.token}-correct-replay`, correctionKey),
      );
      expect(correctedReplay).toEqual(corrected);
      const [[count]] = await pool.query<(RowDataPacket & { count: number })[]>(
        'SELECT COUNT(*) count FROM batch_step_reports WHERE batch_step_record_id=?',
        [fixture.firstStepRecordId],
      );
      expect(Number(count?.count)).toBe(4);
    } finally {
      await cleanup(pool, fixture);
    }
  });
});
