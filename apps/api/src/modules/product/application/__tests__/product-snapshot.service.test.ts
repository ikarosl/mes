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

    await expect(service.getProductionProduct('1')).resolves.toEqual(product);
    expect(repository.getProductionProduct).toHaveBeenCalledWith('1');
  });
});
