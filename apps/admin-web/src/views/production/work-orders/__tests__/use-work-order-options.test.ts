import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkOrderOption } from '@company/contracts';
import { productionWorkOrdersApi } from '../../../../api/production/work-orders';
import { useWorkOrderOptions } from '../use-work-order-options';

vi.mock('../../../../utils/message', () => ({
  EMessage: { warning: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../../api/production/work-orders', () => ({
  productionWorkOrdersApi: { workOrderOptions: vi.fn() },
}));

const order = (id: string): WorkOrderOption => ({
  id,
  workOrderNo: `WO-${id}`,
  orderType: 'mass_production',
  productId: '8',
  productCode: 'P-001',
  productName: '环形器',
  plannedQuantity: '50.0000',
  assignedQuantity: '0',
  terminatedPlannedQuantity: '0',
  finalOutput: {
    availableQuantity: '0',
    extraQuantity: '0',
    scrapQuantity: '0',
    totalQuantity: '0',
    plannedShortfallQuantity: '50.0000',
    finalizedBatchCount: 0,
    closingBatchCount: 0,
    pendingAvailableQuantity: '0',
    pendingExtraQuantity: '0',
  },
  remainingQuantity: '50.0000',
  planStartDate: '2026-08-01',
  planEndDate: '2026-08-31',
});

describe('useWorkOrderOptions', () => {
  beforeEach(() => {
    vi.mocked(productionWorkOrdersApi.workOrderOptions).mockReset();
  });

  it('refresh() 调用无参 API', async () => {
    vi.mocked(productionWorkOrdersApi.workOrderOptions).mockResolvedValue([order('a')]);
    const source = useWorkOrderOptions();

    await source.refresh();

    expect(productionWorkOrdersApi.workOrderOptions).toHaveBeenCalledWith();
  });

  it('每次 refresh 都重新请求', async () => {
    vi.mocked(productionWorkOrdersApi.workOrderOptions).mockResolvedValue([order('a')]);
    const source = useWorkOrderOptions();

    await source.refresh();
    await source.refresh();

    expect(productionWorkOrdersApi.workOrderOptions).toHaveBeenCalledTimes(2);
  });

  it('后请求先返回时旧响应不覆盖（last-request-wins）', async () => {
    let resolveFirst!: (value: WorkOrderOption[]) => void;
    vi.mocked(productionWorkOrdersApi.workOrderOptions)
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce([order('second')]);
    const source = useWorkOrderOptions();

    const first = source.refresh();
    const second = source.refresh();
    resolveFirst([order('first')]);
    await Promise.all([first, second]);

    expect(source.options.value).toEqual([order('second')]);
  });

  it('最新请求失败时保留上次成功快照', async () => {
    vi.mocked(productionWorkOrdersApi.workOrderOptions)
      .mockResolvedValueOnce([order('a')])
      .mockRejectedValueOnce(new Error('fail'));
    const source = useWorkOrderOptions();

    await source.refresh();
    await source.refresh();

    expect(source.options.value).toEqual([order('a')]);
    expect(source.status.value).toBe('error');
  });

  it('不再暴露 search()', () => {
    const source = useWorkOrderOptions();

    expect('search' in source).toBe(false);
  });

  it('formatOption 的 label 包含工单号、产品编码、产品名称', () => {
    const source = useWorkOrderOptions();

    expect(
      source.formatOption({
        id: '6',
        workOrderNo: 'WO-001',
        orderType: 'mass_production',
        productId: '8',
        productCode: 'P-001',
        productName: '环形器',
        plannedQuantity: '100.0000',
        assignedQuantity: '0',
        terminatedPlannedQuantity: '0',
        finalOutput: {
          availableQuantity: '0',
          extraQuantity: '0',
          scrapQuantity: '0',
          totalQuantity: '0',
          plannedShortfallQuantity: '100.0000',
          finalizedBatchCount: 0,
          closingBatchCount: 0,
          pendingAvailableQuantity: '0',
          pendingExtraQuantity: '0',
        },
        remainingQuantity: '100.0000',
        planStartDate: null,
        planEndDate: null,
      }),
    ).toBe('WO-001 / P-001 / 环形器 / 可分配 100');
  });
});
