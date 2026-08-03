import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProductCategoryOptions } from '../useProductCategoryOptions';

const { categoryOptions, warning } = vi.hoisted(() => ({
  categoryOptions: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('../../../../api/product', () => ({
  productApi: { categoryOptions },
}));
vi.mock('../../../../utils/message', () => ({ EMessage: { warning } }));

describe('useProductCategoryOptions', () => {
  beforeEach(() => {
    categoryOptions.mockReset();
    warning.mockReset();
  });

  it('loads category options and coalesces concurrent calls', async () => {
    categoryOptions.mockResolvedValue([
      { id: '1', categoryCode: 'MAT', categoryName: '物料', itemKind: 'material' },
    ]);
    const state = useProductCategoryOptions();

    await Promise.all([state.loadCategoryOptions(), state.loadCategoryOptions()]);

    expect(categoryOptions).toHaveBeenCalledOnce();
    expect(state.categoryOptions.value).toHaveLength(1);
  });

  it('degrades to empty and warns on failure without rejecting', async () => {
    categoryOptions.mockRejectedValue(new Error('403'));
    const state = useProductCategoryOptions();

    await expect(state.loadCategoryOptions()).resolves.toBeUndefined();

    expect(state.categoryOptions.value).toEqual([]);
    expect(warning).toHaveBeenCalledOnce();
  });
});
