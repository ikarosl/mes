import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProductsList } from '../useProductsList';

const { products } = vi.hoisted(() => ({ products: vi.fn() }));
vi.mock('../../../../api/product', () => ({
  productApi: { products },
}));
vi.mock('../../../../utils/message', () => ({ EMessage: { error: vi.fn() } }));

describe('useProductsList', () => {
  beforeEach(() => {
    products.mockReset();
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
});
