import { nextTick } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BatchFormDialog from '../BatchFormDialog.vue';

const { routeOptions, warning } = vi.hoisted(() => ({
  routeOptions: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('../../../../utils/message', () => ({ EMessage: { warning, error: vi.fn() } }));
vi.mock('../../../../api/product', () => ({
  productApi: { routeOptions },
}));

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

/** 渲染默认插槽的透传 stub：`true` 会丢弃插槽内容，导致弹窗内表单不渲染 */
const passthroughStub = { template: '<div><slot /></div>' };

const openDialog = async () => {
  const wrapper = mount(BatchFormDialog, {
    props: {
      visible: false,
      editingBatchId: null,
      productId: 'p1',
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
        'el-button': { template: '<button><slot/></button>' },
        'el-input': true,
        'el-input-number': true,
        'el-date-picker': true,
        'el-form': passthroughStub,
        'el-form-item': passthroughStub,
      },
    },
  });
  await wrapper.setProps({ visible: true });
  await flushPromises();
  await nextTick();
  return wrapper;
};

type DialogWrapper = Awaited<ReturnType<typeof openDialog>>;

const emitVisibleChange = async (wrapper: DialogWrapper, placeholder: string): Promise<void> => {
  const button = wrapper.findAll('.select-stub').find((b) => b.text() === placeholder);
  expect(button).toBeDefined();
  await button!.trigger('click');
};

const eventCounts = (wrapper: DialogWrapper) => ({
  routes: wrapper.emitted('refresh-routes')?.length ?? 0,
  users: wrapper.emitted('refresh-users')?.length ?? 0,
  products: wrapper.emitted('refresh-products')?.length ?? 0,
});

describe('BatchFormDialog', () => {
  beforeEach(() => {
    warning.mockReset();
    routeOptions.mockReset();
    routeOptions.mockResolvedValue([
      {
        id: 'r1',
        routeCode: 'R1',
        routeName: '路线1',
        productId: 'p1',
        versionNo: 'v1',
        status: 'enabled',
      },
    ]);
  });

  it('expanding the route select re-requests the route candidates only', async () => {
    const wrapper = await openDialog();
    const before = routeOptions.mock.calls.length;

    await emitVisibleChange(wrapper, '默认使用产品默认路线');

    expect(routeOptions.mock.calls.length).toBe(before + 1);
    expect(wrapper.emitted('refresh-users')?.length ?? 0).toBe(1);
    expect(wrapper.emitted('refresh-routes')).toBeUndefined();
  });

  it('expanding the user select refreshes only users', async () => {
    const wrapper = await openDialog();
    const before = eventCounts(wrapper);
    const routeCallsBefore = routeOptions.mock.calls.length;

    await emitVisibleChange(wrapper, '请选择负责人');

    const after = eventCounts(wrapper);
    expect(after.users).toBe(before.users + 1);
    expect(after.routes).toBe(0);
    expect(routeOptions.mock.calls.length).toBe(routeCallsBefore);
  });

  it('opening the dialog re-requests the route candidates once and refreshes users only', async () => {
    const wrapper = await openDialog();
    expect(routeOptions).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('refresh-users')).toHaveLength(1);
    expect(wrapper.emitted('refresh-routes')).toBeUndefined();
    expect(wrapper.emitted('refresh-products')).toBeUndefined();
  });

  it('shows route/owner removed from the candidates as expired and blocks submit', async () => {
    const wrapper = await openDialog();
    const vm = wrapper.vm as unknown as {
      setForm: (row: unknown) => void;
      routeChoices: unknown[];
      userChoices: unknown[];
    };

    // 编辑既有批次：所选路线/负责人已不在当前候选内（候选刷新后被移除）
    vm.setForm({
      id: 'b1',
      batchNo: 'B-001',
      routeId: 'r2',
      plannedQuantity: 10,
      ownerId: 'u2',
      planStartDate: null,
      planEndDate: null,
      remark: '',
    });
    await nextTick();

    expect(vm.routeChoices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: 'r2', option: null, isUnavailable: true }),
      ]),
    );
    expect(vm.userChoices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: 'u2', option: null, isUnavailable: true }),
      ]),
    );

    const saveButton = wrapper.findAll('button').find((b) => b.text().trim() === '保存生产批次');
    expect(saveButton).toBeDefined();
    await saveButton!.trigger('click');
    await nextTick();

    expect(wrapper.emitted('save')).toBeUndefined();
    expect(warning).toHaveBeenCalled();
  });
});
