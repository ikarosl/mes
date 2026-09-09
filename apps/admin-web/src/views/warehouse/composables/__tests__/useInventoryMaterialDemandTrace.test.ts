import { beforeEach, describe, expect, it, vi } from 'vitest';
import { productionApi } from '../../../../api/production';
import { useInventoryMaterialDemandTrace } from '../useInventoryMaterialDemandTrace';

vi.mock('../../../../api/production', () => ({
  productionApi: { listInventoryMaterialDemandTrace: vi.fn() },
}));
vi.mock('../../../../utils/message', () => ({
  EMessage: { error: vi.fn() },
}));

const supplyItem = (itemId: string, materialVariantId = `mv-${itemId}`) => ({
  itemId,
  materialVariantId,
  materialVariantCode: `${materialVariantId}-CODE`,
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

const demandResult = (demandId: string) => ({
  items: [{ demandId }] as never,
  total: 1,
  page: 1,
  pageSize: 10,
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
      materialVariantId: 'mv-9',
      page: 1,
      pageSize: 10,
    });
  });

  it('keeps same-base-material drill-down isolated by exact variant', async () => {
    vi.mocked(productionApi.listInventoryMaterialDemandTrace)
      .mockResolvedValueOnce(demandResult('d-v1'))
      .mockResolvedValueOnce(demandResult('d-v2'));
    const trace = useInventoryMaterialDemandTrace();

    await trace.open(supplyItem('9', 'mv-v1'));
    await trace.open(supplyItem('9', 'mv-v2'));

    expect(productionApi.listInventoryMaterialDemandTrace).toHaveBeenNthCalledWith(1, '9', {
      materialVariantId: 'mv-v1',
      page: 1,
      pageSize: 10,
    });
    expect(productionApi.listInventoryMaterialDemandTrace).toHaveBeenNthCalledWith(2, '9', {
      materialVariantId: 'mv-v2',
      page: 1,
      pageSize: 10,
    });
    expect(trace.selectedItem.value?.materialVariantId).toBe('mv-v2');
    expect(trace.items.value).toEqual([{ demandId: 'd-v2' }]);
  });

  it('drops a late drill-down response after opening another version', async () => {
    let resolveFirst!: (value: unknown) => void;
    let resolveSecond!: (value: unknown) => void;
    vi.mocked(productionApi.listInventoryMaterialDemandTrace)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve as unknown as (value: unknown) => void;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve as unknown as (value: unknown) => void;
          }),
      );
    const trace = useInventoryMaterialDemandTrace();

    const first = trace.open(supplyItem('9', 'mv-v1'));
    const second = trace.open(supplyItem('9', 'mv-v2'));
    resolveSecond(demandResult('d-v2'));
    await second;
    resolveFirst(demandResult('d-v1'));
    await first;

    expect(trace.selectedItem.value?.materialVariantId).toBe('mv-v2');
    expect(trace.items.value).toEqual([{ demandId: 'd-v2' }]);
    expect(trace.loading.value).toBe(false);
  });

  it('keeps the selected version on pagination and page-size changes', async () => {
    vi.mocked(productionApi.listInventoryMaterialDemandTrace).mockResolvedValue({
      items: [],
      total: 12,
      page: 1,
      pageSize: 10,
    });
    const trace = useInventoryMaterialDemandTrace();
    await trace.open(supplyItem('9', 'mv-v1'));
    await trace.changePage(2);
    await trace.changePageSize(25);

    expect(trace.currentPage.value).toBe(1);
    expect(trace.pageSize.value).toBe(25);
    expect(productionApi.listInventoryMaterialDemandTrace).toHaveBeenLastCalledWith('9', {
      materialVariantId: 'mv-v1',
      page: 1,
      pageSize: 25,
    });
  });
});
