import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductionExecutionRecordsPage from '../ProductionExecutionRecordsPage.vue';

const api = vi.hoisted(() => ({
  listBatches: vi.fn(),
  getBatchExecutionRecords: vi.fn(),
  getExecutionCompletionCheck: vi.fn(),
  completeProductionExecution: vi.fn(),
}));
vi.mock('../../../api/production', () => ({ productionApi: api }));

describe('ProductionExecutionRecordsPage', () => {
  beforeEach(() => {
    api.listBatches.mockReset().mockResolvedValue({ items: [], total: 0 });
    api.getBatchExecutionRecords.mockReset();
    api.getExecutionCompletionCheck.mockReset();
    api.completeProductionExecution.mockReset();
  });

  it('uses the current project query-panel shell without duplicating the route title', () => {
    const wrapper = mount(ProductionExecutionRecordsPage, {
      global: {
        stubs: {
          TableToolbar: { template: '<div><slot name="actions"/><slot name="tools"/></div>' },
          'el-form': { template: '<form><slot/></form>' },
          'el-form-item': { template: '<div><slot/></div>' },
          'el-input': true,
          'el-button': true,
          'el-tooltip': { template: '<div><slot/></div>' },
          'el-empty': true,
          'el-dialog': true,
          'el-tag': true,
          'el-alert': true,
          'el-table': true,
          'el-table-column': true,
          'el-descriptions': true,
          'el-descriptions-item': true,
          'el-input-number': true,
          'el-pagination': true,
        },
        directives: { loading: () => undefined },
      },
    });
    expect(wrapper.find('.query-panel').exists()).toBe(true);
    expect(wrapper.find('.page-heading').exists()).toBe(false);
    expect(wrapper.find('.records-caption').text()).toContain('选择生产批次后查看');
    expect(wrapper.find('h1').exists()).toBe(false);
  });
});
