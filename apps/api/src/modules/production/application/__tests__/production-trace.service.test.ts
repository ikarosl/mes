import { describe, expect, it, vi } from 'vitest';
import { ProductionTraceService } from '../production-trace.service.js';

describe('ProductionTraceService', () => {
  it('composes only persisted Production projections for one batch', async () => {
    const trace = {
      getSummary: vi.fn().mockResolvedValue({ productionBatchId: '1' }),
      listInventoryTransactions: vi.fn().mockResolvedValue([{ transactionId: '8' }]),
    };
    const materials = {
      listDemands: vi.fn().mockResolvedValue([{ demandId: '2' }]),
      listOutbounds: vi.fn().mockResolvedValue([{ outboundId: '3' }]),
    };
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
      materialDemands: [{ demandId: '2' }],
      materialOutbounds: [{ outboundId: '3' }],
      inventoryTransactions: [{ transactionId: '8' }],
      steps: [{ stepRecordId: '4' }],
    });
  });
});
