import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS } from '@company/constants';
import { REQUIRED_PERMISSION } from '../../../../../common/security/auth.decorators.js';
import { ProductionTraceController } from '../production-trace.controller.js';

describe('ProductionTraceController', () => {
  it('protects both read projections with the trace permission', () => {
    const prototype = ProductionTraceController.prototype;
    expect(Reflect.getMetadata(REQUIRED_PERMISSION, prototype.search)).toBe(
      PERMISSIONS.production.trace.view,
    );
    expect(Reflect.getMetadata(REQUIRED_PERMISSION, prototype.detail)).toBe(
      PERMISSIONS.production.trace.view,
    );
    expect(Reflect.getMetadata(PATH_METADATA, prototype.detail)).toBe('batches/:batchId');
    expect(Reflect.getMetadata(METHOD_METADATA, prototype.detail)).toBe(RequestMethod.GET);
  });

  it('forwards the detail projection contract without rewriting source categories', async () => {
    const detail = {
      summary: { productionBatchId: '21' },
      materialInboundSources: [
        {
          sourceLabel: 'material_return_inbound',
          sourceDocumentNo: 'TL-002',
          itemBatchId: '101',
          materialVariantId: '6',
        },
        {
          sourceLabel: 'production_inbound',
          sourceDocumentNo: null,
          itemBatchId: '102',
          materialVariantId: '7',
        },
      ],
    };
    const service = {
      search: vi.fn(),
      getDetail: vi.fn().mockResolvedValue(detail),
    };
    const controller = new ProductionTraceController(service as never);

    await expect(controller.detail({ batchId: '21' } as never)).resolves.toBe(detail);
    expect(service.getDetail).toHaveBeenCalledWith('21');
  });
});
