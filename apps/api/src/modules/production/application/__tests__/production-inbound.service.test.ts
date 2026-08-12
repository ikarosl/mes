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
    const idempotency = {
      execute: vi.fn(async (command) => ({ result: await command.handler(), isReplay: false })),
    };
    const service = new ProductionInboundService(
      repository as never,
      products as never,
      identity as never,
      idempotency as never,
    );
    const result = await service.create(
      { provider: ' 供应商 ', details: [{ itemId: '9', batchCode: ' B1 ', inboundQuantity: 2 }] },
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
      {
        execute: vi.fn(async (command) => ({ result: await command.handler(), isReplay: false })),
      } as never,
    );
    await expect(
      service.create({ details: [{ itemId: '9', batchCode: 'B1', inboundQuantity: 1 }] }, context),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('does not repeat live material validation when the idempotency executor replays', async () => {
    const products = { listInventoryItemReferencesByIds: vi.fn() };
    const replay = { inboundId: '2', operatorId: null, createdById: null };
    const service = new ProductionInboundService(
      {} as never,
      products as never,
      { listUserReferencesByIds: vi.fn().mockResolvedValue([]) } as never,
      { execute: vi.fn().mockResolvedValue({ result: replay, isReplay: true }) } as never,
    );
    await expect(
      service.create({ details: [{ itemId: '9', batchCode: 'B1', inboundQuantity: 1 }] }, context),
    ).resolves.toBe(replay);
    expect(products.listInventoryItemReferencesByIds).not.toHaveBeenCalled();
  });
});
