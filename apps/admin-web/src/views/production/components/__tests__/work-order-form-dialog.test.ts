import { nextTick } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import WorkOrderFormDialog from '../WorkOrderFormDialog.vue';

vi.mock('../../../../utils/message', () => ({ EMessage: { warning: vi.fn(), error: vi.fn() } }));
import { EMessage } from '../../../../utils/message';

/** 按下拉占位符区分；点击模拟展开下拉（visible-change=true） */
const selectStub = {
  emits: ['visible-change', 'change', 'update:modelValue'],
  props: ['placeholder'],
  template:
    '<button class="select-stub" @click="$emit(\'visible-change\', true)">{{ placeholder }}</button>',
};

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

/** 渲染默认插槽的透传 stub：`true` 会丢弃插槽内容，导致弹窗内表单不渲染 */
const passthroughStub = { template: '<div><slot /></div>' };

const openDialog = async (overrides: Record<string, unknown> = {}) => {
  const wrapper = mount(WorkOrderFormDialog, {
    props: {
      visible: false,
      editingOrderId: null,
      productOptions: [
        {
          id: 'p1',
          productName: '产品1',
          itemCode: 'C1',
          itemKind: 'finished_product',
          acquireMethod: 'self_made',
          unit: '个',
          defaultRouteId: null,
        },
      ],
      productOptionsStatus: 'ready',
      userOptions: [{ id: 'u1', displayName: '张三' }],
      userOptionsStatus: 'ready',
      submitting: false,
      ...overrides,
    },
    global: {
      stubs: {
        'el-dialog': dialogStub,
        'el-select': selectStub,
        'el-option': true,
        'el-button': { template: '<button @click="$emit(\'click\')"><slot/></button>' },
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
  products: wrapper.emitted('refresh-products')?.length ?? 0,
  routes: wrapper.emitted('refresh-routes')?.length ?? 0,
  users: wrapper.emitted('refresh-users')?.length ?? 0,
});

describe('WorkOrderFormDialog', () => {
  it('expanding the product select refreshes only products', async () => {
    const wrapper = await openDialog();
    const before = eventCounts(wrapper);

    await emitVisibleChange(wrapper, '请选择产品');

    const after = eventCounts(wrapper);
    expect(after.products).toBe(before.products + 1);
    expect(after.users).toBe(before.users);
    expect(after.routes).toBe(0);
  });

  it('expanding the user select refreshes only users', async () => {
    const wrapper = await openDialog();
    const before = eventCounts(wrapper);

    await emitVisibleChange(wrapper, '请选择工单负责人');

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

  it('binds the select loading state to the candidate status', async () => {
    const wrapper = await openDialog({
      productOptionsStatus: 'loading',
      userOptionsStatus: 'loading',
    });
    const productButton = wrapper.findAll('.select-stub').find((b) => b.text() === '请选择产品');
    const userButton = wrapper.findAll('.select-stub').find((b) => b.text() === '请选择工单负责人');
    expect(productButton!.attributes('loading')).toBe('true');
    expect(userButton!.attributes('loading')).toBe('true');
  });

  it('requires both work-order plan dates', async () => {
    const wrapper = await openDialog();
    const vm = wrapper.vm as unknown as {
      form: {
        workOrderNo: string;
        productId: string;
        plannedQuantity: number;
        planStartDate: string;
        planEndDate: string;
      };
    };
    Object.assign(vm.form, {
      workOrderNo: 'WO-001',
      productId: 'p1',
      plannedQuantity: 10,
      planStartDate: '',
      planEndDate: '',
    });

    const save = wrapper.findAll('button').find((button) => button.text() === '保存工单');
    await save!.trigger('click');

    expect(wrapper.emitted('save')).toBeUndefined();
    expect(EMessage.warning).toHaveBeenCalledWith('请填写计划开始和计划完成日期');
  });

  it('rejects a work-order plan end date before its start date', async () => {
    const wrapper = await openDialog();
    const vm = wrapper.vm as unknown as {
      form: {
        workOrderNo: string;
        productId: string;
        plannedQuantity: number;
        planStartDate: string;
        planEndDate: string;
      };
    };
    Object.assign(vm.form, {
      workOrderNo: 'WO-001',
      productId: 'p1',
      plannedQuantity: 10,
      planStartDate: '2026-08-31',
      planEndDate: '2026-08-01',
    });

    const save = wrapper.findAll('button').find((button) => button.text() === '保存工单');
    await save!.trigger('click');

    expect(wrapper.emitted('save')).toBeUndefined();
    expect(EMessage.warning).toHaveBeenCalledWith('计划完成日期不能早于计划开始日期');
  });
});
