import { flushPromises, mount } from '@vue/test-utils';
import { h, type VNode } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReturnOrdersPage from '../ReturnOrdersPage.vue';

const { listReturnOrders } = vi.hoisted(() => ({ listReturnOrders: vi.fn() }));
vi.mock('../../../api/warehouse', () => ({
  warehouseApi: {
    listReturnOrders,
    listReturnBatchOptions: vi.fn().mockResolvedValue([]),
  },
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
    const scrap = wrapper.findAll('button').find((button) => button.text().includes('退料报废'));
    expect(scrap?.attributes('disabled')).toBeDefined();
  });
});
