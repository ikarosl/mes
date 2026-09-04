import { describe, expect, it, vi } from 'vitest';
import { ProductionInboundService } from '../production-inbound.service.js';
const context = {
  actorId: '1',
  requestId: '123e4567-e89b-42d3-a456-426614174000',
  idempotencyKey: '123e4567-e89b-42d3-a456-426614174001',
  ip: null,
  userAgent: null,
};
describe('ProductionInboundService', () => {
  it('enriches a list with one bulk identity lookup', async () => {
    const rows = [
      { id: '1', operatorId: '7', createdById: '8' },
      { id: '2', operatorId: '8', createdById: '7' },
    ];
    const repository = { list: vi.fn().mockResolvedValue({ items: rows, total: 2 }) };
    const identity = {
      listUserReferencesByIds: vi.fn().mockResolvedValue([
        { id: '7', displayName: '操作人' },
        { id: '8', displayName: '创建人' },
      ]),
    };
    const service = new ProductionInboundService(
      repository as never,
      {} as never,
      {} as never,
      identity as never,
      {} as never,
    );

    const result = await service.list({ page: 1, pageSize: 20 });

    expect(identity.listUserReferencesByIds).toHaveBeenCalledOnce();
    expect(identity.listUserReferencesByIds).toHaveBeenCalledWith(['7', '8']);
    expect(result.items[0]).toMatchObject({ operatorName: '操作人', createdByName: '创建人' });
  });

  it('normalizes one create payload, resolves enabled material snapshots and narrows command context', async () => {
    const repository = {
      create: vi.fn().mockResolvedValue({ inboundId: '2', operatorId: null, createdById: '1' }),
    };
    const products = {
      listInventoryItemReferencesByIds: vi
        .fn()
        .mockResolvedValue([
          { id: '9', itemCode: 'M1', productName: '物料', unit: 'kg', itemKind: 'material' },
        ]),
    };
    const identity = {
      listUserReferencesByIds: vi.fn().mockResolvedValue([{ id: '1', displayName: '管理员' }]),
    };
    const materialVariants = {
      listEnabledByMaterials: vi.fn().mockResolvedValue([
        {
          id: 'v9',
          materialProductId: '9',
          materialCode: 'M1',
          materialName: '物料',
          majorVersion: 'v1',
          minorVersion: 'A',
          variantCode: 'M1-v1-A',
          status: 1,
          remark: null,
          updatedAt: null,
        },
      ]),
    };
    const idempotency = {
      execute: vi.fn(async (command) => ({ result: await command.handler(), isReplay: false })),
    };
    const service = new ProductionInboundService(
      repository as never,
      products as never,
      materialVariants as never,
      identity as never,
      idempotency as never,
    );
    const result = await service.create(
      {
        provider: ' 供应商 ',
        details: [{ itemId: '9', materialVariantId: 'v9', batchCode: ' B1 ', inboundQuantity: 2 }],
      },
      context,
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: '供应商',
        details: [expect.objectContaining({ batchCode: 'B1' })],
      }),
      expect.any(Array),
      expect.not.objectContaining({ idempotencyKey: expect.anything() }),
    );
    expect(repository.create.mock.calls[0]?.[1]).toEqual([
      expect.objectContaining({
        id: '9',
        materialVariantId: 'v9',
        materialVariantCode: 'M1-v1-A',
      }),
    ]);
    expect(result.createdByName).toBe('管理员');
  });
  it('rejects non-material references', async () => {
    const service = new ProductionInboundService(
      {} as never,
      {
        listInventoryItemReferencesByIds: vi
          .fn()
          .mockResolvedValue([{ id: '9', itemKind: 'finished_product' }]),
      } as never,
      {} as never,
      {} as never,
      {
        execute: vi.fn(async (command) => ({ result: await command.handler(), isReplay: false })),
      } as never,
    );
    await expect(
      service.create(
        {
          details: [{ itemId: '9', materialVariantId: 'v9', batchCode: 'B1', inboundQuantity: 1 }],
        },
        context,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('does not repeat live material validation when the idempotency executor replays', async () => {
    const products = { listInventoryItemReferencesByIds: vi.fn() };
    const replay = { inboundId: '2', operatorId: null, createdById: null };
    const service = new ProductionInboundService(
      {} as never,
      products as never,
      {} as never,
      { listUserReferencesByIds: vi.fn().mockResolvedValue([]) } as never,
      { execute: vi.fn().mockResolvedValue({ result: replay, isReplay: true }) } as never,
    );
    await expect(
      service.create(
        {
          details: [{ itemId: '9', materialVariantId: 'v9', batchCode: 'B1', inboundQuantity: 1 }],
        },
        context,
      ),
    ).resolves.toBe(replay);
    expect(products.listInventoryItemReferencesByIds).not.toHaveBeenCalled();
  });

  it('trims and persists a mandatory cancellation reason', async () => {
    const repository = {
      cancel: vi.fn().mockResolvedValue({
        inboundId: '2',
        operatorId: null,
        createdById: null,
        cancelledById: '1',
      }),
    };
    const identity = { listUserReferencesByIds: vi.fn().mockResolvedValue([]) };
    const service = new ProductionInboundService(
      repository as never,
      {} as never,
      {} as never,
      identity as never,
      {} as never,
    );

    await service.cancel('2', 1, '  供应商变更  ', context);

    expect(repository.cancel).toHaveBeenCalledWith('2', 1, '供应商变更', context);
    await expect(service.cancel('2', 1, '   ', context)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });
});
