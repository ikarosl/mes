import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StockChecksPage from '../StockChecksPage.vue';

const { listStockChecks } = vi.hoisted(() => ({ listStockChecks: vi.fn() }));
vi.mock('../../../api/warehouse', () => ({
  warehouseApi: { listStockChecks },
}));
vi.mock('../../../utils/message', () => ({
  EMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

describe('StockChecksPage', () => {
  beforeEach(() => {
    listStockChecks.mockReset();
    listStockChecks.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
  });

  it('loads real stock-check data and presents creation as the primary action', async () => {
    const wrapper = mount(StockChecksPage, {
      global: {
        stubs: {
          'el-form': { template: '<form><slot/></form>' },
          'el-form-item': { template: '<div><slot/></div>' },
          'el-input': true,
          'el-select': { template: '<div><slot/></div>' },
          'el-option': true,
          'el-button': { template: '<button><slot/></button>' },
          'el-table': true,
          'el-table-column': true,
          'el-pagination': true,
          'el-dialog': true,
          'el-progress': true,
          'el-tag': true,
          'el-alert': true,
          'el-row': true,
          'el-col': true,
          'el-checkbox': true,
          'el-descriptions': true,
          'el-descriptions-item': true,
          'el-input-number': true,
          TableToolbar: { template: '<div><slot name="actions"/><slot name="tools"/></div>' },
        },
        directives: { loading: () => undefined },
      },
    });
    await flushPromises();

    expect(listStockChecks).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      keyword: undefined,
      status: undefined,
    });
    expect(wrapper.text()).toContain('创建盘点单');
    expect(wrapper.text()).not.toContain('生成调整流水');
  });
});
