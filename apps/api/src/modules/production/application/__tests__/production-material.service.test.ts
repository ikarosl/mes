import { describe, expect, it, vi } from 'vitest';
import { ProductionMaterialOutboundService } from '../production-material-outbound.service.js';
import { ProductionMaterialService } from '../production-material.service.js';
import { CREATE_MATERIAL_ALLOCATION_IDEMPOTENCY_SCOPE } from '../idempotency/production-idempotency-scopes.contract.js';
import { CREATE_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE } from '../idempotency/production-idempotency-scopes.contract.js';

const context = {
  actorId: '7',
  requestId: 'req-12345678',
  ip: null,
  userAgent: null,
  idempotencyKey: 'key-1',
};
describe('Production material application services', () => {
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

  it('rejects aggregating allocations from different demands in one command', async () => {
    const repository = { createAllocations: vi.fn() };
    const executor = { execute: vi.fn() };
    const service = new ProductionMaterialService(
      repository as never,
      {} as never,
      executor as never,
    );

    await expect(
      service.createAllocations(
        '1',
        {
          allocations: [
            { demandId: '2', itemBatchId: '3', assignedQuantity: 1 },
            { demandId: '4', itemBatchId: '5', assignedQuantity: 1 },
          ],
        },
        context,
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: '一次只能为一条物料需求分配库存',
    });
    expect(executor.execute).not.toHaveBeenCalled();
    expect(repository.createAllocations).not.toHaveBeenCalled();
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
    const service = new ProductionMaterialOutboundService(
      repository as never,
      { listUserReferencesByIds: vi.fn().mockResolvedValue([]) } as never,
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

  it('trims and persists a mandatory manual outbound cancellation reason', async () => {
    const repository = {
      cancelOutbound: vi.fn().mockResolvedValue({
        outboundId: '8',
        operatorId: null,
        createdById: null,
        cancelledById: '7',
      }),
    };
    const service = new ProductionMaterialOutboundService(
      repository as never,
      { listUserReferencesByIds: vi.fn().mockResolvedValue([]) } as never,
      {} as never,
    );

    await service.cancelOutbound('8', 2, '  计划调整  ', context);

    expect(repository.cancelOutbound).toHaveBeenCalledWith('8', 2, '计划调整', context);
    await expect(service.cancelOutbound('8', 2, '   ', context)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });
});
