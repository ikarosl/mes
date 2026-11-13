import { describe, expect, it, vi } from 'vitest';
import { ProductSnapshotService } from '../product-snapshot.service.js';

describe('ProductSnapshotService', () => {
  it('delegates snapshot reads through the Product-owned port', async () => {
    const product = {
      id: '1',
      itemCode: 'FG-001',
      productName: 'Finished good',
      unit: 'pcs',
    };
    const repository = {
      getProductionProduct: vi.fn().mockResolvedValue(product),
    };
    const service = new ProductSnapshotService(repository as never);

    await expect(service.getProductionProduct('1')).resolves.toEqual({
      status: 'success',
      value: product,
    });
    expect(repository.getProductionProduct).toHaveBeenCalledWith('1');
  });

  // TODO(product-route-snapshot): 验证跨模块路线快照的来源资格；高重要性，旧默认路线夹具失效且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按显式路线公开能力恢复。

  it('delegates inactive-safe display reference reads through the Product boundary', async () => {
    const references = [{ id: '2', itemCode: 'MAT-2', productName: '停用物料', unit: 'pcs' }];
    const repository = {
      listInventoryItemDisplayReferencesByIds: vi.fn().mockResolvedValue(references),
    };
    const service = new ProductSnapshotService(repository as never);

    await expect(service.listInventoryItemDisplayReferencesByIds(['2'])).resolves.toEqual(
      references,
    );
    expect(repository.listInventoryItemDisplayReferencesByIds).toHaveBeenCalledWith(['2']);
  });
});
