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
        planStartDate: '2026-08-01',
        planEndDate: '2026-08-31',
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

describe('ProductionController status commands', () => {
  const context = { actorId: '7', requestId: 'r1', ip: null, userAgent: null };

  it('forwards explicit work-order complete and close semantics', async () => {
    const service = {
      cancelWorkOrder: vi.fn().mockResolvedValue({ status: 'cancelled' }),
      completeWorkOrder: vi.fn().mockResolvedValue({ status: 'completed' }),
      closeWorkOrder: vi.fn().mockResolvedValue({ status: 'closed' }),
    };
    const controller = new ProductionController(service as never);

    await controller.cancelWorkOrder(
      { workOrderId: '3' },
      { version: 3, reason: '计划取消' },
      context,
    );
    await controller.completeWorkOrder({ workOrderId: '3' }, { version: 4 }, context);
    await controller.closeWorkOrder(
      { workOrderId: '3' },
      { version: 5, reason: '  计划调整  ' },
      context,
    );

    expect(service.cancelWorkOrder).toHaveBeenCalledWith('3', 3, '计划取消', context);
    expect(service.completeWorkOrder).toHaveBeenCalledWith('3', 4, context);
    expect(service.closeWorkOrder).toHaveBeenCalledWith('3', 5, '  计划调整  ', context);
  });

  it('returns a cancellation preview and forwards task cancellation reason', async () => {
    const service = {
      getBatchCancellationCheck: vi.fn().mockResolvedValue({ canCancel: true }),
      cancelBatch: vi.fn().mockResolvedValue({ status: 'cancelled' }),
    };
    const controller = new ProductionController(service as never);

    await controller.batchCancellationCheck({ id: '8' });
    await controller.cancelBatch({ id: '8' }, { version: 2, reason: '计划调整' }, context);

    expect(service.getBatchCancellationCheck).toHaveBeenCalledWith('8');
    expect(service.cancelBatch).toHaveBeenCalledWith('8', 2, '计划调整', context);
  });
});
