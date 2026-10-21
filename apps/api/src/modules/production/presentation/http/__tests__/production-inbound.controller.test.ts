import 'reflect-metadata';
import { PERMISSIONS } from '@company/constants';
import { describe, expect, it, vi } from 'vitest';
import { REQUIRED_PERMISSION } from '../../../../../common/security/auth.decorators.js';
import { ProductionInboundController } from '../production-inbound.controller.js';

describe('ProductionInboundController contract', () => {
  it('uses inventory permissions for stock and supply-demand reads', () => {
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, ProductionInboundController.prototype.inventory),
    ).toBe(PERMISSIONS.warehouse.inventory.view);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        ProductionInboundController.prototype.materialSupplyDemand,
      ),
    ).toBe(PERMISSIONS.warehouse.inventory.view);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        ProductionInboundController.prototype.materialDemandTrace,
      ),
    ).toBe(PERMISSIONS.warehouse.inventory.view);
  });

  it('forwards the material variant when listing demand trace', async () => {
    const list = vi.fn();
    const listDemandTrace = vi.fn();
    const controller = new ProductionInboundController(
      {} as never,
      { list, listDemandTrace } as never,
    );

    await controller.materialSupplyDemand({ page: 2, pageSize: 5, keyword: '  MAT-42  ' });
    expect(list).toHaveBeenCalledWith({ page: 2, pageSize: 5, keyword: 'MAT-42' });

    await controller.materialDemandTrace(
      { itemId: '7' },
      { materialVariantId: '42', page: 3, pageSize: 10 },
    );
    expect(listDemandTrace).toHaveBeenCalledWith('7', {
      materialVariantId: '42',
      page: 3,
      pageSize: 10,
    });
  });
});
