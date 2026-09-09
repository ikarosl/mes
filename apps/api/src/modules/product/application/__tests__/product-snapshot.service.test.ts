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

  it('delegates production route snapshots with the work-order product boundary', async () => {
    const repository = {
      getProductionRouteSnapshot: vi.fn().mockResolvedValue(null),
    };
    const service = new ProductSnapshotService(repository as never);

    await expect(service.getProductionRouteSnapshot('1', null)).resolves.toEqual({
      status: 'success',
      value: null,
    });

    expect(repository.getProductionRouteSnapshot).toHaveBeenCalledWith('1', null);
  });

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
