import { describe, expect, it, vi } from 'vitest';
import { ProductionMaterialService } from '../production-material.service.js';
import { ProductionTraceService } from '../production-trace.service.js';

describe('ProductionTraceService', () => {
  it('composes persisted Production projections and enriches demand item references', async () => {
    const trace = {
      getSummary: vi.fn().mockResolvedValue({ productionBatchId: '1' }),
      listInventoryTransactions: vi.fn().mockResolvedValue([{ transactionId: '8' }]),
      listMaterialInboundSources: vi.fn().mockResolvedValue([{ inboundNo: 'PI-1' }]),
    };
    const materialRepository = {
      listDemands: vi.fn().mockResolvedValue([
        {
          demandId: '2',
          itemId: '7',
          itemCode: '',
          itemName: '',
        },
      ]),
      listOutbounds: vi.fn().mockResolvedValue([{ outboundId: '3' }]),
    };
    const products = {
      listInventoryItemDisplayReferencesByIds: vi
        .fn()
        .mockResolvedValue([{ id: '7', itemCode: 'MAT-007', productName: '追溯物料' }]),
    };
    const materials = new ProductionMaterialService(
      materialRepository as never,
      { listUserReferencesByIds: vi.fn().mockResolvedValue([]) } as never,
      products as never,
      {} as never,
    );
    const reporting = {
      getBatchExecution: vi.fn().mockResolvedValue({ steps: [{ stepRecordId: '4' }] }),
    };
    const service = new ProductionTraceService(
      trace as never,
      materials as never,
      reporting as never,
    );

    await expect(service.getDetail('1')).resolves.toEqual({
      summary: { productionBatchId: '1' },
      materialDemands: [
        {
          demandId: '2',
          itemId: '7',
          itemCode: 'MAT-007',
          itemName: '追溯物料',
        },
      ],
      materialOutbounds: [{ outboundId: '3', operatorName: null, createdByName: null }],
      inventoryTransactions: [{ transactionId: '8' }],
      materialInboundSources: [{ inboundNo: 'PI-1' }],
      steps: [{ stepRecordId: '4' }],
    });
    expect(products.listInventoryItemDisplayReferencesByIds).toHaveBeenCalledWith(['7']);
  });
});
