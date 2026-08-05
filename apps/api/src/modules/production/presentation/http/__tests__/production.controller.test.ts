import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS } from '@company/constants';
import { REQUIRED_PERMISSION } from '../../../../../common/security/auth.decorators.js';
import { ProductionController } from '../production.controller.js';

describe('ProductionController work-order options', () => {
  it('returns the full work-order candidate list without query parameters', async () => {
    const options = [
      {
        id: '6',
        workOrderNo: 'WO-001',
        productId: '8',
        productCode: 'P-001',
        productName: 'Product A',
        remainingQuantity: '50.0000',
      },
    ];
    const service = { listWorkOrderOptions: vi.fn().mockResolvedValue(options) };
    const controller = new ProductionController(service as never);

    const result = await controller.workOrderOptions();

    expect(result).toEqual(options);
    expect(service.listWorkOrderOptions).toHaveBeenCalledWith();
  });

  it('still requires the production tasks view permission', () => {
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, ProductionController.prototype.workOrderOptions),
    ).toEqual([PERMISSIONS.production.tasks.view]);
  });
});
