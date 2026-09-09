import { flushPromises, mount } from '@vue/test-utils';
import { h, type VNode } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReturnOrdersPage from '../ReturnOrdersPage.vue';

const {
  listReturnOrders,
  listReturnBatchOptions,
  listReturnCandidates,
  createReturnOrder,
  confirmReturnOrder,
  confirm,
} = vi.hoisted(() => ({
  listReturnOrders: vi.fn(),
  listReturnBatchOptions: vi.fn(),
  listReturnCandidates: vi.fn(),
  createReturnOrder: vi.fn(),
  confirmReturnOrder: vi.fn(),
  confirm: vi.fn(),
}));
vi.mock('../../../api/warehouse', () => ({
  warehouseApi: {
    listReturnOrders,
    listReturnBatchOptions,
    listReturnCandidates,
    createReturnOrder,
    confirmReturnOrder,
    cancelReturnOrder: vi.fn(),
    getReturnOrder: vi.fn(),
  },
}));
vi.mock('../../../utils/route-message-box', () => ({
  RouteMessageBox: { confirm, prompt: vi.fn() },
}));
vi.mock('../../../utils/message', () => ({
  EMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

const returnOrder = {
  id: '1',
  returnNo: 'TL-001',
  productionBatchId: '2',
  batchNo: 'PB-001',
  workOrderId: '3',
  workOrderNo: 'WO-001',
  productCode: 'FG-001',
  productName: '成品',
  status: 'pending' as const,
  returnAt: null,
  operatorId: null,
  operatorName: null,
  createdById: '1',
  createdByName: '管理员',
  createdAt: '2026-08-13T08:00:00+08:00',
  version: 0,
  remark: null,
  details: [
    {
      id: '4',
      allocationId: '5',
      demandId: '6',
      itemId: '7',
      itemCode: 'RM-001',
      itemName: '原料',
      materialVariantId: 'mv-001',
      materialVariantCode: 'RM-001-V1',
      itemBatchId: '8',
      batchCode: 'IB-001',
      returnQuantity: '2.0000',
      unit: '件',
      returnStockStatus: 'available' as const,
      releaseAfterReturn: true as const,
      inventoryTransactionId: null,
      remark: null,
    },
  ],
};

const tableColumnStub = {
  setup(_props: unknown, context: { slots: { default?: (scope: unknown) => unknown } }) {
    return () => h('div', [context.slots.default?.({ row: returnOrder })] as VNode[]);
  },
};

describe('ReturnOrdersPage', () => {
  beforeEach(() => {
    listReturnOrders.mockReset();
    listReturnOrders.mockResolvedValue({ items: [returnOrder], total: 1, page: 1, pageSize: 20 });
    listReturnBatchOptions.mockReset().mockResolvedValue([]);
    listReturnCandidates.mockReset().mockResolvedValue([]);
    createReturnOrder.mockReset();
    confirmReturnOrder.mockReset();
    confirm.mockReset().mockResolvedValue(undefined);
  });

  it('loads live data and exposes the fixed public-stock flow with scrap disabled', async () => {
    const wrapper = mount(ReturnOrdersPage, {
      global: {
        stubs: {
          'el-form': { template: '<form><slot/></form>' },
          'el-form-item': { template: '<div><slot/></div>' },
          'el-input': true,
          'el-select': { template: '<div><slot/></div>' },
          'el-option': true,
          'el-button': {
            template: '<button :disabled="disabled"><slot/></button>',
            props: ['disabled'],
          },
          'el-tooltip': { template: '<div><slot/></div>' },
          'el-table': { template: '<div><slot/></div>' },
          'el-table-column': tableColumnStub,
          'el-pagination': true,
          'el-dialog': true,
          'el-alert': true,
          'el-radio': true,
          'el-radio-group': true,
          'el-checkbox': true,
          'el-input-number': true,
          'el-descriptions': true,
          'el-descriptions-item': true,
          'el-tag': { template: '<span><slot/></span>' },
          TableToolbar: { template: '<div><slot name="actions"/><slot name="tools"/></div>' },
        },
        directives: { loading: () => undefined },
      },
    });
    await flushPromises();

    expect(listReturnOrders).toHaveBeenCalled();
    expect(wrapper.text()).toContain('新增退料单');
    expect(wrapper.text()).toContain('可用公共库存');
    expect(wrapper.text()).toContain('RM-001-V1');
    const scrap = wrapper.findAll('button').find((button) => button.text().includes('退料报废'));
    expect(scrap?.attributes('disabled')).toBeDefined();
  });

  it('shows only return-to-original-batch/public-stock guidance in the create dialog', async () => {
    const wrapper = mount(ReturnOrdersPage, {
      global: {
        stubs: {
          'el-form': { template: '<form><slot/></form>' },
          'el-form-item': { template: '<div><slot/></div>' },
          'el-input': true,
          'el-select': { template: '<div><slot/></div>' },
          'el-option': true,
          'el-button': {
            template: '<button :disabled="disabled"><slot/></button>',
            props: ['disabled'],
          },
          'el-tooltip': { template: '<div><slot/></div>' },
          'el-table': { template: '<div><slot/></div>' },
          'el-table-column': tableColumnStub,
          'el-pagination': true,
          'el-dialog': { template: '<div><slot/><slot name="footer"/></div>' },
          'el-alert': {
            props: ['title', 'description'],
            template: '<div class="alert-stub">{{ title }} {{ description }}</div>',
          },
          'el-radio': true,
          'el-radio-group': true,
          'el-checkbox': true,
          'el-input-number': true,
          'el-descriptions': true,
          'el-descriptions-item': true,
          'el-tag': { template: '<span><slot/></span>' },
          TableToolbar: { template: '<div><slot name="actions"/><slot name="tools"/></div>' },
        },
        directives: { loading: () => undefined },
      },
    });

    await (wrapper.vm as unknown as { openCreate: () => Promise<void> }).openCreate();
    await flushPromises();

    expect(wrapper.text()).toContain('退料不会产生或恢复物料需求');
    expect(wrapper.text()).toContain('物料将退回原库存批次，成为公共可用库存。');
    expect(wrapper.text()).toContain('物料损坏或丢失请申报生产领料损耗');
    expect(wrapper.text()).not.toContain('保留策略');
    expect(wrapper.text()).not.toContain('保留给原生产任务');
  });

  it('confirms the row version and refreshes only the return-order list after success', async () => {
    confirmReturnOrder.mockResolvedValue({ ...returnOrder, status: 'returned' });
    const wrapper = mount(ReturnOrdersPage, {
      global: {
        stubs: {
          'el-form': { template: '<form><slot/></form>' },
          'el-form-item': { template: '<div><slot/></div>' },
          'el-input': true,
          'el-select': { template: '<div><slot/></div>' },
          'el-option': true,
          'el-button': {
            emits: ['click'],
            props: ['disabled'],
            template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot/></button>',
          },
          'el-tooltip': { template: '<div><slot/></div>' },
          'el-table': { template: '<div><slot/></div>' },
          'el-table-column': tableColumnStub,
          'el-pagination': true,
          'el-dialog': true,
          'el-alert': true,
          'el-radio': true,
          'el-radio-group': true,
          'el-checkbox': true,
          'el-input-number': true,
          'el-descriptions': true,
          'el-descriptions-item': true,
          'el-tag': { template: '<span><slot/></span>' },
          TableToolbar: { template: '<div><slot name="actions"/><slot name="tools"/></div>' },
        },
        directives: { loading: () => undefined },
      },
    });
    await flushPromises();

    const button = wrapper.findAll('button').find((item) => item.text().trim() === '确认退料');
    expect(button).toBeDefined();
    await button!.trigger('click');
    await flushPromises();

    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining('不再为原生产任务保留'),
      '确认生产退料',
      expect.objectContaining({ confirmButtonText: '确认退料入库' }),
    );
    expect(confirmReturnOrder).toHaveBeenCalledWith('1', 0);
    expect(listReturnOrders).toHaveBeenCalledTimes(2);
  });

  it('keeps the selected return draft when creation fails', async () => {
    createReturnOrder.mockRejectedValue(new Error('网络断开'));
    const wrapper = mount(ReturnOrdersPage, {
      global: {
        stubs: {
          'el-form': { template: '<form><slot/></form>' },
          'el-form-item': { template: '<div><slot/></div>' },
          'el-input': true,
          'el-select': { template: '<div><slot/></div>' },
          'el-option': true,
          'el-button': true,
          'el-tooltip': { template: '<div><slot/></div>' },
          'el-table': { template: '<div><slot/></div>' },
          'el-table-column': tableColumnStub,
          'el-pagination': true,
          'el-dialog': true,
          'el-alert': true,
          'el-radio': true,
          'el-radio-group': true,
          'el-checkbox': true,
          'el-input-number': true,
          'el-descriptions': true,
          'el-descriptions-item': true,
          'el-tag': { template: '<span><slot/></span>' },
          TableToolbar: { template: '<div><slot name="actions"/><slot name="tools"/></div>' },
        },
        directives: { loading: () => undefined },
      },
    });
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      createVisible: boolean;
      form: { productionBatchId: string; remark: string };
      candidates: Array<Record<string, unknown>>;
      submitCreate: () => Promise<void>;
    };
    vm.createVisible = true;
    vm.form.productionBatchId = 'batch-1';
    vm.form.remark = '  余料  ';
    vm.candidates = [
      {
        allocationId: 'allocation-1',
        selected: true,
        returnQuantity: 2,
        returnableQuantity: '3',
      },
    ];

    await vm.submitCreate();

    expect(createReturnOrder).toHaveBeenCalledWith({
      productionBatchId: 'batch-1',
      remark: '余料',
      details: [{ allocationId: 'allocation-1', returnQuantity: 2 }],
    });
    expect(vm.createVisible).toBe(true);
    expect(vm.form.productionBatchId).toBe('batch-1');
    expect(vm.form.remark).toBe('  余料  ');
    expect(vm.candidates[0]).toMatchObject({ selected: true, returnQuantity: 2 });
  });
});
