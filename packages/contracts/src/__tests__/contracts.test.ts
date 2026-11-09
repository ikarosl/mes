import { describe, expect, it } from 'vitest';
import { AUTH_API } from '../index.js';
import type {
  CreateMaterialAllocationsPayload,
  ProductionMaterialDemandItem,
  CreateMaterialOutboundPayload,
} from '../index.js';

describe('auth contract', () => {
  it('keeps refresh under auth cookie path', () => expect(AUTH_API.refresh).toBe('/auth/refresh'));
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
