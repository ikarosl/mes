import { describe, expect, it, vi } from 'vitest';
import { ProductionInboundService } from '../production-inbound.service.js';
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
    const service = new ProductionInboundService(repository as never, identity as never);

    const result = await service.list({ page: 1, pageSize: 20 });

    expect(identity.listUserReferencesByIds).toHaveBeenCalledOnce();
    expect(identity.listUserReferencesByIds).toHaveBeenCalledWith(['7', '8']);
    expect(result.items[0]).toMatchObject({ operatorName: '操作人', createdByName: '创建人' });
  });
});
