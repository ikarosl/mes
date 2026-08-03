import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import TaskFormDialog from '../TaskFormDialog.vue';

vi.mock('../../../../api/product', () => ({
  productApi: { routeSteps: vi.fn().mockResolvedValue([]) },
}));
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

const openDialog = async () => {
  const wrapper = mount(TaskFormDialog, {
    props: {
      visible: false,
      editingTaskId: null,
      workOrderOptions: [],
      workOrderLoading: false,
      productOptions: [],
      routeOptions: [],
      userOptions: [{ id: 'u1', displayName: '张三' }],
      sopFileOptions: [],
      submitting: false,
    },
    global: {
      stubs: {
        'el-dialog': dialogStub,
        'el-select': selectStub,
        'el-option': true,
        'el-input': true,
        'el-input-number': true,
        'el-form': passthroughStub,
        'el-form-item': passthroughStub,
        'el-tabs': true,
        'el-tab-pane': true,
        'el-table': true,
        'el-table-column': true,
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
  workOrders: wrapper.emitted('refresh-work-orders')?.length ?? 0,
  routes: wrapper.emitted('refresh-routes')?.length ?? 0,
  users: wrapper.emitted('refresh-users')?.length ?? 0,
  sopFiles: wrapper.emitted('refresh-sop-files')?.length ?? 0,
  products: wrapper.emitted('refresh-products')?.length ?? 0,
});

describe('TaskFormDialog', () => {
  it('expanding the work order select refreshes only work orders', async () => {
    const wrapper = await openDialog();
    const before = eventCounts(wrapper);

    await selectByPlaceholder(wrapper, '请选择工单')!.trigger('click');

    const after = eventCounts(wrapper);
    expect(after.workOrders).toBe(before.workOrders + 1);
    expect(after.routes).toBe(before.routes);
    expect(after.users).toBe(before.users);
    expect(after.sopFiles).toBe(before.sopFiles);
    expect(after.products).toBe(0);
  });

  it('expanding the route select refreshes only routes', async () => {
    const wrapper = await openDialog();
    const before = eventCounts(wrapper);

    await selectByPlaceholder(wrapper, '请选择工艺路线')!.trigger('click');

    const after = eventCounts(wrapper);
    expect(after.routes).toBe(before.routes + 1);
    expect(after.workOrders).toBe(before.workOrders);
    expect(after.users).toBe(before.users);
    expect(after.sopFiles).toBe(before.sopFiles);
    expect(after.products).toBe(0);
  });

  it('expanding the user select refreshes only users', async () => {
    const wrapper = await openDialog();
    const before = eventCounts(wrapper);

    await selectByPlaceholder(wrapper, '请选择负责人')!.trigger('click');

    const after = eventCounts(wrapper);
    expect(after.users).toBe(before.users + 1);
    expect(after.workOrders).toBe(before.workOrders);
    expect(after.routes).toBe(before.routes);
    expect(after.sopFiles).toBe(before.sopFiles);
    expect(after.products).toBe(0);
  });

  it('opening the dialog refreshes exactly the resources it uses, never products', async () => {
    const wrapper = await openDialog();
    expect(wrapper.emitted('refresh-work-orders')).toHaveLength(1);
    expect(wrapper.emitted('refresh-routes')).toHaveLength(1);
    expect(wrapper.emitted('refresh-users')).toHaveLength(1);
    expect(wrapper.emitted('refresh-sop-files')).toHaveLength(1);
    expect(wrapper.emitted('refresh-products')).toBeUndefined();
  });
});
