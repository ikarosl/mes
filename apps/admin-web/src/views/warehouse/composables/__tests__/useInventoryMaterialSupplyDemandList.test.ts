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

const row = (itemId: string, materialVariantId = `mv-${itemId}`, openDemandQuantity = '12') => ({
  itemId,
  materialVariantId,
  materialVariantCode: `${materialVariantId}-CODE`,
  itemCode: 'M-' + itemId,
  itemName: '物料' + itemId,
  unit: 'kg',
  totalInventoryQuantity: '10',
  availableInventoryQuantity: '10',
  unavailableInventoryQuantity: '0',
  openDemandQuantity,
  shortageQuantity: openDemandQuantity === '0' ? '0' : '2',
  isShortage: openDemandQuantity !== '0',
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

  it('passes the version-search keyword and preserves demand-first exact-version rows', async () => {
    const demandFirst = row('same-item', 'mv-demand', '12');
    const inventoryOnly = row('same-item', 'mv-stock-only', '0');
    vi.mocked(productionApi.listInventoryMaterialSupplyDemand).mockResolvedValue({
      items: [demandFirst, inventoryOnly],
      total: 2,
      page: 1,
      pageSize: 10,
    });
    const list = useInventoryMaterialSupplyDemandList();
    list.query.keyword = '  M-same-item-v2  ';

    await list.loadSupplyDemand();

    expect(productionApi.listInventoryMaterialSupplyDemand).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
      keyword: 'M-same-item-v2',
    });
    expect(list.items.value.map((item) => item.materialVariantId)).toEqual([
      'mv-demand',
      'mv-stock-only',
    ]);
    expect(list.items.value[0]).toMatchObject({
      itemId: 'same-item',
      materialVariantId: 'mv-demand',
      openDemandQuantity: '12',
    });
    expect(list.total.value).toBe(2);
  });

  it('resets the page for search, reset, and page-size changes', async () => {
    vi.mocked(productionApi.listInventoryMaterialSupplyDemand).mockResolvedValue(page('1'));
    const list = useInventoryMaterialSupplyDemandList();
    list.query.keyword = 'old';
    await list.changeSupplyDemandPage(3);
    await list.searchSupplyDemand();
    await list.changeSupplyDemandPageSize(25);
    await list.resetSupplyDemandQuery();

    expect(list.currentPage.value).toBe(1);
    expect(list.pageSize.value).toBe(25);
    expect(list.query.keyword).toBe('');
    expect(productionApi.listInventoryMaterialSupplyDemand).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 25,
      keyword: undefined,
    });
  });

  it('keeps the previous exact-version rows and reports only the latest failure', async () => {
    const list = useInventoryMaterialSupplyDemandList();
    const error = vi.mocked((await import('../../../../utils/message')).EMessage.error);
    vi.mocked(productionApi.listInventoryMaterialSupplyDemand).mockResolvedValueOnce(page('old'));
    await list.loadSupplyDemand();
    vi.mocked(productionApi.listInventoryMaterialSupplyDemand).mockRejectedValueOnce(
      new Error('latest failure'),
    );

    await list.loadSupplyDemand();

    expect(list.items.value).toEqual([row('old')]);
    expect(error).toHaveBeenCalledWith(expect.any(Error), '物料库存查询失败');
  });
});

const page = (itemId: string) => ({
  items: [row(itemId)],
  total: 1,
  page: 1,
  pageSize: 10,
});
