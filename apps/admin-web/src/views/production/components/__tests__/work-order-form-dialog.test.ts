import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import WorkOrderFormDialog from '../WorkOrderFormDialog.vue';

vi.mock('../../../../utils/message', () => ({ EMessage: { warning: vi.fn(), error: vi.fn() } }));

/** 按下拉占位符区分；点击模拟展开下拉（visible-change=true） */
const selectStub = {
  emits: ['visible-change', 'change', 'update:modelValue'],
  props: ['placeholder'],
  template:
    '<button class="select-stub" @click="$emit(\'visible-change\', true)">{{ placeholder }}</button>',
};

const passthroughStub = { template: '<div><slot /></div>' };

/** el-dialog 打开时发射 open，驱动弹窗自身的 @open 组合刷新 */
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
  const wrapper = mount(WorkOrderFormDialog, {
    props: {
      visible: false,
      editingOrderId: null,
      productOptions: [{ id: 'p1', productName: '产品1', itemCode: 'C1' }],
      userOptions: [{ id: 'u1', displayName: '张三' }],
      submitting: false,
    },
    global: {
      stubs: {
        'el-dialog': dialogStub,
        'el-select': selectStub,
        'el-option': true,
        'el-input': true,
        'el-input-number': true,
        'el-date-picker': true,
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
  products: wrapper.emitted('refresh-products')?.length ?? 0,
  routes: wrapper.emitted('refresh-routes')?.length ?? 0,
  users: wrapper.emitted('refresh-users')?.length ?? 0,
});

describe('WorkOrderFormDialog', () => {
  it('expanding the product select refreshes only products', async () => {
    const wrapper = await openDialog();
    const before = eventCounts(wrapper);

    await selectByPlaceholder(wrapper, '请选择产品')!.trigger('click');

    const after = eventCounts(wrapper);
    expect(after.products).toBe(before.products + 1);
    expect(after.users).toBe(before.users);
    expect(after.routes).toBe(0);
  });

  it('expanding the user select refreshes only users', async () => {
    const wrapper = await openDialog();
    const before = eventCounts(wrapper);

    await selectByPlaceholder(wrapper, '请选择工单负责人')!.trigger('click');

    const after = eventCounts(wrapper);
    expect(after.users).toBe(before.users + 1);
    expect(after.products).toBe(before.products);
    expect(after.routes).toBe(0);
  });

  it('opening the dialog refreshes only products and users, never routes', async () => {
    const wrapper = await openDialog();
    expect(wrapper.emitted('refresh-products')).toHaveLength(1);
    expect(wrapper.emitted('refresh-users')).toHaveLength(1);
    expect(wrapper.emitted('refresh-routes')).toBeUndefined();
  });
});
