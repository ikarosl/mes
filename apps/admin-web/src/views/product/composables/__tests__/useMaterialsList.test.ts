import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMaterialsList } from '../useMaterialsList';

const { materialList, error } = vi.hoisted(() => ({ materialList: vi.fn(), error: vi.fn() }));
vi.mock('../../../../api/product', () => ({ productApi: { materialList } }));
vi.mock('../../../../utils/message', () => ({ EMessage: { error } }));

const pageResult = (items: unknown[], total: number, page: number) => ({
  items,
  total,
  page,
  pageSize: 10,
});

describe('useMaterialsList', () => {
  beforeEach(() => {
    materialList.mockReset();
    error.mockReset();
    materialList.mockResolvedValue(pageResult([], 0, 1));
  });

  it('maps trimmed filters and status to the material list query', async () => {
    const state = useMaterialsList();
    state.query.keyword = '  电阻  ';
    state.query.categoryId = 'category-1';
    state.query.status = 'enabled';

    await state.load();

    expect(materialList).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
      keyword: '电阻',
      categoryId: 'category-1',
      status: 1,
    });
  });

  it('resets filters and page before loading again', async () => {
    const state = useMaterialsList();
    state.query.keyword = 'old';
    state.query.categoryId = 'category-1';
    state.query.status = 'disabled';
    await state.changePage(3);

    await state.reset();

    expect(state.currentPage.value).toBe(1);
    expect(state.query).toMatchObject({ keyword: '', categoryId: '', status: '' });
    expect(materialList).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 10,
      keyword: undefined,
      categoryId: undefined,
      status: undefined,
    });
    expect(materialList).toHaveBeenCalledTimes(2);
  });

  it('resets page when changing page size and forwards page changes', async () => {
    const state = useMaterialsList();

    await state.changePage(4);
    await state.changePageSize(25);

    expect(state.pageSize.value).toBe(25);
    expect(state.currentPage.value).toBe(1);
    expect(materialList).toHaveBeenNthCalledWith(1, {
      page: 4,
      pageSize: 10,
      keyword: undefined,
      categoryId: undefined,
      status: undefined,
    });
    expect(materialList).toHaveBeenNthCalledWith(2, {
      page: 1,
      pageSize: 25,
      keyword: undefined,
      categoryId: undefined,
      status: undefined,
    });
  });

  it('keeps the latest page when responses arrive out of order', async () => {
    let resolveFirst!: (value: unknown) => void;
    materialList.mockImplementation((params: { page: number }) =>
      params.page === 1
        ? new Promise((resolve) => {
            resolveFirst = resolve;
          })
        : Promise.resolve(pageResult([{ id: 'page-2' }], 1, 2)),
    );
    const state = useMaterialsList();

    const first = state.load();
    const second = state.changePage(2);
    await second;
    resolveFirst(pageResult([{ id: 'page-1' }], 5, 1));
    await first;

    expect(state.materials.value).toEqual([{ id: 'page-2' }]);
    expect(state.total.value).toBe(1);
    expect(state.loading.value).toBe(false);
  });

  it('does not notify for a stale failure', async () => {
    let rejectFirst!: (reason: unknown) => void;
    materialList.mockImplementation((params: { page: number }) =>
      params.page === 1
        ? new Promise((_, reject) => {
            rejectFirst = reject;
          })
        : Promise.resolve(pageResult([{ id: 'page-2' }], 1, 2)),
    );
    const state = useMaterialsList();

    const first = state.load();
    const second = state.changePage(2);
    await second;
    rejectFirst(new Error('stale failure'));
    await first;

    expect(error).not.toHaveBeenCalled();
    expect(state.materials.value).toEqual([{ id: 'page-2' }]);
    expect(state.loading.value).toBe(false);
  });

  it('keeps the previous successful rows and reports the latest failure', async () => {
    const state = useMaterialsList();
    materialList.mockResolvedValueOnce(pageResult([{ id: 'old' }], 1, 1));
    await state.load();
    materialList.mockRejectedValueOnce(new Error('latest failure'));

    await state.load();

    expect(state.materials.value).toEqual([{ id: 'old' }]);
    expect(state.total.value).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.any(Error), '物料资料加载失败');
    expect(state.loading.value).toBe(false);
  });
});
