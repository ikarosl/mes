import { describe, expect, it, vi } from 'vitest';
import { ProductionMaterialService } from '../production-material.service.js';
import { CREATE_MATERIAL_ALLOCATION_IDEMPOTENCY_SCOPE } from '../idempotency/create-material-allocation-idempotency.contract.js';
import { CREATE_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE } from '../idempotency/create-material-outbound-idempotency.contract.js';

const context = {
  actorId: '7',
  requestId: 'req-12345678',
  ip: null,
  userAgent: null,
  idempotencyKey: 'key-1',
};
describe('ProductionMaterialService', () => {
  it('enriches outbound list operators with one bulk identity lookup', async () => {
    const rows = [
      { outboundId: '1', operatorId: '7', createdById: '8' },
      { outboundId: '2', operatorId: '8', createdById: '7' },
    ];
    const repository = {
      listOutboundOrders: vi
        .fn()
        .mockResolvedValue({ items: rows, total: 2, page: 1, pageSize: 20 }),
    };
    const identity = {
      listUserReferencesByIds: vi.fn().mockResolvedValue([
        { id: '7', displayName: '操作人' },
        { id: '8', displayName: '创建人' },
      ]),
    };
    const service = new ProductionMaterialService(
      repository as never,
      identity as never,
      {} as never,
      {} as never,
    );

    const result = await service.listOutboundOrders({ page: 1, pageSize: 20 });

    expect(identity.listUserReferencesByIds).toHaveBeenCalledOnce();
    expect(identity.listUserReferencesByIds).toHaveBeenCalledWith(['7', '8']);
    expect(result.items[0]).toMatchObject({ operatorName: '操作人', createdByName: '创建人' });
  });

  it('normalizes allocation payload, uses the registered scope, and narrows repository context', async () => {
    const result = {
      productionBatchId: '1',
      batchStatus: 'material_pending',
      batchVersion: 1,
      allocations: [],
    };
    const repository = { createAllocations: vi.fn().mockResolvedValue(result) };
    const executor = {
      execute: vi.fn(async (command: { handler: () => Promise<typeof result> }) => ({
        result: await command.handler(),
        isReplay: false,
      })),
    };
    const service = new ProductionMaterialService(
      repository as never,
      {} as never,
      {} as never,
      executor as never,
    );
    await service.createAllocations(
      '1',
      { allocations: [{ demandId: '2', itemBatchId: '3', assignedQuantity: 1, remark: ' x ' }] },
      context,
    );
    expect(executor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: CREATE_MATERIAL_ALLOCATION_IDEMPOTENCY_SCOPE,
        key: 'key-1',
      }),
    );
    expect(repository.createAllocations).toHaveBeenCalledWith(
      '1',
      { allocations: [{ demandId: '2', itemBatchId: '3', assignedQuantity: 1, remark: 'x' }] },
      expect.not.objectContaining({ idempotencyKey: expect.anything() }),
    );
  });

  it('normalizes pending outbound creation and never leaks the HTTP key into the repository', async () => {
    const result = { outbound: { operatorId: null, createdById: null }, productionBatchId: '1' };
    const repository = { createOutbound: vi.fn().mockResolvedValue(result) };
    const executor = {
      execute: vi.fn(async (command: { handler: () => Promise<unknown> }) => ({
        result: await command.handler(),
        isReplay: false,
      })),
    };
    const service = new ProductionMaterialService(
      repository as never,
      { listUserReferencesByIds: vi.fn().mockResolvedValue([]) } as never,
      {} as never,
      executor as never,
    );
    await service.createOutbound(
      '1',
      {
        details: [{ allocationId: '9', outboundQuantity: 2 }],
        remark: '  纸质领料  ',
      },
      context,
    );
    expect(executor.execute).toHaveBeenCalledWith(
      expect.objectContaining({ scope: CREATE_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE }),
    );
    expect(repository.createOutbound).toHaveBeenCalledWith(
      '1',
      { details: [{ allocationId: '9', outboundQuantity: 2 }], remark: '纸质领料' },
      expect.not.objectContaining({ idempotencyKey: expect.anything() }),
    );
  });
});
