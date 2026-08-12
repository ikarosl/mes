import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkerTasksPage from '../WorkerTasksPage.vue';

const api = vi.hoisted(() => ({
  listWorkerTasks: vi.fn(),
  startStep: vi.fn(),
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
          'el-progress': true,
        },
        directives: { loading: () => undefined },
      },
    });
    expect(wrapper.find('.page-heading').exists()).toBe(false);
    expect(wrapper.find('h1').exists()).toBe(false);
    expect(wrapper.find('.tasks-caption').text()).toContain('仅显示当前分配给你的');
    expect(wrapper.find('el-alert-stub').attributes('title')).toContain('报工填写本次数量');
  });

  it('makes abnormal quantity and blocked reasons directly visible', async () => {
    api.listWorkerTasks.mockResolvedValue([
      {
        stepRecordId: 'step-1',
        productionBatchId: 'batch-1',
        batchNo: 'PB-001',
        workOrderId: 'order-1',
        workOrderNo: 'WO-001',
        productId: 'product-1',
        productCode: 'P-001',
        productName: '产品',
        stepOrder: 2,
        stepCode: 'S-002',
        stepName: '焊接',
        status: 'assigned',
        needRecord: true,
        unit: '件',
        plannedQuantity: '10.0000',
        requiredNormalQuantity: '10.0000',
        releasedNormalQuantity: '9.0000',
        availableNormalQuantity: '9.0000',
        effectiveReportedQuantity: '1.0000',
        effectiveNormalQuantity: '0.0000',
        effectiveAbnormalQuantity: '1.0000',
        startedAt: null,
        version: 1,
        canStart: false,
        startBlockedReason: '等待上道工序完成',
      },
    ]);

    const wrapper = mount(WorkerTasksPage, {
      global: {
        plugins: [ElementPlus],
        stubs: { BatchStepReportDialog: true },
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('等待上道工序完成');
    expect(wrapper.text()).toContain('已产生待处置异常');
    expect(wrapper.find('.abnormal-quantity').text()).toContain('1 件');
    expect(wrapper.find('.risk-error-row').exists()).toBe(true);
  });
});
