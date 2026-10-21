import { describe, expect, it, vi } from 'vitest';
import { ProductSnapshotService } from '../product-snapshot.service.js';

describe('ProductSnapshotService', () => {
  it('delegates snapshot reads through the Product-owned port', async () => {
    const product = {
      id: '1',
      itemCode: 'FG-001',
      productName: 'Finished good',
      unit: 'pcs',
      defaultRouteId: '2',
    };
    const repository = {
      getProductionProduct: vi.fn().mockResolvedValue(product),
      getBomSnapshot: vi.fn(),
      getRouteSnapshot: vi.fn(),
    };
    const service = new ProductSnapshotService(repository as never);

    await expect(service.getProductionProduct('1')).resolves.toEqual({
      status: 'success',
      value: product,
    });
    expect(repository.getProductionProduct).toHaveBeenCalledWith('1');
  });

  // TODO(test-migration): 高重要性：跨模块路线快照；正式测试获准后按显式路线公开能力恢复。
  it.todo('delegates production route snapshots with the work-order product boundary');

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
