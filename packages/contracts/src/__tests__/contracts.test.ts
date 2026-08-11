import { describe, expect, it } from 'vitest';
import { AUTH_API } from '../index.js';
import type {
  AssignProductionStepPayload,
  CreateMaterialAllocationsPayload,
  ProductionMaterialDemandItem,
  ProductionWorkerTaskItem,
} from '../index.js';

describe('auth contract', () => {
  it('keeps refresh under auth cookie path', () => expect(AUTH_API.refresh).toBe('/auth/refresh'));
});

describe('production execution contracts', () => {
  it('uses a versioned assignee command and server-derived worker progress', () => {
    const payload: AssignProductionStepPayload = { responsibleUserId: '7', version: 2 };
    const task = {
      requiredNormalQuantity: '10.0000',
      effectiveNormalQuantity: '4.0000',
      canStart: false,
    } as ProductionWorkerTaskItem;
    expect(payload).toEqual({ responsibleUserId: '7', version: 2 });
    expect(task.requiredNormalQuantity).toBe('10.0000');
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
});
