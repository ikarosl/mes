import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MaterialListItem, ProductCategoryOption } from '@company/contracts';
import MaterialFormDialog from '../MaterialFormDialog.vue';

const { warning } = vi.hoisted(() => ({ warning: vi.fn() }));
vi.mock('../../../../utils/message', () => ({ EMessage: { warning } }));

const passthrough = { template: '<div><slot /></div>' };
const inputStub = {
  props: ['modelValue', 'placeholder', 'disabled'],
  emits: ['update:modelValue'],
  template:
    '<input :value="modelValue" :placeholder="placeholder" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" />',
};
const selectStub = {
  props: ['modelValue', 'placeholder'],
  emits: ['update:modelValue', 'visible-change'],
  template:
    '<select :value="modelValue" :aria-label="placeholder" @change="$emit(\'update:modelValue\', $event.target.value)" @focus="$emit(\'visible-change\', true)"><slot /></select>',
};
const buttonStub = {
  props: ['disabled'],
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
};

const category = (id: string): ProductCategoryOption => ({
  id,
  categoryCode: `C-${id}`,
  categoryName: `分类${id}`,
  itemKind: 'material',
});

const material = (overrides: Partial<MaterialListItem> = {}): MaterialListItem => ({
  id: 'm1',
  materialCode: 'M-1',
  materialName: '物料一',
  categoryId: 'c1',
  categoryCode: 'C-c1',
  categoryName: '分类一',
  unit: 'kg',
  acquireMethod: 'purchased',
  specValues: [],
  status: 1,
  variantCount: 0,
  variants: [],
  remark: null,
  updatedAt: null,
  ...overrides,
});

const mountDialog = (categoryOptions: ProductCategoryOption[]) =>
  mount(MaterialFormDialog, {
    props: {
      visible: true,
      editingMaterialId: null,
      categoryOptions,
      submitting: false,
    },
    global: {
      stubs: {
        'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
        'el-form': passthrough,
        'el-form-item': passthrough,
        'el-input': inputStub,
        'el-select': selectStub,
        'el-option': true,
        'el-switch': inputStub,
        'el-table': { template: '<div class="table-stub" />' },
        'el-table-column': true,
        'el-button': buttonStub,
      },
    },
  });

const saveButton = (wrapper: ReturnType<typeof mountDialog>) =>
  wrapper.findAll('button').find((button) => button.text().includes('保存物料'));

describe('MaterialFormDialog', () => {
  beforeEach(() => warning.mockReset());

  it('blocks submission when required base fields are empty', async () => {
    const wrapper = mountDialog([category('c1')]);

    await saveButton(wrapper)?.trigger('click');

    expect(warning).toHaveBeenCalledWith('请填写基础物料编码、物料名称和单位');
    expect(wrapper.emitted('save')).toBeUndefined();
  });

  it('blocks submission when the selected material category is unavailable', async () => {
    const wrapper = mountDialog([category('c1')]);
    const vm = wrapper.vm as unknown as { setForm: (row: MaterialListItem) => void };
    vm.setForm(material({ categoryId: 'expired-category' }));

    await saveButton(wrapper)?.trigger('click');

    expect(warning).toHaveBeenCalledWith('物料分类已失效，请重新选择');
    expect(wrapper.emitted('save')).toBeUndefined();
  });

  it('emits the complete material form payload after validation', async () => {
    const wrapper = mountDialog([category('c1')]);
    const vm = wrapper.vm as unknown as { setForm: (row: MaterialListItem) => void };
    vm.setForm(
      material({
        materialCode: 'M-1',
        materialName: '物料一',
        categoryId: 'c1',
        unit: 'kg',
        acquireMethod: 'purchased',
        status: 0,
        specValues: [{ key: '厚度', value: '1', unit: 'mm' }],
        remark: '采购物料',
      }),
    );

    await saveButton(wrapper)?.trigger('click');

    expect(wrapper.emitted('save')).toEqual([
      [
        {
          materialCode: 'M-1',
          materialName: '物料一',
          categoryId: 'c1',
          unit: 'kg',
          acquireMethod: 'purchased',
          enabled: false,
          specValues: [{ key: '厚度', value: '1', unit: 'mm' }],
          remark: '采购物料',
        },
      ],
    ]);
  });
});
