import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { ProductListItem } from '@company/contracts';
import ProductMaterialDialog, { type MaterialRow } from '../ProductMaterialDialog.vue';

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

const product = (id: string): ProductListItem =>
  ({
    id,
    itemCode: id,
    productName: `产品${id}`,
    categoryId: 'c1',
    categoryCode: 'C1',
    categoryName: '分类1',
    itemKind: 'finished_product',
    defaultRouteId: null,
    defaultRouteName: null,
    unit: 'pcs',
    acquireMethod: 'self_made',
    specValues: [],
    status: 1,
    materialCount: 0,
    remark: null,
    updatedAt: null,
  }) as ProductListItem;

const bomRow = (id: string) => ({
  materialProductId: id,
  quantityPerUnit: '1',
  unit: 'kg',
  isKeyMaterial: true,
  needBatchRecord: false,
  remark: null,
});

/** 候选物料：BOM 行引用的物料必须在候选中，否则会被 hasUnavailableSelection 拦下 */
const materialOption = (id: string) => ({
  id,
  itemCode: id,
  productName: `物料${id}`,
  itemKind: 'material' as const,
  acquireMethod: 'purchased' as const,
  unit: 'kg',
  defaultRouteId: null,
});

const passthrough = { template: '<div><slot/><slot name="footer"/></div>' };

describe('ProductMaterialDialog', () => {
  beforeEach(() => {
    materials.mockReset();
    productOptions.mockReset();
    error.mockReset();
    warning.mockReset();
    setActivePinia(createPinia());
  });

  const mountDialog = () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    return mount(ProductMaterialDialog, {
      props: { visible: false, product: null, submitting: false },
      global: {
        plugins: [pinia],
        stubs: {
          'el-dialog': passthrough,
          'el-alert': {
            props: ['title'],
            template: '<div class="el-alert-stub" :data-title="title"><slot/></div>',
          },
          'el-table': true,
          'el-table-column': true,
          'el-select': true,
          'el-option': true,
          'el-input': true,
          'el-input-number': true,
          'el-switch': true,
          'el-button': {
            emits: ['click'],
            props: ['disabled'],
            template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot/></button>',
          },
        },
      },
    });
  };

  const buttonByText = (wrapper: ReturnType<typeof mountDialog>, text: string) =>
    wrapper.findAll('button').find((b) => b.text().includes(text));

  const saveButton = (wrapper: ReturnType<typeof mountDialog>) =>
    buttonByText(wrapper, '保存物料清单');

  const savedRows = (wrapper: ReturnType<typeof mountDialog>): MaterialRow[] | undefined =>
    wrapper.emitted<[MaterialRow[]]>('save')?.[0]?.[0];

  it('cannot save the previous product rows while the new product detail is loading or after it resolves', async () => {
    let resolveB!: (value: unknown) => void;
    materials.mockImplementation((productId: string) =>
      productId === 'A'
        ? Promise.resolve([bomRow('a1')])
        : new Promise((resolve) => {
            resolveB = resolve;
          }),
    );
    productOptions.mockResolvedValue([materialOption('a1'), materialOption('b1')]);
    const wrapper = mountDialog();

    // 打开产品 A：BOM 就绪，可保存
    await wrapper.setProps({ visible: true, product: product('A') });
    await flushPromises();
    expect(saveButton(wrapper)?.attributes('disabled')).toBeUndefined();

    // 切换到产品 B：明细加载中，A 的旧行仍留在表内，保存按钮禁用且不可保存
    await wrapper.setProps({ product: product('B') });
    await flushPromises();
    expect(saveButton(wrapper)?.attributes('disabled')).toBeDefined();
    await saveButton(wrapper)?.trigger('click');
    expect(wrapper.emitted('save')).toBeUndefined();

    // B 明细就绪后，保存的是 B 的行（而非 A 的旧行）
    resolveB([bomRow('b1')]);
    await flushPromises();
    expect(saveButton(wrapper)?.attributes('disabled')).toBeUndefined();
    await saveButton(wrapper)?.trigger('click');
    expect(savedRows(wrapper)?.map((r) => r.materialProductId)).toEqual(['b1']);
  });

  it('disables save and shows the error alert when the BOM detail fails to load', async () => {
    materials.mockRejectedValue(new Error('500'));
    productOptions.mockResolvedValue([materialOption('b1')]);
    const wrapper = mountDialog();

    await wrapper.setProps({ visible: true, product: product('B') });
    await flushPromises();

    expect(saveButton(wrapper)?.attributes('disabled')).toBeDefined();
    expect(wrapper.find('.el-alert-stub').attributes('data-title')).toContain('加载失败');
    await saveButton(wrapper)?.trigger('click');
    expect(wrapper.emitted('save')).toBeUndefined();
    expect(error).toHaveBeenCalled();
  });

  it('saves normally once the detail is ready for the current product', async () => {
    materials.mockResolvedValue([bomRow('b1')]);
    productOptions.mockResolvedValue([materialOption('b1')]);
    const wrapper = mountDialog();

    await wrapper.setProps({ visible: true, product: product('B') });
    await flushPromises();

    expect(saveButton(wrapper)?.attributes('disabled')).toBeUndefined();
    await saveButton(wrapper)?.trigger('click');
    expect(savedRows(wrapper)?.map((r) => r.materialProductId)).toEqual(['b1']);
  });
});
