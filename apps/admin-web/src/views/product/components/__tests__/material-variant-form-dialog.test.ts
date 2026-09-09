import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { MaterialListItem } from '@company/contracts';
import MaterialVariantFormDialog from '../MaterialVariantFormDialog.vue';

const passthrough = { template: '<div><slot /></div>' };
const inputStub = {
  props: ['modelValue', 'placeholder', 'disabled'],
  emits: ['update:modelValue'],
  template:
    '<input :value="modelValue" :placeholder="placeholder" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" />',
};
const buttonStub = {
  props: ['disabled'],
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
};

const material = (): MaterialListItem => ({
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
});

const mountDialog = () =>
  mount(MaterialVariantFormDialog, {
    props: { visible: true, material: material(), submitting: false },
    global: {
      stubs: {
        'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
        'el-alert': passthrough,
        'el-form': passthrough,
        'el-form-item': passthrough,
        'el-row': passthrough,
        'el-col': passthrough,
        'el-input': inputStub,
        'el-button': buttonStub,
      },
    },
  });

const saveButton = (wrapper: ReturnType<typeof mountDialog>) =>
  wrapper.findAll('button').find((button) => button.text().includes('保存版本'));

describe('MaterialVariantFormDialog', () => {
  it('keeps saving disabled until both version fields are filled', async () => {
    const wrapper = mountDialog();
    const save = saveButton(wrapper);

    expect(save).toBeDefined();
    expect(save?.attributes('disabled')).toBeDefined();

    const major = wrapper.find('input[placeholder="例如 v1"]');
    const minor = wrapper.find('input[placeholder="例如 A"]');
    await major.setValue(' v2 ');
    expect(save?.attributes('disabled')).toBeDefined();
    await minor.setValue(' A ');

    expect(save?.attributes('disabled')).toBeUndefined();
    expect(wrapper.findAll('input').some((input) => input.element.value === 'M-1-v2-A')).toBe(true);
  });

  it('emits trimmed version fields and normalizes a blank remark to null', async () => {
    const wrapper = mountDialog();
    await wrapper.find('input[placeholder="例如 v1"]').setValue(' v2 ');
    await wrapper.find('input[placeholder="例如 A"]').setValue(' A ');
    const remark = wrapper
      .findAll('input')
      .find((input) => input.attributes('maxlength') === '5000');
    expect(remark).toBeDefined();
    await remark!.setValue('  版本备注  ');

    await saveButton(wrapper)?.trigger('click');

    expect(wrapper.emitted('save')).toEqual([
      [{ majorVersion: 'v2', minorVersion: 'A', remark: '版本备注' }],
    ]);
  });

  it('does not emit while the dialog is submitting', async () => {
    const wrapper = mount(MaterialVariantFormDialog, {
      props: { visible: true, material: material(), submitting: true },
      global: {
        stubs: {
          'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
          'el-alert': passthrough,
          'el-form': passthrough,
          'el-form-item': passthrough,
          'el-row': passthrough,
          'el-col': passthrough,
          'el-input': inputStub,
          'el-button': buttonStub,
        },
      },
    });

    expect(saveButton(wrapper)?.attributes('disabled')).toBeDefined();
    await saveButton(wrapper)?.trigger('click');
    expect(wrapper.emitted('save')).toBeUndefined();
  });
});
