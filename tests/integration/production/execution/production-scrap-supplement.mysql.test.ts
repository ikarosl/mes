import { loadWorkspaceEnv } from '../../../../packages/config/src/index.js';
import type { RowDataPacket } from '../../../../apps/api/node_modules/mysql2/promise.js';
import { describe, expect, it } from 'vitest';
import {
  setupProductionExecutionSuite,
  createFixture,
  cleanup,
  context,
  auditCount,
  insert,
} from './production-execution-fixture.js';

loadWorkspaceEnv();
const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;

describeMysql('Production execution MySQL transactions', () => {
  const getContext = setupProductionExecutionSuite();

  it('keeps a scrap supplement non-allocatable until confirmation and activates its quota after outbound', async () => {
    const { pool, repository, reporting, supplement, materials, outbounds, supplementService } =
      getContext();
    const fixture = await createFixture(pool, repository, 'scrap-supplement');
    try {
      await repository.assignStep(
        String(fixture.batchId),
        String(fixture.firstStepRecordId),
        String(fixture.workerId),
        0,
        context(fixture.actorId, `${fixture.token}-assign`),
      );
      await repository.assignStep(
        String(fixture.batchId),
        String(fixture.secondStepRecordId),
        String(fixture.workerId),
        0,
        context(fixture.actorId, `${fixture.token}-assign-second`),
      );
      await repository.startStep(
        String(fixture.batchId),
        String(fixture.firstStepRecordId),
        1,
        context(fixture.workerId, `${fixture.token}-start`),
      );
      await repository.startStep(
        String(fixture.batchId),
        String(fixture.secondStepRecordId),
        1,
        context(fixture.workerId, `${fixture.token}-start-second`),
      );
      await reporting.createReport(
        String(fixture.batchId),
        String(fixture.secondStepRecordId),
        { version: 2, normalQuantity: 8, abnormalQuantity: 0, remark: 'scrap source normal' },
        context(fixture.workerId, `${fixture.token}-source-normal-report`),
        {
          actorId: String(fixture.workerId),
          canManageExecution: false,
          canReport: true,
          canReadAllReports: false,
        },
      );
      const source = await reporting.createReport(
        String(fixture.batchId),
        String(fixture.secondStepRecordId),
        {
          version: 3,
          normalQuantity: 0,
          abnormalQuantity: 2,
          abnormalOrigin: 'current_step',
          remark: 'scrap source abnormal',
        },
        context(fixture.workerId, `${fixture.token}-source-abnormal-report`),
        {
          actorId: String(fixture.workerId),
          canManageExecution: false,
          canReport: true,
          canReadAllReports: false,
        },
      );
      const dispositionId = source.abnormalDisposition!.dispositionId;
      expect((await supplement.getCandidateContext(dispositionId)).candidates).toMatchObject([
        {
          originalDemandId: String(fixture.demandId),
          productMaterialId: String(fixture.productMaterialId),
          requirementBasisId: String(fixture.requirementBasisId),
          itemCode: 'EXEC-MATERIAL',
          itemName: 'Execution material',
          materialVariantId: String(fixture.materialVariantId),
          materialVariantCode: `${fixture.token}-m-v1-A`,
          variants: [
            expect.objectContaining({
              id: String(fixture.materialVariantId),
              variantCode: `${fixture.token}-m-v1-A`,
            }),
          ],
        },
      ]);

      const draft = await supplement.savePlan(
        dispositionId,
        {
          planVersion: null,
          dispositionVersion: 0,
          details: [
            {
              originalDemandId: String(fixture.demandId),
              requirementBasisId: String(fixture.requirementBasisId),
              materialVariantId: String(fixture.materialVariantId),
              supplementQuantity: 1,
            },
          ],
          remark: 'manual quantity',
        },
        context(fixture.actorId, `${fixture.token}-save-plan`),
      );
      expect(draft).toMatchObject({
        status: 'draft',
        version: 0,
        lines: [
          {
            plannedQuantity: '1',
            itemCode: 'EXEC-MATERIAL',
            itemName: 'Execution material',
            materialVariantId: String(fixture.materialVariantId),
            materialVariantCode: `${fixture.token}-m-v1-A`,
          },
        ],
      });
      const [[draftCount]] = await pool.query<(RowDataPacket & { count: number })[]>(
        "SELECT COUNT(*) count FROM production_scrap_supplement_plan WHERE id=? AND status='draft'",
        [draft.planId],
      );
      expect(draftCount?.count).toBe(1);
      const [[formalBeforeConfirm]] = await pool.query<(RowDataPacket & { count: number })[]>(
        "SELECT COUNT(*) count FROM production_item_demand WHERE production_batch_id=? AND demand_type='scrap_supplement'",
        [fixture.batchId],
      );
      expect(formalBeforeConfirm?.count).toBe(0);
      // 草稿只存在于方案表，物料分配/出库查询都发现不了草稿内容。
      const visibleDemands = await materials.listDemands(String(fixture.batchId));
      expect(visibleDemands).toHaveLength(1);
      expect(visibleDemands[0]).toMatchObject({
        demandId: String(fixture.demandId),
        demandType: 'normal',
      });
      expect(await outbounds.listOutboundCandidates(String(fixture.batchId))).toEqual([]);

      const edited = await supplement.savePlan(
        dispositionId,
        {
          planVersion: draft.version,
          dispositionVersion: 0,
          details: [
            {
              originalDemandId: String(fixture.demandId),
              requirementBasisId: String(fixture.requirementBasisId),
              materialVariantId: String(fixture.materialVariantId),
              supplementQuantity: 2,
            },
          ],
          remark: 'edited quantity',
        },
        context(fixture.actorId, `${fixture.token}-edit-plan`),
      );
      expect(edited.version).toBe(1);
      await expect(
        supplement.savePlan(
          dispositionId,
          {
            planVersion: draft.version,
            dispositionVersion: 0,
            details: [
              {
                originalDemandId: String(fixture.demandId),
                requirementBasisId: String(fixture.requirementBasisId),
                materialVariantId: String(fixture.materialVariantId),
                supplementQuantity: 3,
              },
            ],
          },
          context(fixture.actorId, `${fixture.token}-stale-plan`),
        ),
      ).rejects.toMatchObject({ code: 'CONCURRENT_MODIFICATION' });

      const confirmContext = context(fixture.actorId, `${fixture.token}-confirm-plan`);
      const result = await supplementService.confirmPlan(
        dispositionId,
        {
          version: edited.version,
          dispositionVersion: 0,
        },
        { ...confirmContext, idempotencyKey: `${fixture.token}-confirm-key` },
      );
      expect(result).toMatchObject({
        disposition: { reviewStatus: 'approved', dispositionType: 'scrap' },
        scrapRecord: { scrapQuantity: '2' },
        reproductionAuthorization: {
          entryStepRecordId: String(fixture.firstStepRecordId),
          quotaEndStepRecordId: String(fixture.secondStepRecordId),
          authorizedQuantity: '2',
        },
        supplement: {
          status: 'approved',
          demands: [
            {
              originalDemandId: String(fixture.demandId),
              requirementBasisId: String(fixture.requirementBasisId),
              itemCode: 'EXEC-MATERIAL',
              itemName: 'Execution material',
              materialVariantId: String(fixture.materialVariantId),
              materialVariantCode: `${fixture.token}-m-v1-A`,
              supplementQuantity: '2',
            },
          ],
        },
      });
      const [[demand]] = await pool.query<
        (RowDataPacket & {
          demand_type: string;
          need_number: number;
          parent_demand_id: number;
          supplement_id: number;
          generation_group_key: string;
          requirement_basis_id: number;
          material_variant_id: number;
          material_variant_code_snapshot: string;
          item_id: number;
          item_code_snapshot: string;
        })[]
      >(
        "SELECT demand_type,need_number,parent_demand_id,supplement_id,generation_group_key,requirement_basis_id,material_variant_id,material_variant_code_snapshot,item_id,item_code_snapshot FROM production_item_demand WHERE production_batch_id=? AND demand_type='scrap_supplement'",
        [fixture.batchId],
      );
      expect(demand).toMatchObject({
        demand_type: 'scrap_supplement',
        need_number: 2,
        parent_demand_id: fixture.demandId,
        requirement_basis_id: fixture.requirementBasisId,
        material_variant_id: fixture.materialVariantId,
        material_variant_code_snapshot: `${fixture.token}-m-v1-A`,
        item_id: fixture.materialId,
        item_code_snapshot: 'EXEC-MATERIAL',
      });
      expect(demand?.supplement_id).toBeGreaterThan(0);
      expect(demand?.generation_group_key).toBe(`SCRAPSUP:${demand.supplement_id}`);
      expect(
        await auditCount(
          pool,
          `${fixture.token}-confirm-plan`,
          'production-abnormal.confirm-scrap-supplement-plan',
        ),
      ).toBe(1);
      const [[confirmedPlan]] = await pool.query<
        (RowDataPacket & { status: string; confirmed_supplement_id: number | null })[]
      >('SELECT status,confirmed_supplement_id FROM production_scrap_supplement_plan WHERE id=?', [
        edited.planId,
      ]);
      expect(confirmedPlan).toMatchObject({ status: 'confirmed' });
      expect(confirmedPlan?.confirmed_supplement_id).toBeGreaterThan(0);

      const beforeOutbound = await reporting.getBatchExecution(String(fixture.batchId), {
        actorId: String(fixture.actorId),
        canManageExecution: true,
        canReport: false,
        canReadAllReports: true,
      });
      expect(beforeOutbound.steps[0]).toMatchObject({
        upperLimitQuantity: '10',
        requiredNormalQuantity: '10',
        activatedSupplementInputQuantity: '0',
        activatedSupplementTargetQuantity: '0',
        pendingSupplementInputQuantity: '2',
        supplementSources: [expect.objectContaining({ status: 'pending_material' })],
      });
      expect(beforeOutbound.steps[1]).toMatchObject({
        upperLimitQuantity: '10',
        requiredNormalQuantity: '10',
        activatedSupplementInputQuantity: '0',
        pendingSupplementInputQuantity: '2',
        supplementSources: [expect.objectContaining({ status: 'pending_material' })],
      });

      const itemBatchId = await insert(
        pool,
        "INSERT INTO item_batch (item_id,material_variant_id,item_code_snapshot,material_variant_code_snapshot,unit_snapshot,batch_code,source_type,created_by,updated_by) VALUES (?,?,?,?,'kg',?,'purchased',?,?)",
        [
          fixture.materialId,
          fixture.materialVariantId,
          `${fixture.token}-m`,
          `${fixture.token}-m-v1-A`,
          `${fixture.token}-supplement-stock`,
          fixture.actorId,
          fixture.actorId,
        ],
      );
      await pool.execute(
        "INSERT INTO inventory_transaction (item_id,material_variant_id,batch_id,transaction_type,quantity,unit_snapshot,stock_status,reference_type,reference_detail_id,idempotency_key,created_by) VALUES (?,?,?,'purchase_inbound',2,'kg','available','manual',0,?,?)",
        [
          fixture.materialId,
          fixture.materialVariantId,
          itemBatchId,
          `${fixture.token}-supplement-stock`,
          fixture.actorId,
        ],
      );
      const supplementDemandId = result.supplement.demands[0]!.demandId;
      const allocation = await materials.createAllocations(
        String(fixture.batchId),
        {
          allocations: [
            {
              demandId: supplementDemandId,
              itemBatchId: String(itemBatchId),
              assignedQuantity: 2,
            },
          ],
        },
        context(fixture.actorId, `${fixture.token}-supplement-allocate`),
      );
      const outbound = await outbounds.createOutbound(
        String(fixture.batchId),
        {
          details: [
            {
              allocationId: allocation.allocations[0]!.allocationId,
              outboundQuantity: 2,
            },
          ],
        },
        context(fixture.actorId, `${fixture.token}-supplement-outbound`),
      );
      await outbounds.confirmOutbound(
        outbound.outbound.outboundId,
        outbound.outbound.version,
        context(fixture.actorId, `${fixture.token}-supplement-confirm-outbound`),
      );

      const [[fulfilledSupplement]] = await pool.query<
        (RowDataPacket & {
          status: string;
          fulfilled_at: Date | null;
          fulfilled_by: number | null;
        })[]
      >('SELECT status,fulfilled_at,fulfilled_by FROM production_material_supplement WHERE id=?', [
        result.supplement.supplementId,
      ]);
      expect(fulfilledSupplement).toMatchObject({
        status: 'fulfilled',
        fulfilled_by: fixture.actorId,
      });
      expect(fulfilledSupplement?.fulfilled_at).not.toBeNull();

      const activated = await reporting.getBatchExecution(String(fixture.batchId), {
        actorId: String(fixture.actorId),
        canManageExecution: true,
        canReport: false,
        canReadAllReports: true,
      });
      expect(activated.steps[0]).toMatchObject({
        upperLimitQuantity: '12',
        requiredNormalQuantity: '12',
        activatedSupplementInputQuantity: '2',
        activatedSupplementTargetQuantity: '2',
        pendingSupplementInputQuantity: '0',
        supplementSources: [expect.objectContaining({ status: 'material_ready' })],
      });
      expect(activated.steps[1]).toMatchObject({
        upperLimitQuantity: '12',
        requiredNormalQuantity: '10',
        activatedSupplementInputQuantity: '2',
        activatedSupplementTargetQuantity: '0',
        pendingSupplementInputQuantity: '0',
        supplementSources: [expect.objectContaining({ status: 'material_ready' })],
      });

      await expect(
        supplementService.confirmPlan(
          dispositionId,
          { version: edited.version, dispositionVersion: 0 },
          { ...confirmContext, idempotencyKey: `${fixture.token}-confirm-key` },
        ),
      ).resolves.toMatchObject({ supplement: { supplementId: result.supplement.supplementId } });
      await expect(
        supplementService.confirmPlan(
          dispositionId,
          {
            version: edited.version,
            dispositionVersion: 0,
          },
          {
            ...context(fixture.actorId, `${fixture.token}-confirm-again`),
            idempotencyKey: `${fixture.token}-confirm-again-key`,
          },
        ),
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    } finally {
      await cleanup(pool, fixture);
    }
  });

  it('rolls back every scrap-supplement confirmation write when any in-transaction write fails', async () => {
    const { pool, repository, reporting, supplement, supplementService } = getContext();
    const fixture = await createFixture(pool, repository, 'supp-rollback');
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
        { version: 2, normalQuantity: 8, abnormalQuantity: 0, remark: 'scrap source normal' },
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
          remark: 'scrap source abnormal',
        },
        context(fixture.workerId, `${fixture.token}-source-abnormal-report`),
      );
      const dispositionId = source.abnormalDisposition!.dispositionId;
      const draft = await supplement.savePlan(
        dispositionId,
        {
          planVersion: null,
          dispositionVersion: 0,
          details: [
            {
              originalDemandId: String(fixture.demandId),
              requirementBasisId: String(fixture.requirementBasisId),
              materialVariantId: String(fixture.materialVariantId),
              supplementQuantity: 1,
            },
          ],
        },
        context(fixture.actorId, `${fixture.token}-save-plan`),
      );

      // 预置一条与本处置单绑定的报废事实（模拟此前已生成）：确认事务内第一步业务写入
      // （处置单批准）成功后，报废事实 INSERT 触发唯一键冲突 → 同事务全部回滚。
      await pool.execute(
        `INSERT INTO batch_step_scrap_records
         (abnormal_disposition_id,production_batch_id,batch_step_record_id,source_report_id,
          scrap_quantity,unit_snapshot,created_by)
         VALUES (?,?,?,?,'2.0000','pcs',?)`,
        [
          dispositionId,
          fixture.batchId,
          fixture.firstStepRecordId,
          source.report.reportId,
          fixture.actorId,
        ],
      );
      await expect(
        supplementService.confirmPlan(
          dispositionId,
          { version: draft.version, dispositionVersion: 0 },
          {
            ...context(fixture.actorId, `${fixture.token}-rollback-confirm`),
            idempotencyKey: `${fixture.token}-rollback-key`,
          },
        ),
      ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
      const [[disposition]] = await pool.query<
        (RowDataPacket & {
          review_status: string;
          disposition_type: string | null;
          version: number;
        })[]
      >(
        'SELECT review_status,disposition_type,version FROM batch_step_abnormal_dispositions WHERE id=?',
        [dispositionId],
      );
      expect(disposition).toMatchObject({
        review_status: 'pending_review',
        disposition_type: null,
        version: 0,
      });
      // 事务内已写入的处置单批准被回滚；报废事实只有事务外预置的那一条。
      const [[scrapCount]] = await pool.query<(RowDataPacket & { count: number })[]>(
        'SELECT COUNT(*) count FROM batch_step_scrap_records WHERE production_batch_id=?',
        [fixture.batchId],
      );
      expect(Number(scrapCount?.count)).toBe(1);
      for (const sql of [
        'SELECT COUNT(*) count FROM batch_step_scrap_reproduction_authorization WHERE production_batch_id=?',
        'SELECT COUNT(*) count FROM production_material_supplement WHERE production_batch_id=?',
        "SELECT COUNT(*) count FROM production_item_demand WHERE production_batch_id=? AND demand_type='scrap_supplement'",
      ]) {
        const [[row]] = await pool.query<(RowDataPacket & { count: number })[]>(sql, [
          fixture.batchId,
        ]);
        expect(Number(row?.count)).toBe(0);
      }
      const [[plan]] = await pool.query<(RowDataPacket & { status: string; version: number })[]>(
        'SELECT status,version FROM production_scrap_supplement_plan WHERE id=?',
        [draft.planId],
      );
      expect(plan).toMatchObject({ status: 'draft', version: 0 });
      expect(
        await auditCount(
          pool,
          `${fixture.token}-rollback-confirm`,
          'production-abnormal.confirm-scrap-supplement-plan',
        ),
      ).toBe(0);
      const [[idempotencyCount]] = await pool.query<(RowDataPacket & { count: number })[]>(
        'SELECT COUNT(*) count FROM http_idempotency_records WHERE idempotency_key=?',
        [`${fixture.token}-rollback-key`],
      );
      expect(Number(idempotencyCount?.count)).toBe(0);

      // 失败无残留：移除冲突事实后，全新幂等键再次确认成功，正式需求只在此刻出现。
      await pool.execute('DELETE FROM batch_step_scrap_records WHERE abnormal_disposition_id=?', [
        dispositionId,
      ]);
      const recovered = await supplementService.confirmPlan(
        dispositionId,
        { version: draft.version, dispositionVersion: 0 },
        {
          ...context(fixture.actorId, `${fixture.token}-recover-confirm`),
          idempotencyKey: `${fixture.token}-recover-key`,
        },
      );
      expect(recovered).toMatchObject({ supplement: { status: 'approved' } });
      const [[formalDemand]] = await pool.query<(RowDataPacket & { count: number })[]>(
        "SELECT COUNT(*) count FROM production_item_demand WHERE production_batch_id=? AND demand_type='scrap_supplement'",
        [fixture.batchId],
      );
      expect(Number(formalDemand?.count)).toBe(1);
    } finally {
      await cleanup(pool, fixture);
    }
  });

  it('rejects staging and confirmation once the abnormal is approved for rework', async () => {
    const { pool, repository, reporting, abnormal, supplement, supplementService } = getContext();
    const fixture = await createFixture(pool, repository, 'supp-rework');
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
        { version: 2, normalQuantity: 8, abnormalQuantity: 0, remark: 'scrap source normal' },
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
          remark: 'scrap source abnormal',
        },
        context(fixture.workerId, `${fixture.token}-source-abnormal-report`),
      );
      const dispositionId = source.abnormalDisposition!.dispositionId;
      const draft = await supplement.savePlan(
        dispositionId,
        {
          planVersion: null,
          dispositionVersion: 0,
          details: [
            {
              originalDemandId: String(fixture.demandId),
              requirementBasisId: String(fixture.requirementBasisId),
              materialVariantId: String(fixture.materialVariantId),
              supplementQuantity: 1,
            },
          ],
        },
        context(fixture.actorId, `${fixture.token}-save-plan`),
      );
      await abnormal.approveRework(
        dispositionId,
        { version: 0, remark: 'repair it' },
        context(fixture.actorId, `${fixture.token}-approve-rework`),
      );
      await expect(
        supplement.savePlan(
          dispositionId,
          {
            planVersion: draft.version,
            dispositionVersion: 1,
            details: [
              {
                originalDemandId: String(fixture.demandId),
                requirementBasisId: String(fixture.requirementBasisId),
                materialVariantId: String(fixture.materialVariantId),
                supplementQuantity: 2,
              },
            ],
          },
          context(fixture.actorId, `${fixture.token}-edit-plan`),
        ),
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
      await expect(
        supplementService.confirmPlan(
          dispositionId,
          { version: draft.version, dispositionVersion: 1 },
          {
            ...context(fixture.actorId, `${fixture.token}-confirm`),
            idempotencyKey: `${fixture.token}-confirm-key`,
          },
        ),
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
      const [[plan]] = await pool.query<(RowDataPacket & { status: string })[]>(
        'SELECT status FROM production_scrap_supplement_plan WHERE id=?',
        [draft.planId],
      );
      expect(plan?.status).toBe('draft');
      const [[demandCount]] = await pool.query<(RowDataPacket & { count: number })[]>(
        "SELECT COUNT(*) count FROM production_item_demand WHERE production_batch_id=? AND demand_type='scrap_supplement'",
        [fixture.batchId],
      );
      expect(Number(demandCount?.count)).toBe(0);
    } finally {
      await cleanup(pool, fixture);
    }
  });

  it('rejects staging and confirmation once the abnormal is rejected', async () => {
    const { pool, repository, reporting, abnormal, supplement, supplementService } = getContext();
    const fixture = await createFixture(pool, repository, 'supp-reject');
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
        { version: 2, normalQuantity: 8, abnormalQuantity: 0, remark: 'scrap source normal' },
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
          remark: 'scrap source abnormal',
        },
        context(fixture.workerId, `${fixture.token}-source-abnormal-report`),
      );
      const dispositionId = source.abnormalDisposition!.dispositionId;
      const draft = await supplement.savePlan(
        dispositionId,
        {
          planVersion: null,
          dispositionVersion: 0,
          details: [
            {
              originalDemandId: String(fixture.demandId),
              requirementBasisId: String(fixture.requirementBasisId),
              materialVariantId: String(fixture.materialVariantId),
              supplementQuantity: 1,
            },
          ],
        },
        context(fixture.actorId, `${fixture.token}-save-plan`),
      );
      await abnormal.rejectDisposition(
        dispositionId,
        { version: 0, reason: 'not a real scrap' },
        context(fixture.actorId, `${fixture.token}-reject`),
      );
      await expect(
        supplement.savePlan(
          dispositionId,
          {
            planVersion: draft.version,
            dispositionVersion: 1,
            details: [
              {
                originalDemandId: String(fixture.demandId),
                requirementBasisId: String(fixture.requirementBasisId),
                materialVariantId: String(fixture.materialVariantId),
                supplementQuantity: 2,
              },
            ],
          },
          context(fixture.actorId, `${fixture.token}-edit-plan`),
        ),
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
      await expect(
        supplementService.confirmPlan(
          dispositionId,
          { version: draft.version, dispositionVersion: 1 },
          {
            ...context(fixture.actorId, `${fixture.token}-confirm`),
            idempotencyKey: `${fixture.token}-confirm-key`,
          },
        ),
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
      const [[plan]] = await pool.query<(RowDataPacket & { status: string })[]>(
        'SELECT status FROM production_scrap_supplement_plan WHERE id=?',
        [draft.planId],
      );
      expect(plan?.status).toBe('draft');
      const [[demandCount]] = await pool.query<(RowDataPacket & { count: number })[]>(
        "SELECT COUNT(*) count FROM production_item_demand WHERE production_batch_id=? AND demand_type='scrap_supplement'",
        [fixture.batchId],
      );
      expect(Number(demandCount?.count)).toBe(0);
    } finally {
      await cleanup(pool, fixture);
    }
  });

  it('rejects staging and confirmation once the batch is no longer in production', async () => {
    const { pool, repository, reporting, supplement, supplementService } = getContext();
    const fixture = await createFixture(pool, repository, 'supp-closed');
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
        { version: 2, normalQuantity: 8, abnormalQuantity: 0, remark: 'scrap source normal' },
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
          remark: 'scrap source abnormal',
        },
        context(fixture.workerId, `${fixture.token}-source-abnormal-report`),
      );
      const dispositionId = source.abnormalDisposition!.dispositionId;
      const draft = await supplement.savePlan(
        dispositionId,
        {
          planVersion: null,
          dispositionVersion: 0,
          details: [
            {
              originalDemandId: String(fixture.demandId),
              requirementBasisId: String(fixture.requirementBasisId),
              materialVariantId: String(fixture.materialVariantId),
              supplementQuantity: 1,
            },
          ],
        },
        context(fixture.actorId, `${fixture.token}-save-plan`),
      );
      await pool.execute("UPDATE production_batches SET status='cancelled' WHERE id=?", [
        fixture.batchId,
      ]);
      await expect(
        supplement.savePlan(
          dispositionId,
          {
            planVersion: draft.version,
            dispositionVersion: 0,
            details: [
              {
                originalDemandId: String(fixture.demandId),
                requirementBasisId: String(fixture.requirementBasisId),
                materialVariantId: String(fixture.materialVariantId),
                supplementQuantity: 2,
              },
            ],
          },
          context(fixture.actorId, `${fixture.token}-edit-plan`),
        ),
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
      await expect(
        supplementService.confirmPlan(
          dispositionId,
          { version: draft.version, dispositionVersion: 0 },
          {
            ...context(fixture.actorId, `${fixture.token}-confirm`),
            idempotencyKey: `${fixture.token}-confirm-key`,
          },
        ),
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
      const [[plan]] = await pool.query<(RowDataPacket & { status: string })[]>(
        'SELECT status FROM production_scrap_supplement_plan WHERE id=?',
        [draft.planId],
      );
      expect(plan?.status).toBe('draft');
      const [[demandCount]] = await pool.query<(RowDataPacket & { count: number })[]>(
        "SELECT COUNT(*) count FROM production_item_demand WHERE production_batch_id=? AND demand_type='scrap_supplement'",
        [fixture.batchId],
      );
      expect(Number(demandCount?.count)).toBe(0);
    } finally {
      await cleanup(pool, fixture);
    }
  });
});
