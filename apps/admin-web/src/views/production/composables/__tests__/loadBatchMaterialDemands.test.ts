import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBatchMaterialDemands } from '../loadBatchMaterialDemands';

const { listMaterialDemandManagement } = vi.hoisted(() => ({
  listMaterialDemandManagement: vi.fn(),
}));
vi.mock('../../../../api/production', () => ({
  productionApi: { listMaterialDemandManagement },
}));

const row = (id: string) => ({ id, materialId: `material-${id}` });

describe('loadBatchMaterialDemands', () => {
  beforeEach(() => {
    listMaterialDemandManagement.mockReset();
  });

  it('loads every page before returning a complete BOM', async () => {
    listMaterialDemandManagement
      .mockResolvedValueOnce({ items: [row('1'), row('2')], total: 3, page: 1, pageSize: 100 })
      .mockResolvedValueOnce({ items: [row('3')], total: 3, page: 2, pageSize: 100 });

    await expect(loadBatchMaterialDemands('batch-1')).resolves.toEqual([
      row('1'),
      row('2'),
      row('3'),
    ]);
    expect(listMaterialDemandManagement).toHaveBeenNthCalledWith(1, {
      productionBatchId: 'batch-1',
      page: 1,
      pageSize: 100,
    });
    expect(listMaterialDemandManagement).toHaveBeenNthCalledWith(2, {
      productionBatchId: 'batch-1',
      page: 2,
      pageSize: 100,
    });
  });

  it('rejects when the server total changes while paging', async () => {
    listMaterialDemandManagement
      .mockResolvedValueOnce({ items: [row('1')], total: 2, page: 1, pageSize: 100 })
      .mockResolvedValueOnce({ items: [row('2'), row('3')], total: 3, page: 2, pageSize: 100 });

    await expect(loadBatchMaterialDemands('batch-1')).rejects.toThrow(
      '任务物料需求已变化，请重新打开弹窗',
    );
    expect(listMaterialDemandManagement).toHaveBeenCalledTimes(2);
  });

  it('rejects an empty page before the expected total has been collected', async () => {
    listMaterialDemandManagement.mockResolvedValueOnce({
      items: [],
      total: 1,
      page: 1,
      pageSize: 100,
    });

    await expect(loadBatchMaterialDemands('batch-1')).rejects.toThrow(
      '任务物料需求已变化，请重新打开弹窗',
    );
    expect(listMaterialDemandManagement).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate row identities instead of returning an incomplete BOM', async () => {
    listMaterialDemandManagement.mockResolvedValueOnce({
      items: [row('same'), row('same')],
      total: 2,
      page: 1,
      pageSize: 100,
    });

    await expect(loadBatchMaterialDemands('batch-1')).rejects.toThrow(
      '任务物料需求不完整，请重新打开弹窗',
    );
  });

  it('rejects a page that returns more rows than the declared total', async () => {
    listMaterialDemandManagement.mockResolvedValueOnce({
      items: [row('1'), row('2')],
      total: 1,
      page: 1,
      pageSize: 100,
    });

    await expect(loadBatchMaterialDemands('batch-1')).rejects.toThrow(
      '任务物料需求不完整，请重新打开弹窗',
    );
  });
});
