import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { BatchStepRecordItem } from '@company/contracts';
import StepExecutionDialog from '../StepExecutionDialog.vue';

const selectStub = {
  emits: ['visible-change', 'change', 'update:modelValue'],
  props: ['placeholder'],
  template:
    '<button class="select-stub" @click="$emit(\'visible-change\', true)">{{ placeholder }}</button>',
};

const dialogStub = {
  props: ['modelValue'],
  emits: ['open', 'update:modelValue'],
  watch: {
    modelValue(this: { $emit: (e: 'open') => void }, val: boolean) {
      if (val) this.$emit('open');
    },
  },
  template: '<div class="dialog-stub"><slot/><slot name="footer"/></div>',
};

const stepRecord = {
  id: 's1',
  version: 0,
  stepName: '工序1',
  defaultSopFileName: null,
  defaultResponsibleUserName: null,
  actualSopFileId: null,
  responsibleUserId: null,
} as unknown as BatchStepRecordItem;

/** 渲染默认插槽的透传 stub：`true` 会丢弃插槽内容，导致弹窗内表单不渲染 */
const passthroughStub = { template: '<div><slot /></div>' };

const openDialog = async (overrides: Record<string, unknown> = {}) => {
  const wrapper = mount(StepExecutionDialog, {
    props: {
      visible: false,
      stepRecord,
      sopFileOptions: [],
      submitting: false,
      ...overrides,
    },
    global: {
      stubs: {
        'el-dialog': dialogStub,
        'el-select': selectStub,
        'el-option': true,
        'el-button': { template: '<button><slot/></button>' },
        'el-form': passthroughStub,
        'el-form-item': passthroughStub,
      },
    },
  });
  await wrapper.setProps({ visible: true });
  await flushPromises();
  return wrapper;
};

type DialogWrapper = Awaited<ReturnType<typeof openDialog>>;

const emitVisibleChange = async (wrapper: DialogWrapper, placeholder: string): Promise<void> => {
  const button = wrapper.findAll('.select-stub').find((b) => b.text() === placeholder);
  expect(button).toBeDefined();
  await button!.trigger('click');
};

const eventCounts = (wrapper: DialogWrapper) => ({
  sopFiles: wrapper.emitted('refresh-sop-files')?.length ?? 0,
  products: wrapper.emitted('refresh-products')?.length ?? 0,
  routes: wrapper.emitted('refresh-routes')?.length ?? 0,
});

describe('StepExecutionDialog', () => {
  it('expanding the SOP file select refreshes only SOP files', async () => {
    const wrapper = await openDialog();
    const before = eventCounts(wrapper);

    await emitVisibleChange(wrapper, '留空则使用默认文件');

    const after = eventCounts(wrapper);
    expect(after.sopFiles).toBe(before.sopFiles + 1);
    expect(after.products).toBe(0);
    expect(after.routes).toBe(0);
  });

  it('opening the dialog refreshes only SOP files', async () => {
    const wrapper = await openDialog();
    expect(wrapper.emitted('refresh-sop-files')).toHaveLength(1);
    expect(wrapper.emitted('refresh-products')).toBeUndefined();
    expect(wrapper.emitted('refresh-routes')).toBeUndefined();
  });
});
