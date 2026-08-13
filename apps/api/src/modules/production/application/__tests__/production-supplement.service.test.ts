import { describe, expect, it, vi } from 'vitest';
import { ProductionSupplementService } from '../production-supplement.service.js';

describe('ProductionSupplementService', () => {
  it('normalizes an idempotent approval and enriches material references through Product public API', async () => {
    const repository = {
      getCandidateContext: vi.fn().mockResolvedValue({
        routeStepIds: ['3', '4'],
        candidates: [
          {
            originalDemandId: '5',
            productMaterialId: '6',
            itemId: '7',
            itemCode: '',
            itemName: '',
          },
        ],
      }),
      approve: vi.fn().mockResolvedValue({
        disposition: {},
        scrapRecord: {},
        supplement: {
          productionBatchId: '1',
          details: [
            {
              originalDemandId: '5',
              productMaterialId: '6',
              itemId: '7',
              itemCode: '',
              itemName: '',
              unit: 'kg',
              supplementQuantity: '1.2500',
            },
          ],
        },
      }),
    };
    const products = {
      listRouteStepMaterialIds: vi.fn().mockResolvedValue(['6']),
      listInventoryItemReferencesByIds: vi
        .fn()
        .mockResolvedValue([{ id: '7', itemCode: 'MAT-7', productName: '材料七' }]),
    };
    const idempotency = {
      execute: vi.fn(async (command) => ({ result: await command.handler(), isReplay: false })),
    };
    const service = new ProductionSupplementService(
      repository as never,
      products as never,
      idempotency as never,
    );
    const result = await service.approve(
      '8',
      {
        version: 2,
        details: [{ originalDemandId: '5', supplementQuantity: 1.25 }],
        remark: ' 补料 ',
      },
      {
        actorId: '9',
        requestId: 'req',
        idempotencyKey: 'key',
        ip: null,
        userAgent: null,
      },
    );
    expect(idempotency.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'production.abnormal.scrap-supplement.v1',
        key: 'key',
        request: {
          params: { dispositionId: '8' },
          body: {
            version: 2,
            details: [{ originalDemandId: '5', supplementQuantity: 1.25 }],
            remark: '补料',
          },
        },
      }),
    );
    expect(repository.approve).toHaveBeenCalledWith(
      '8',
      {
        version: 2,
        details: [{ originalDemandId: '5', supplementQuantity: 1.25 }],
        remark: '补料',
      },
      { actorId: '9', requestId: 'req', ip: null, userAgent: null },
    );
    expect(result.supplement.details[0]).toMatchObject({
      itemCode: 'MAT-7',
      itemName: '材料七',
    });
    expect(products.listRouteStepMaterialIds).toHaveBeenCalledTimes(2);
  });
});
