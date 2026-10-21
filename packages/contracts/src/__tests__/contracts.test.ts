import { describe, expect, it } from 'vitest';
import { AUTH_API } from '../index.js';
import type {
  AssignProductionStepPayload,
  CreateMaterialAllocationsPayload,
  CreateBatchStepReportPayload,
  CorrectBatchStepReportPayload,
  ProductionMaterialDemandItem,
  ProductionWorkerTaskItem,
  CompleteProductionExecutionPayload,
  ProductionTraceDetail,
  CreateMaterialOutboundPayload,
  ProductionExecutionBatchSummary,
  CompleteReworkPayload,
  ReworkRecordItem,
} from '../index.js';

describe('auth contract', () => {
  it('keeps refresh under auth cookie path', () => expect(AUTH_API.refresh).toBe('/auth/refresh'));
});

describe('production execution contracts', () => {
  it('provides one list projection for progress and abnormal risk cues', () => {
    const summary = {
      completedStepCount: 2,
      totalStepCount: 3,
      effectiveAbnormalQuantity: '1.0000',
      pendingAbnormalCount: 1,
    } as ProductionExecutionBatchSummary;
    expect(summary).toMatchObject({ completedStepCount: 2, pendingAbnormalCount: 1 });
  });

  it('uses a versioned assignee command and server-derived worker progress', () => {
    const payload: AssignProductionStepPayload = { responsibleUserId: '7', version: 2 };
    const task = {
      requiredNormalQuantity: '10.0000',
      upperLimitQuantity: '10.0000',
      availableReportQuantity: '2.0000',
      effectiveNormalQuantity: '4.0000',
      canStart: false,
    } as ProductionWorkerTaskItem;
    expect(payload).toEqual({ responsibleUserId: '7', version: 2 });
    expect(task.requiredNormalQuantity).toBe('10.0000');
    expect(task.availableReportQuantity).toBe('2.0000');
  });

  it('models each report as a delta and correction as a replacement command', () => {
    const report: CreateBatchStepReportPayload = {
      version: 3,
      normalQuantity: 2,
      abnormalQuantity: 1,
      remark: '本次报工',
    };
    const correction: CorrectBatchStepReportPayload = {
      version: 4,
      normalQuantity: 1,
      reason: '录入更正',
    };
    expect(report).not.toHaveProperty('completedQuantity');
    expect(report).not.toHaveProperty('qualifiedQuantity');
    expect(correction.reason).toBeTruthy();
  });

  it('keeps execution completion server-derived', () => {
    const payload: CompleteProductionExecutionPayload = { version: 5, closeoutVersion: null };
    expect(payload).toEqual({ version: 5, closeoutVersion: null });
    expect(payload).not.toHaveProperty('completedQuantity');
    expect(payload).not.toHaveProperty('qualifiedQuantity');
  });

  it('binds one full rework completion to its immutable source quantity', () => {
    const rework = {
      reworkId: '9',
      sourceReportId: '3',
      reworkQuantity: '2.0000',
      completedNormalReportId: null,
      completedAbnormalReportId: null,
      status: 'doing',
    } as ReworkRecordItem;
    const payload: CompleteReworkPayload = {
      version: 1,
      normalQuantity: 2,
      abnormalQuantity: 0,
    };
    expect(rework.completedNormalReportId).toBeNull();
    expect(rework.completedAbnormalReportId).toBeNull();
    expect(payload.normalQuantity + payload.abnormalQuantity).toBe(2);
  });

  it('models Production trace from current persisted facts only', () => {
    const trace = {
      summary: { productionBatchId: '1' },
      materialDemands: [],
      materialOutbounds: [],
      inventoryTransactions: [],
      steps: [],
    } as unknown as ProductionTraceDetail;
    expect(trace).not.toHaveProperty('quality');
    expect(trace).not.toHaveProperty('rework');
    expect(trace).not.toHaveProperty('scrap');
    expect(trace).not.toHaveProperty('finishedFlows');
  });
});

describe('production material contracts', () => {
  it('use demand and inventory batch identities with incremental quantities', () => {
    const payload: CreateMaterialAllocationsPayload = {
      allocations: [{ demandId: '1', itemBatchId: '2', assignedQuantity: 1.25 }],
    };
    const demand = { demandId: '1', remainingQuantity: '1.2500' } as ProductionMaterialDemandItem;
    expect(payload.allocations[0]?.demandId).toBe(demand.demandId);
  });

  it('models pending outbound order creation from allocation quantities', () => {
    const create: CreateMaterialOutboundPayload = {
      details: [
        { allocationId: '1', outboundQuantity: 2 },
        { allocationId: '2', outboundQuantity: 3 },
      ],
    };
    expect(create.details).toHaveLength(2);
    expect(create).not.toHaveProperty('status');
  });
});
