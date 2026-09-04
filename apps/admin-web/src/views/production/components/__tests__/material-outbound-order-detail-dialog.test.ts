import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { MaterialOutboundItem } from '@company/contracts';
import MaterialOutboundOrderDetailDialog from '../MaterialOutboundOrderDetailDialog.vue';

const pendingOrder: MaterialOutboundItem = {
  outboundId: '1',
  outboundNo: 'MO-001',
  productionBatchId: '2',
  batchNo: 'PB-001',
  workOrderId: '9',
  workOrderNo: 'WO-001',
  productId: '10',
  productCode: 'P-001',
  productName: '测试产品',
  status: 'pending_picking',
  remark: null,
  operatorId: null,
  operatorName: null,
  outboundAt: null,
  createdById: '3',
  createdByName: '管理员',
  createdAt: '2026-08-11T08:00:00.000Z',
  version: 0,
  quantitySummary: [{ unit: 'kg', quantity: '5.0000' }],
  details: [
    {
      id: '4',
      demandId: '5',
      allocationId: '6',
      itemId: '7',
      materialVariantId: 'mv-7',
      materialVariantCode: 'M-001-v1-A',
      itemCode: 'M-001',
      itemName: '测试物料',
      generationGroupKey: 'NORMAL:2',
      generationGroupType: 'normal',
      supplementNo: null,
      itemBatchId: '8',
      batchCode: 'IB-001',
      outboundQuantity: '5.0000',
      unit: 'kg',
      inventoryTransactionId: null,
    },
  ],
};

describe('MaterialOutboundOrderDetailDialog', () => {
  it('makes pending stock effects and missing ledger facts explicit', () => {
    const wrapper = mount(MaterialOutboundOrderDetailDialog, {
      props: { modelValue: true, loading: false, detail: pendingOrder },
      global: {
        stubs: {
          'el-dialog': { template: '<div><slot/><slot name="footer"/></div>' },
          'el-alert': { props: ['title'], template: '<p>{{ title }}</p>' },
          'el-descriptions': { template: '<div><slot/></div>' },
          'el-descriptions-item': { props: ['label'], template: '<div>{{ label }}<slot/></div>' },
          'el-table': { template: '<div><slot/></div>' },
          'el-table-column': true,
          'el-button': { template: '<button><slot/></button>' },
        },
        directives: { loading: () => undefined },
      },
    });

    expect(wrapper.text()).toContain('单据尚未扣减库存');
    expect(wrapper.text()).toContain('待出库');
    expect(wrapper.text()).toContain('打印');
  });

  it('does not mislabel a historical unknown cancellation source as manual', () => {
    const wrapper = mount(MaterialOutboundOrderDetailDialog, {
      props: {
        modelValue: true,
        loading: false,
        detail: {
          ...pendingOrder,
          status: 'cancelled',
          cancelSource: null,
          cancelReason: null,
          cancelledById: null,
          cancelledByName: null,
          cancelledAt: null,
        },
      },
      global: {
        stubs: {
          'el-dialog': { template: '<div><slot/><slot name="footer"/></div>' },
          'el-alert': { props: ['title'], template: '<p>{{ title }}</p>' },
          'el-descriptions': { template: '<div><slot/></div>' },
          'el-descriptions-item': { props: ['label'], template: '<div>{{ label }}<slot/></div>' },
          'el-table': { template: '<div><slot/></div>' },
          'el-table-column': true,
          'el-button': { template: '<button><slot/></button>' },
        },
        directives: { loading: () => undefined },
      },
    });

    expect(wrapper.text()).toContain('取消来源历史数据未记录');
    expect(wrapper.text()).not.toContain('取消来源人工取消');
  });
});
