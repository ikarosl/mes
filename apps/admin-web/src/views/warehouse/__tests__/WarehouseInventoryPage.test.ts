import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import WarehouseInventoryPage from '../WarehouseInventoryPage.vue';

vi.mock('../../../api/production', () => ({
  productionApi: {
    listInventoryBatches: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    getInventoryBatch: vi.fn(),
  },
}));

describe('WarehouseInventoryPage', () => {
  it('uses the current read-only inventory layout without stock mutation actions', () => {
    const wrapper = mount(WarehouseInventoryPage, {
      global: {
        stubs: {
          'el-form': { template: '<form><slot/></form>' },
          'el-form-item': { template: '<div><slot/></div>' },
          'el-input': true,
          'el-select': { template: '<div><slot/></div>' },
          'el-option': true,
          'el-button': { template: '<button><slot/></button>' },
          'el-table': { template: '<div><slot/></div>' },
          'el-table-column': true,
          'el-pagination': true,
          'el-dialog': true,
          'el-tag': true,
          'el-alert': true,
          'el-descriptions': { template: '<div><slot/></div>' },
          'el-descriptions-item': { template: '<div><slot/></div>' },
          TableToolbar: { template: '<div><slot name="actions"/><slot name="tools"/></div>' },
        },
        directives: { loading: () => undefined },
      },
    });
    expect(wrapper.find('.inventory-page').exists()).toBe(true);
    expect(wrapper.find('.query-panel').exists()).toBe(true);
    expect(wrapper.find('.table-panel').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('调整库存');
    expect(wrapper.text()).not.toContain('盘点');
  });
});
