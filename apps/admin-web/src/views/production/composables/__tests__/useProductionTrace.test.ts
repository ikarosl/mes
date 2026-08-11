import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProductionTrace } from '../useProductionTrace';

const api = vi.hoisted(() => ({ searchProductionTrace: vi.fn(), getProductionTrace: vi.fn() }));
vi.mock('../../../../api/production', () => ({ productionApi: api }));

describe('useProductionTrace', () => {
  beforeEach(() => vi.clearAllMocks());

  it('selects the first search result and loads its persisted projection', async () => {
    api.searchProductionTrace.mockResolvedValue({
      items: [
        {
          workOrderId: '8',
          workOrderNo: 'WO-8',
          batches: [{ productionBatchId: '9', batchNo: 'PB-9' }],
        },
      ],
      total: 1,
    });
    api.getProductionTrace.mockResolvedValue({ summary: { productionBatchId: '9' } });
    const state = useProductionTrace();
    await state.search('  IB-001  ', 1);
    expect(api.searchProductionTrace).toHaveBeenCalledWith({
      keyword: 'IB-001',
      page: 1,
      pageSize: 20,
    });
    expect(api.getProductionTrace).toHaveBeenCalledWith('9');
    expect(state.selectedBatchId.value).toBe('9');
  });
});
