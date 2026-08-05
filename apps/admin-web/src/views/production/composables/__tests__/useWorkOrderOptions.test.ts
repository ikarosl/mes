import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkOrderOption } from '@company/contracts';
import { productionApi } from '../../../../api/production';
import { useWorkOrderOptions } from '../useWorkOrderOptions';

vi.mock('../../../../utils/message', () => ({
  EMessage: { warning: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../../api/production', () => ({
  productionApi: { workOrderOptions: vi.fn() },
}));

const order = (id: string): WorkOrderOption => ({
  id,
  workOrderNo: `WO-${id}`,
  productId: '8',
  productCode: 'P-001',
  productName: '环形器',
  remainingQuantity: '50.0000',
});

describe('useWorkOrderOptions', () => {
  beforeEach(() => {
    vi.mocked(productionApi.workOrderOptions).mockReset();
  });

  it('refresh() 调用无参 API', async () => {
    vi.mocked(productionApi.workOrderOptions).mockResolvedValue([order('a')]);
    const source = useWorkOrderOptions();

    await source.refresh();

    expect(productionApi.workOrderOptions).toHaveBeenCalledWith();
  });

  it('每次 refresh 都重新请求', async () => {
    vi.mocked(productionApi.workOrderOptions).mockResolvedValue([order('a')]);
    const source = useWorkOrderOptions();

    await source.refresh();
    await source.refresh();

    expect(productionApi.workOrderOptions).toHaveBeenCalledTimes(2);
  });

  it('后请求先返回时旧响应不覆盖（last-request-wins）', async () => {
    let resolveFirst!: (value: WorkOrderOption[]) => void;
    vi.mocked(productionApi.workOrderOptions)
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
    vi.mocked(productionApi.workOrderOptions)
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
        productId: '8',
        productCode: 'P-001',
        productName: '环形器',
        remainingQuantity: '100.0000',
      }),
    ).toBe('WO-001 / P-001 / 环形器 / 剩余 100');
  });
});
