import { beforeEach, describe, expect, it, vi } from 'vitest';
import { productionApi } from '../../../../api/production';
import { useInventoryMaterialSupplyDemandList } from '../useInventoryMaterialSupplyDemandList';

vi.mock('../../../../api/production', () => ({
  productionApi: {
    listInventoryMaterialSupplyDemand: vi.fn(),
  },
}));
vi.mock('../../../../utils/message', () => ({
  EMessage: { error: vi.fn() },
}));

const row = (itemId: string) => ({
  itemId,
  itemCode: 'M-' + itemId,
  itemName: '物料' + itemId,
  unit: 'kg',
  totalInventoryQuantity: '10',
  availableInventoryQuantity: '10',
  unavailableInventoryQuantity: '0',
  openDemandQuantity: '12',
  shortageQuantity: '2',
  isShortage: true,
});

describe('useInventoryMaterialSupplyDemandList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the latest list response when requests finish out of order', async () => {
    let resolveFirst!: (value: ReturnType<typeof page>) => void;
    let resolveSecond!: (value: ReturnType<typeof page>) => void;
    vi.mocked(productionApi.listInventoryMaterialSupplyDemand)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      );
    const list = useInventoryMaterialSupplyDemandList();

    const first = list.loadSupplyDemand();
    list.query.keyword = 'new';
    const second = list.loadSupplyDemand();
    resolveSecond(page('2'));
    await second;
    resolveFirst(page('1'));
    await first;

    expect(list.items.value.map((item) => item.itemId)).toEqual(['2']);
    expect(list.loading.value).toBe(false);
  });
});

const page = (itemId: string) => ({
  items: [row(itemId)],
  total: 1,
  page: 1,
  pageSize: 10,
});
