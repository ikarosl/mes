import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useProductFormOptions } from '../useProductFormOptions';

const { productOptions, warning } = vi.hoisted(() => ({
  productOptions: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('../../../../api/product', () => ({
  productApi: { productOptions },
}));
vi.mock('../../../../utils/message', () => ({ EMessage: { warning } }));

const option = (id: string, itemKind: string, acquireMethod: string) => ({
  id,
  itemCode: `C-${id}`,
  productName: `对象${id}`,
  itemKind,
  acquireMethod,
  unit: 'pcs',
  defaultRouteId: null,
});

describe('useProductFormOptions', () => {
  beforeEach(() => {
    productOptions.mockReset();
    warning.mockReset();
    setActivePinia(createPinia());
  });

  it('loads and filters to self-made non-material products', async () => {
    productOptions.mockResolvedValue([
      option('1', 'finished_product', 'self_made'),
      option('2', 'semi_finished', 'self_made'),
      option('3', 'material', 'self_made'),
      option('4', 'finished_product', 'purchased'),
    ]);
    const state = useProductFormOptions();

    await state.loadProductOptions();

    expect(state.productOptions.value.map((o) => o.id)).toEqual(['1', '2']);
  });

  it('keeps empty on first load failure without rejecting', async () => {
    productOptions.mockRejectedValue(new Error('403'));
    const state = useProductFormOptions();

    await expect(state.loadProductOptions()).resolves.toBeUndefined();

    expect(state.productOptions.value).toEqual([]);
    expect(warning).not.toHaveBeenCalled();
  });
});
