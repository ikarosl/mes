import { flushPromises, mount } from '@vue/test-utils';
import { h, type VNode } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OutboundOrdersPage from '../OutboundOrdersPage.vue';

const { getMaterialOutbound, listMaterialOutboundOrders } = vi.hoisted(() => ({
  getMaterialOutbound: vi.fn(),
  listMaterialOutboundOrders: vi.fn(),
}));

vi.mock('../../../api/production', () => ({
  productionApi: {
    getMaterialOutbound,
    listMaterialOutboundOrders,
    listMaterialOutboundBatchOptions: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../../../utils/message', () => ({
  EMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

const outbound = {
  outboundId: 'outbound-1',
  outboundNo: 'OUT-20260813-001',
  productionBatchId: 'batch-1',
  batchNo: 'PB-001',
  workOrderId: 'work-order-1',
  workOrderNo: 'WO-001',
  productId: 'product-1',
  productCode: 'FG-001',
  productName: '测试产品',
  status: 'pending_picking' as const,
  outboundAt: null,
  operatorId: null,
  operatorName: null,
  createdById: 'user-1',
  createdByName: '管理员',
  createdAt: '2026-08-13T00:00:00.000Z',
  version: 0,
  remark: null,
  quantitySummary: [{ unit: '件', quantity: '1.0000' }],
  details: [
    {
      outboundDetailId: 'detail-1',
      demandId: 'demand-1',
      allocationId: 'allocation-1',
      itemId: 'item-1',
      itemBatchId: 'item-batch-1',
      batchCode: 'IB-001',
      itemCode: 'RM-001',
      itemName: '测试物料',
      generationGroupKey: 'NORMAL:batch-1',
      generationGroupType: 'normal' as const,
      supplementNo: null,
      outboundQuantity: '1.0000',
      unit: '件',
      inventoryTransactionId: null,
    },
  ],
};

const tableColumnStub = {
  setup(
    _props: Record<string, unknown>,
    context: { slots: { default?: (scope: Record<string, unknown>) => unknown } },
  ) {
    return () =>
      h('div', { class: 'column-stub' }, [context.slots.default?.({ row: outbound })] as VNode[]);
  },
};

const mountPage = (renderTableRows = false) =>
  mount(OutboundOrdersPage, {
    global: {
      stubs: {
        'el-form': { template: '<form><slot/></form>' },
        'el-form-item': { template: '<div><slot/></div>' },
        'el-input': true,
        'el-select': { template: '<div><slot/></div>' },
        'el-option': true,
        'el-button': { template: '<button><slot/></button>' },
        'el-tooltip': { template: '<div><slot/></div>' },
        'el-table': { template: '<div><slot/></div>' },
        'el-table-column': renderTableRows ? tableColumnStub : true,
        'el-pagination': true,
        'el-dialog': true,
        'el-tag': true,
        'el-alert': true,
        'el-input-number': true,
        'el-empty': true,
        'el-descriptions': true,
        'el-descriptions-item': true,
        TableToolbar: { template: '<div><slot name="actions"/><slot name="tools"/></div>' },
      },
      directives: { loading: () => undefined },
    },
  });

describe('OutboundOrdersPage', () => {
  beforeEach(() => {
    getMaterialOutbound.mockReset();
    listMaterialOutboundOrders.mockReset();
    listMaterialOutboundOrders.mockResolvedValue({
      items: [outbound],
      total: 1,
      page: 1,
      pageSize: 20,
    });
  });

  it('uses current query/table layout and exposes only the supported pending order actions', () => {
    const wrapper = mountPage();
    expect(wrapper.find('.outbound-orders-page').exists()).toBe(true);
    expect(wrapper.find('.query-panel').exists()).toBe(true);
    expect(wrapper.find('.table-panel').exists()).toBe(true);
    expect(wrapper.text()).toContain('创建生产领料单');
    expect(wrapper.text()).not.toContain('拣货');
    expect(wrapper.text()).not.toContain('部分出库');
  });

  it('prints through a hidden iframe without opening a new window and cleans it up', async () => {
    let resolveDetail!: (value: typeof outbound) => void;
    getMaterialOutbound.mockReturnValue(
      new Promise<typeof outbound>((resolve) => {
        resolveDetail = resolve;
      }),
    );
    let afterPrint: (() => void) | undefined;
    const printFrameWindow = {
      document: { write: vi.fn(), close: vi.fn() },
      focus: vi.fn(),
      print: vi.fn(),
      addEventListener: vi.fn((type: string, listener: () => void) => {
        if (type === 'afterprint') afterPrint = listener;
      }),
    };
    vi.spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get').mockReturnValue(
      printFrameWindow as unknown as Window,
    );
    const open = vi.spyOn(window, 'open');
    const wrapper = mountPage(true);
    await flushPromises();

    const printButton = wrapper.findAll('button').find((button) => button.text().trim() === '打印');
    expect(printButton).toBeDefined();
    await printButton!.trigger('click');

    expect(open).not.toHaveBeenCalled();
    expect(getMaterialOutbound).toHaveBeenCalledWith(outbound.outboundId);
    expect(document.querySelector('[data-print-frame="outbound-order"]')).toBeNull();

    resolveDetail(outbound);
    await flushPromises();

    const frame = document.querySelector<HTMLIFrameElement>('[data-print-frame="outbound-order"]');
    expect(frame).not.toBeNull();
    expect(frame?.getAttribute('aria-hidden')).toBe('true');
    expect(printFrameWindow.document.write).toHaveBeenCalledWith(
      expect.stringContaining(outbound.outboundNo),
    );
    expect(printFrameWindow.document.close).toHaveBeenCalledOnce();
    expect(printFrameWindow.focus).toHaveBeenCalledOnce();
    expect(printFrameWindow.print).toHaveBeenCalledOnce();

    afterPrint?.();
    expect(document.querySelector('[data-print-frame="outbound-order"]')).toBeNull();
  });
});
