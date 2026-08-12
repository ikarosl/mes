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
  ConfirmMaterialOutboundPayload,
  CreatePurchaseInboundPayload,
  InventoryBatchItem,
} from '../index.js';

describe('auth contract', () => {
  it('keeps refresh under auth cookie path', () => expect(AUTH_API.refresh).toBe('/auth/refresh'));
});

describe('production execution contracts', () => {
  it('uses a versioned assignee command and server-derived worker progress', () => {
    const payload: AssignProductionStepPayload = { responsibleUserId: '7', version: 2 };
    const task = {
      requiredNormalQuantity: '10.0000',
      releasedNormalQuantity: '6.0000',
      availableNormalQuantity: '2.0000',
      effectiveNormalQuantity: '4.0000',
      canStart: false,
    } as ProductionWorkerTaskItem;
    expect(payload).toEqual({ responsibleUserId: '7', version: 2 });
    expect(task.requiredNormalQuantity).toBe('10.0000');
    expect(task.availableNormalQuantity).toBe('2.0000');
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
      abnormalQuantity: 0,
      reason: '录入更正',
    };
    expect(report).not.toHaveProperty('completedQuantity');
    expect(report).not.toHaveProperty('qualifiedQuantity');
    expect(correction.reason).toBeTruthy();
  });

  it('keeps execution completion server-derived', () => {
    const payload: CompleteProductionExecutionPayload = { version: 5 };
    expect(payload).toEqual({ version: 5 });
    expect(payload).not.toHaveProperty('completedQuantity');
    expect(payload).not.toHaveProperty('qualifiedQuantity');
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

  it('separates pending order creation from versioned whole-order confirmation', () => {
    const create: CreateMaterialOutboundPayload = {
      details: [
        { allocationId: '1', outboundQuantity: 2 },
        { allocationId: '2', outboundQuantity: 3 },
      ],
    };
    const confirm: ConfirmMaterialOutboundPayload = { version: 0 };
    expect(create.details).toHaveLength(2);
    expect(create).not.toHaveProperty('status');
    expect(confirm).toEqual({ version: 0 });
  });

  it('models pending purchase inbound separately from ledger-derived inventory', () => {
    const inbound: CreatePurchaseInboundPayload = {
      inboundNo: null,
      provider: '供应商 A',
      remark: null,
      details: [{ itemId: '1', batchCode: 'LOT-1', inboundQuantity: 5, remark: null }],
    };
    const inventory = {
      itemBatchId: '2',
      onHandAvailableQuantity: '5.0000',
      reservedQuantity: '2.0000',
      availableToAllocateQuantity: '3.0000',
    } as InventoryBatchItem;
    expect(inbound).not.toHaveProperty('status');
    expect(inventory.availableToAllocateQuantity).toBe('3.0000');
  });
});
