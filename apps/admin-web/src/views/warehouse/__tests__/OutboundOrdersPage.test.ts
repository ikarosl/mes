import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import OutboundOrdersPage from '../OutboundOrdersPage.vue';

vi.mock('../../../api/production', () => ({
  productionApi: {
    listMaterialOutboundOrders: vi
      .fn()
      .mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    listMaterialOutboundBatchOptions: vi.fn().mockResolvedValue([]),
  },
}));

describe('OutboundOrdersPage', () => {
  it('uses current query/table layout and exposes only the supported pending order actions', () => {
    const wrapper = mount(OutboundOrdersPage, {
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
          'el-table-column': true,
          'el-pagination': true,
          'el-dialog': true,
          'el-tag': true,
          'el-alert': true,
          'el-input-number': true,
          'el-descriptions': true,
          'el-descriptions-item': true,
          TableToolbar: { template: '<div><slot name="actions"/><slot name="tools"/></div>' },
        },
        directives: { loading: () => undefined },
      },
    });
    expect(wrapper.find('.outbound-orders-page').exists()).toBe(true);
    expect(wrapper.find('.query-panel').exists()).toBe(true);
    expect(wrapper.find('.table-panel').exists()).toBe(true);
    expect(wrapper.text()).toContain('创建生产领料单');
    expect(wrapper.text()).not.toContain('拣货');
    expect(wrapper.text()).not.toContain('部分出库');
  });
});
