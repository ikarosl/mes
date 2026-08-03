import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import BatchFormDialog from '../BatchFormDialog.vue';

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
  const wrapper = mount(BatchFormDialog, {
    props: {
      visible: false,
      editingBatchId: null,
      availableRouteOptions: [{ id: 'r1', routeName: '路线1', version: 'v1', productId: 'p1' }],
      userOptions: [{ id: 'u1', displayName: '张三' }],
      maxQuantity: null,
      defaultStartDate: '',
      defaultEndDate: '',
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
  routes: wrapper.emitted('refresh-routes')?.length ?? 0,
  users: wrapper.emitted('refresh-users')?.length ?? 0,
  products: wrapper.emitted('refresh-products')?.length ?? 0,
});

describe('BatchFormDialog', () => {
  it('expanding the route select refreshes only routes', async () => {
    const wrapper = await openDialog();
    const before = eventCounts(wrapper);

    await selectByPlaceholder(wrapper, '默认使用产品默认路线')!.trigger('click');

    const after = eventCounts(wrapper);
    expect(after.routes).toBe(before.routes + 1);
    expect(after.users).toBe(before.users);
    expect(after.products).toBe(0);
  });

  it('expanding the user select refreshes only users', async () => {
    const wrapper = await openDialog();
    const before = eventCounts(wrapper);

    await selectByPlaceholder(wrapper, '请选择负责人')!.trigger('click');

    const after = eventCounts(wrapper);
    expect(after.users).toBe(before.users + 1);
    expect(after.routes).toBe(before.routes);
    expect(after.products).toBe(0);
  });

  it('opening the dialog refreshes only routes and users, never products', async () => {
    const wrapper = await openDialog();
    expect(wrapper.emitted('refresh-routes')).toHaveLength(1);
    expect(wrapper.emitted('refresh-users')).toHaveLength(1);
    expect(wrapper.emitted('refresh-products')).toBeUndefined();
  });
});
