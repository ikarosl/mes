import { beforeEach, describe, expect, it, vi } from 'vitest';
import { productionApi } from '../../../../api/production';
import { useInventoryMaterialDemandTrace } from '../useInventoryMaterialDemandTrace';

vi.mock('../../../../api/production', () => ({
  productionApi: { listInventoryMaterialDemandTrace: vi.fn() },
}));
vi.mock('../../../../utils/message', () => ({
  EMessage: { error: vi.fn() },
}));

const supplyItem = (itemId: string) => ({
  itemId,
  itemCode: `MAT-${itemId}`,
  itemName: `物料${itemId}`,
  unit: '件',
  totalInventoryQuantity: '10',
  availableInventoryQuantity: '8',
  unavailableInventoryQuantity: '2',
  openDemandQuantity: '12',
  shortageQuantity: '4',
  isShortage: true,
});

describe('useInventoryMaterialDemandTrace', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens the selected material and requests only its active demand page', async () => {
    vi.mocked(productionApi.listInventoryMaterialDemandTrace).mockResolvedValue({
      items: [],
      total: 3,
      page: 1,
      pageSize: 10,
    });
    const trace = useInventoryMaterialDemandTrace();

    await trace.open(supplyItem('9'));

    expect(trace.visible.value).toBe(true);
    expect(trace.selectedItem.value?.itemId).toBe('9');
    expect(trace.total.value).toBe(3);
    expect(productionApi.listInventoryMaterialDemandTrace).toHaveBeenCalledWith('9', {
      page: 1,
      pageSize: 10,
    });
  });
});
