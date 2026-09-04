import { flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  });

  it('loads BOM rows and material candidates independently', async () => {
    materials.mockResolvedValue([bomRow]);
    productOptions.mockResolvedValue([
      // 半成品仍可作为分类名称，但底层业务 kind 统一为 material。
      option('1', 'material'),
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

  it('keeps BOM rows when candidate options fail (candidate source stays empty)', async () => {
    materials.mockResolvedValue([bomRow]);
    productOptions.mockRejectedValue(new Error('403'));
    const state = useProductMaterialEditor();

    const rows = await state.load('1');

    expect(rows).toHaveLength(1);
    expect(state.materialOptions.value).toEqual([]);
    // 候选刷新失败不影响明细加载成功：明细仍就绪可编辑
    expect(state.detailStatus.value).toBe('ready');
    expect(state.loadedProductId.value).toBe('1');
    // 自持候选实例刷新失败会提示，但不影响 BOM 明细与保存
    expect(warning).toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('becomes ready as soon as BOM detail resolves even if candidate refresh is pending', async () => {
    materials.mockResolvedValue([bomRow]);
    // 候选请求挂起（promise 不 resolve）：不得阻塞关键明细就绪
    productOptions.mockImplementation(() => new Promise(() => {}));
    const state = useProductMaterialEditor();

    const rows = await state.load('1');

    // 候选未返回时明细已就绪可编辑，不被候选拖累
    expect(rows).toHaveLength(1);
    expect(state.detailStatus.value).toBe('ready');
    expect(state.loadedProductId.value).toBe('1');
    // 候选尚未返回，options 保持为空
    expect(state.materialOptions.value).toEqual([]);
  });

  it('updates candidate options after a slow candidate refresh finally resolves', async () => {
    let resolveOptions!: (value: Array<ReturnType<typeof option>>) => void;
    materials.mockResolvedValue([bomRow]);
    productOptions.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOptions = resolve;
        }),
    );
    const state = useProductMaterialEditor();

    const rows = await state.load('1');
    expect(rows).toHaveLength(1);
    expect(state.detailStatus.value).toBe('ready');
    expect(state.materialOptions.value).toEqual([]);

    // 候选迟到返回：options 正常写回，不影响已就绪的明细状态
    resolveOptions([option('2', 'material'), option('9', 'material')]);
    await flushPromises();

    expect(state.materialOptions.value.map((o) => o.id)).toEqual(['2', '9']);
    expect(state.detailStatus.value).toBe('ready');
    expect(state.loadedProductId.value).toBe('1');
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

  it('discards a late load response for a previous product (last-request-wins)', async () => {
    let resolveA!: (value: Array<typeof bomRow>) => void;
    materials.mockImplementation((productId: string) =>
      productId === 'A'
        ? new Promise((resolve) => {
            resolveA = resolve;
          })
        : Promise.resolve([bomRow]),
    );
    productOptions.mockResolvedValue([option('2', 'material')]);
    const state = useProductMaterialEditor();

    const pendingA = state.load('A');
    const pendingB = state.load('B');
    await pendingB;
    resolveA([bomRow]);
    await pendingA;

    // 产品 B 的明细就绪状态保留，产品 A 的迟到响应被丢弃
    expect(state.loadedProductId.value).toBe('B');
    expect(state.detailStatus.value).toBe('ready');
  });
});
