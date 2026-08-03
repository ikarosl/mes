import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { BatchStepRecordItem } from '@company/contracts';
import StepExecutionDialog from '../StepExecutionDialog.vue';

vi.mock('../../../../utils/message', () => ({ EMessage: { warning: vi.fn(), error: vi.fn() } }));

const selectStub = {
  emits: ['visible-change', 'change', 'update:modelValue'],
  props: ['placeholder'],
  template:
    '<button class="select-stub" @click="$emit(\'visible-change\', true)">{{ placeholder }}</button>',
};

const passthroughStub = { template: '<div><slot /></div>' };

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

const openDialog = async () => {
  const wrapper = mount(StepExecutionDialog, {
    props: {
      visible: false,
      stepRecord,
      sopFileOptions: [],
      userOptions: [{ id: 'u1', displayName: '张三' }],
      submitting: false,
    },
    global: {
      stubs: {
        'el-dialog': dialogStub,
        'el-select': selectStub,
        'el-option': true,
        'el-form': passthroughStub,
        'el-form-item': passthroughStub,
      },
    },
  });
  await wrapper.setProps({ visible: true });
  await nextTick();
  return wrapper;
};

type DialogWrapper = Awaited<ReturnType<typeof openDialog>>;

const selectByPlaceholder = (wrapper: DialogWrapper, placeholder: string) =>
  wrapper.findAll('.select-stub').find((b) => b.text() === placeholder);

const eventCounts = (wrapper: DialogWrapper) => ({
  sopFiles: wrapper.emitted('refresh-sop-files')?.length ?? 0,
  users: wrapper.emitted('refresh-users')?.length ?? 0,
  products: wrapper.emitted('refresh-products')?.length ?? 0,
  routes: wrapper.emitted('refresh-routes')?.length ?? 0,
});

describe('StepExecutionDialog', () => {
  it('expanding the SOP file select refreshes only SOP files', async () => {
    const wrapper = await openDialog();
    const before = eventCounts(wrapper);

    await selectByPlaceholder(wrapper, '留空则使用默认文件')!.trigger('click');

    const after = eventCounts(wrapper);
    expect(after.sopFiles).toBe(before.sopFiles + 1);
    expect(after.users).toBe(before.users);
    expect(after.products).toBe(0);
    expect(after.routes).toBe(0);
  });

  it('expanding the user select refreshes only users', async () => {
    const wrapper = await openDialog();
    const before = eventCounts(wrapper);

    await selectByPlaceholder(wrapper, '留空则使用默认负责人')!.trigger('click');

    const after = eventCounts(wrapper);
    expect(after.users).toBe(before.users + 1);
    expect(after.sopFiles).toBe(before.sopFiles);
    expect(after.products).toBe(0);
    expect(after.routes).toBe(0);
  });

  it('opening the dialog refreshes only SOP files and users', async () => {
    const wrapper = await openDialog();
    expect(wrapper.emitted('refresh-sop-files')).toHaveLength(1);
    expect(wrapper.emitted('refresh-users')).toHaveLength(1);
    expect(wrapper.emitted('refresh-products')).toBeUndefined();
    expect(wrapper.emitted('refresh-routes')).toBeUndefined();
  });
});
