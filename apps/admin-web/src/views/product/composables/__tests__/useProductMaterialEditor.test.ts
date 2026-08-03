import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useProductMaterialEditor } from '../useProductMaterialEditor';

const { materials, productOptions, error, warning } = vi.hoisted(() => ({
  materials: vi.fn(),
  productOptions: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('../../../../api/product', () => ({
  productApi: { materials, productOptions },
}));
vi.mock('../../../../utils/message', () => ({ EMessage: { error, warning } }));

const option = (id: string, itemKind: string) => ({
  id,
  itemCode: `C-${id}`,
  productName: `物料${id}`,
  itemKind,
  acquireMethod: 'purchased',
  unit: 'kg',
  defaultRouteId: null,
});

const bomRow = { materialProductId: '2', quantityPerUnit: '1.5', unit: 'kg' };

describe('useProductMaterialEditor', () => {
  beforeEach(() => {
    materials.mockReset();
    productOptions.mockReset();
    error.mockReset();
    warning.mockReset();
    setActivePinia(createPinia());
  });

  it('loads BOM rows and material candidates independently', async () => {
    materials.mockResolvedValue([bomRow]);
    productOptions.mockResolvedValue([
      option('1', 'semi_finished'),
      option('2', 'material'),
      option('9', 'material'),
    ]);
    const state = useProductMaterialEditor();

    const rows = await state.load('1');

    expect(rows).toHaveLength(1);
    // 排除自身产品，保留物料/半成品候选
    expect(state.materialOptions.value.map((o) => o.id)).toEqual(['2', '9']);
    expect(state.detailStatus.value).toBe('ready');
    expect(state.loadedProductId.value).toBe('1');
  });

  it('keeps BOM rows when candidate options fail (first load stays empty)', async () => {
    materials.mockResolvedValue([bomRow]);
    productOptions.mockRejectedValue(new Error('403'));
    const state = useProductMaterialEditor();

    const rows = await state.load('1');

    expect(rows).toHaveLength(1);
    expect(state.materialOptions.value).toEqual([]);
    expect(warning).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('returns null and reports when BOM detail fails', async () => {
    materials.mockRejectedValue(new Error('500'));
    productOptions.mockResolvedValue([]);
    const state = useProductMaterialEditor();

    const rows = await state.load('1');

    expect(rows).toBeNull();
    expect(error).toHaveBeenCalled();
    expect(state.detailStatus.value).toBe('error');
  });

  it('keeps previous loadedProductId and marks error when a newer product detail fails', async () => {
    materials.mockResolvedValueOnce([bomRow]);
    materials.mockRejectedValueOnce(new Error('500'));
    productOptions.mockResolvedValue([]);
    const state = useProductMaterialEditor();

    await state.load('1');
    expect(state.detailStatus.value).toBe('ready');
    expect(state.loadedProductId.value).toBe('1');

    const rows = await state.load('2');
    expect(rows).toBeNull();
    // localRows 仍属于产品 1，不得误标为产品 2（保存守卫据此拦截）
    expect(state.detailStatus.value).toBe('error');
    expect(state.loadedProductId.value).toBe('1');
  });

  it('refreshOptions reloads only candidates, never BOM rows', async () => {
    materials.mockResolvedValue([bomRow]);
    productOptions.mockResolvedValue([option('2', 'material')]);
    const state = useProductMaterialEditor();

    await state.refreshOptions('1');

    expect(materials).not.toHaveBeenCalled();
    expect(state.materialOptions.value).toHaveLength(1);
    // 候选刷新不影响明细就绪状态
    expect(state.detailStatus.value).toBe('idle');
    expect(state.loadedProductId.value).toBeNull();
  });
});
