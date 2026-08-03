import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProductsList } from '../useProductsList';

const { products, error } = vi.hoisted(() => ({ products: vi.fn(), error: vi.fn() }));
vi.mock('../../../../api/product', () => ({
  productApi: { products },
}));
vi.mock('../../../../utils/message', () => ({ EMessage: { error } }));

const pageResult = (items: unknown[], total: number, page: number) => ({
  items,
  total,
  page,
  pageSize: 10,
});

describe('useProductsList', () => {
  beforeEach(() => {
    products.mockReset();
    error.mockReset();
    products.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
  });

  it('loads the product list with trimmed page query', async () => {
    const state = useProductsList();
    state.query.keyword = ' 环形器 ';
    state.query.categoryId = '2';
    state.query.acquireMethod = 'self_made';

    await state.loadProducts();

    expect(products).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
      keyword: '环形器',
      categoryId: '2',
      acquireMethod: 'self_made',
      status: undefined,
    });
    expect(state.products.value).toEqual([]);
    expect(state.total.value).toBe(0);
  });

  it('resets the query to first page and reloads', async () => {
    const state = useProductsList();
    state.query.keyword = 'x';
    await state.handlePageChange(3);

    await state.resetQuery();

    expect(state.currentPage.value).toBe(1);
    expect(state.query.keyword).toBe('');
    expect(products).toHaveBeenCalledTimes(2);
  });

  it('discards a late response after the query changes', async () => {
    let resolvePage1!: (value: unknown) => void;
    products.mockImplementation((params: { page: number }) =>
      params.page === 1
        ? new Promise((resolve) => {
            resolvePage1 = resolve;
          })
        : Promise.resolve(pageResult([{ id: '2' }], 1, 2)),
    );
    const state = useProductsList();

    const pendingPage1 = state.loadProducts();
    const pendingPage2 = state.handlePageChange(2);
    await pendingPage2;
    resolvePage1(pageResult([{ id: '1' }], 5, 1));
    await pendingPage1;

    expect(state.products.value).toEqual([{ id: '2' }]);
    expect(state.total.value).toBe(1);
    expect(state.loading.value).toBe(false);
  });

  it('keeps loading until the latest request settles', async () => {
    let resolvePage1!: (value: unknown) => void;
    let resolvePage2!: (value: unknown) => void;
    products.mockImplementation((params: { page: number }) =>
      params.page === 1
        ? new Promise((resolve) => {
            resolvePage1 = resolve;
          })
        : new Promise((resolve) => {
            resolvePage2 = resolve;
          }),
    );
    const state = useProductsList();

    const pendingPage1 = state.loadProducts();
    const pendingPage2 = state.handlePageChange(2);
    resolvePage1(pageResult([], 0, 1));
    await pendingPage1;
    expect(state.loading.value).toBe(true); // 旧请求不得提前结束 loading

    resolvePage2(pageResult([{ id: '2' }], 1, 2));
    await pendingPage2;
    expect(state.loading.value).toBe(false);
    expect(state.products.value).toEqual([{ id: '2' }]);
  });

  it('does not surface a stale request failure', async () => {
    let rejectPage1!: (reason: unknown) => void;
    products.mockImplementation((params: { page: number }) =>
      params.page === 1
        ? new Promise((_, reject) => {
            rejectPage1 = reject;
          })
        : Promise.resolve(pageResult([], 0, 2)),
    );
    const state = useProductsList();

    const pendingPage1 = state.loadProducts();
    const pendingPage2 = state.handlePageChange(2);
    await pendingPage2;
    rejectPage1(new Error('500'));
    await pendingPage1;

    expect(error).not.toHaveBeenCalled();
    expect(state.loading.value).toBe(false);
  });
});
