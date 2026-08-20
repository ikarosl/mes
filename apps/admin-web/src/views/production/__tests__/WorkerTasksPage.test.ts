import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkerTasksPage from '../WorkerTasksPage.vue';

const api = vi.hoisted(() => ({
  listWorkerTasks: vi.fn(),
  startStep: vi.fn(),
  completeStep: vi.fn(),
  createStepReport: vi.fn(),
}));
vi.mock('../../../api/production', () => ({ productionApi: api }));

describe('WorkerTasksPage', () => {
  beforeEach(() => api.listWorkerTasks.mockReset().mockResolvedValue([]));

  it('uses the current table toolbar shell and presents execution rules without a duplicate title', () => {
    const wrapper = mount(WorkerTasksPage, {
      global: {
        stubs: {
          TableToolbar: { template: '<div><slot name="actions"/><slot name="tools"/></div>' },
          BatchStepReportDialog: true,
          'el-tooltip': { template: '<div><slot/></div>' },
          'el-button': true,
          'el-alert': true,
          'el-table': true,
          'el-table-column': true,
          'el-tag': true,
        },
        directives: { loading: () => undefined },
      },
    });
    expect(wrapper.find('.page-heading').exists()).toBe(false);
    expect(wrapper.find('h1').exists()).toBe(false);
    expect(wrapper.find('.tasks-caption').text()).toContain('仅显示当前分配给你的');
    expect(wrapper.find('el-alert-stub').attributes('title')).toContain('分别提交本次数量');
  });
});
