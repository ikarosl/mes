import { h, KeepAlive, reactive, type VNode } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    currentBomVersionId: null,
    currentBomVersionNo: null,
    currentBomLineCount: 0,
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
/** el-select：点击时发射 visible-change，用于验证“展开下拉只刷新候选、不重载明细” */
const selectStub = {
  emits: ['visible-change', 'update:modelValue'],
  props: ['placeholder'],
  template:
    '<button class="select-stub" @click="$emit(\'visible-change\', true)">{{ placeholder }}</button>',
};
/** el-table-column：向作用域插槽提供 { row }，否则逐行物料下拉无法渲染 */
const tableColumnStub = {
  props: ['label'],
  setup(
    _props: Record<string, unknown>,
    ctx: { slots: { default?: (scope: Record<string, unknown>) => unknown } },
  ) {
    const row = {
      materialProductId: 'b1',
      quantityPerUnit: 1,
      unit: 'kg',
      isKeyMaterial: true,
      needBatchRecord: false,
      remark: '',
    };
    return () => h('div', { class: 'column-stub' }, [ctx.slots.default?.({ row })] as VNode[]);
  },
};

/** el-table：数据驱动渲染行摘要（断言 localRows 内容），同时保留列插槽供下拉等交互测试使用 */
const tableStub = {
  props: ['data'],
  template: `
    <div class="table-stub">
      <div class="table-rows">
        <span v-for="(row, i) in data" :key="i" class="row-material">{{ row.materialProductId }}</span>
      </div>
      <slot />
    </div>
  `,
};

const dialogStubs = {
  'el-dialog': passthrough,
  'el-alert': {
    props: ['title'],
    template: '<div class="el-alert-stub" :data-title="title"><slot/></div>',
  },
  'el-table': tableStub,
  'el-table-column': tableColumnStub,
  'el-select': selectStub,
  'el-option': true,
  'el-input': true,
  'el-input-number': true,
  'el-switch': true,
  'el-button': {
    emits: ['click'],
    props: ['disabled'],
    template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot/></button>',
  },
};

describe('ProductMaterialDialog', () => {
  beforeEach(() => {
    materials.mockReset();
    productOptions.mockReset();
    error.mockReset();
    warning.mockReset();
  });

  const mountDialog = () =>
    mount(ProductMaterialDialog, {
      props: { visible: false, product: null, submitting: false },
      global: { stubs: dialogStubs },
    });

  /** 放入 KeepAlive：用激活/失活切换触发 onActivated，验证页面重新激活时的行为 */
  const mountDialogWithKeepAlive = () => {
    const state = reactive({
      visible: false,
      product: null as ProductListItem | null,
      active: true,
    });
    const Harness = {
      components: { KeepAlive, ProductMaterialDialog },
      setup() {
        return () =>
          h(KeepAlive, null, () =>
            state.active
              ? h(ProductMaterialDialog, {
                  visible: state.visible,
                  product: state.product,
                  submitting: false,
                  'onUpdate:visible': (v: boolean) => {
                    state.visible = v;
                  },
                })
              : h('span', { class: 'placeholder' }),
          );
      },
    };
    const wrapper = mount(Harness, { global: { stubs: dialogStubs } });
    return {
      wrapper,
      open: async (productValue: ProductListItem) => {
        state.product = productValue;
        state.visible = true;
        await flushPromises();
      },
      deactivate: async () => {
        state.active = false;
        await flushPromises();
      },
      activate: async () => {
        state.active = true;
        await flushPromises();
      },
    };
  };

  const buttonByText = (wrapper: ReturnType<typeof mountDialog>, text: string) =>
    wrapper.findAll('button').find((b) => b.text().includes(text));

  const saveButton = (wrapper: ReturnType<typeof mountDialog>) =>
    buttonByText(wrapper, '保存物料清单');

  const savedRows = (wrapper: ReturnType<typeof mountDialog>): MaterialRow[] | undefined =>
    wrapper.emitted<[MaterialRow[]]>('save')?.[0]?.[0];

  it('opening the dialog loads BOM detail and refreshes product candidates', async () => {
    materials.mockResolvedValue([bomRow('b1')]);
    productOptions.mockResolvedValue([materialOption('b1')]);
    const wrapper = mountDialog();

    await wrapper.setProps({ visible: true, product: product('B') });
    await flushPromises();

    expect(materials).toHaveBeenCalledWith('B');
    expect(productOptions).toHaveBeenCalledTimes(1);
  });

  it('expanding the material select refreshes only product candidates, never BOM detail', async () => {
    materials.mockResolvedValue([bomRow('b1')]);
    productOptions.mockResolvedValue([materialOption('b1')]);
    const wrapper = mountDialog();

    await wrapper.setProps({ visible: true, product: product('B') });
    await flushPromises();
    const optionsBefore = productOptions.mock.calls.length;

    await wrapper.find('.select-stub').trigger('click');
    await flushPromises();

    expect(productOptions).toHaveBeenCalledTimes(optionsBefore + 1);
    expect(materials).toHaveBeenCalledTimes(1);
  });

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

  it('enables editing as soon as the BOM detail is ready while candidate refresh is pending', async () => {
    materials.mockResolvedValue([bomRow('b1')]);
    // 候选请求挂起（promise 不 resolve）：不拖累关键明细，明细就绪后即可编辑
    productOptions.mockImplementation(() => new Promise(() => {}));
    const wrapper = mountDialog();

    await wrapper.setProps({ visible: true, product: product('B') });
    await flushPromises();

    expect(buttonByText(wrapper, '添加已有物料')?.attributes('disabled')).toBeUndefined();
    expect(saveButton(wrapper)?.attributes('disabled')).toBeUndefined();
    // 候选未返回时已选值不在候选内，保存被失效守卫拦截（不 emit save）
    await saveButton(wrapper)?.trigger('click');
    expect(wrapper.emitted('save')).toBeUndefined();
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

  it('on page activation only refreshes candidates, never retries a failed BOM detail', async () => {
    materials.mockRejectedValue(new Error('500'));
    productOptions.mockResolvedValue([materialOption('b1')]);
    const harness = mountDialogWithKeepAlive();

    // 打开弹窗：BOM 明细加载失败
    await harness.open(product('B'));
    expect(materials).toHaveBeenCalledTimes(1);
    expect(harness.wrapper.find('.el-alert-stub').attributes('data-title')).toContain('加载失败');

    // 页面重新激活：只刷新候选，不得重试明细、不得覆盖 localRows
    await harness.deactivate();
    await harness.activate();
    expect(materials).toHaveBeenCalledTimes(1); // 明细未被再次请求
    expect(productOptions).toHaveBeenCalledTimes(2); // 打开时 + 激活时各刷新一次候选
    expect(harness.wrapper.findAll('.row-material')).toHaveLength(0); // localRows 未被覆盖
    expect(harness.wrapper.find('.el-alert-stub').attributes('data-title')).toContain('加载失败');
  });

  it('disables adding a material and blocks save when the BOM detail failed', async () => {
    materials.mockRejectedValue(new Error('500'));
    productOptions.mockResolvedValue([materialOption('b1')]);
    const wrapper = mountDialog();

    await wrapper.setProps({ visible: true, product: product('B') });
    await flushPromises();

    // 明细未就绪：添加已有物料与保存均禁用，避免用户草稿行被后续覆盖
    expect(buttonByText(wrapper, '添加已有物料')?.attributes('disabled')).toBeDefined();
    expect(saveButton(wrapper)?.attributes('disabled')).toBeDefined();
    await saveButton(wrapper)?.trigger('click');
    expect(wrapper.emitted('save')).toBeUndefined();
  });

  it('discards a late BOM response that arrives after the dialog is closed', async () => {
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

    // 打开产品 A：BOM 就绪，localRows 写入 A 的行
    await wrapper.setProps({ visible: true, product: product('A') });
    await flushPromises();
    expect(wrapper.findAll('.row-material').map((w) => w.text())).toEqual(['a1']);

    // 切换到产品 B：明细挂起，localRows 仍为 A 的行
    await wrapper.setProps({ product: product('B') });
    await flushPromises();
    expect(wrapper.findAll('.row-material').map((w) => w.text())).toEqual(['a1']);

    // 关闭弹窗：invalidate 使在途 B 请求失效
    await wrapper.setProps({ visible: false });
    await flushPromises();

    // B 的迟到响应：代际已推进，不得写回 localRows
    resolveB([bomRow('b1')]);
    await flushPromises();
    expect(wrapper.findAll('.row-material').map((w) => w.text())).toEqual(['a1']);
  });
});
