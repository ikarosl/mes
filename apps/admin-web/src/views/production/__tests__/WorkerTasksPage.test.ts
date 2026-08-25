import { flushPromises, mount } from '@vue/test-utils';
import { h, type VNode } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductionWorkerTaskItem } from '@company/contracts';
import WorkerTasksPage from '../WorkerTasksPage.vue';

const api = vi.hoisted(() => ({
  listWorkerTasks: vi.fn(),
  startStep: vi.fn(),
  completeStep: vi.fn(),
  createStepReport: vi.fn(),
  workerTaskSopContent: vi.fn(),
}));
vi.mock('../../../api/production', () => ({ productionApi: api }));

describe('WorkerTasksPage', () => {
  beforeEach(() => {
    api.listWorkerTasks.mockReset().mockResolvedValue([]);
    api.workerTaskSopContent.mockReset().mockResolvedValue(new Blob(['sop']));
  });

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

  it('downloads the frozen SOP through the employee-scoped endpoint', async () => {
    const task = {
      stepRecordId: '9',
      productionBatchId: '1',
      batchNo: 'PB-001',
      workOrderId: '2',
      workOrderNo: 'WO-001',
      productId: '3',
      productCode: 'P-001',
      productName: '产品',
      stepOrder: 1,
      hasPreviousStep: false,
      stepCode: 'CUT',
      stepName: '下料',
      sopFileName: 'SOP-v1.pdf',
      sopVersionNo: 'V1',
      status: 'completed',
      needRecord: true,
      unit: 'pcs',
      plannedQuantity: '10',
      baseNormalQuantity: '10',
      requiredNormalQuantity: '10',
      releasedNormalQuantity: '10',
      availableNormalQuantity: '0',
      effectiveReportedQuantity: '10',
      effectiveDirectReportedQuantity: '10',
      effectiveNormalQuantity: '10',
      effectiveAbnormalQuantity: '0',
      activatedSupplementInputQuantity: '0',
      activatedSupplementTargetQuantity: '0',
      pendingSupplementInputQuantity: '0',
      isSupplementReopened: false,
      supplementBlockedReason: null,
      startedAt: null,
      version: 1,
      canStart: false,
      startBlockedReason: null,
      canComplete: false,
      completeBlockedReason: null,
    } satisfies ProductionWorkerTaskItem;
    api.listWorkerTasks.mockResolvedValue([task]);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn().mockReturnValue('blob:sop'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    const wrapper = mount(WorkerTasksPage, {
      global: {
        stubs: {
          TableToolbar: { template: '<div><slot name="actions"/><slot name="tools"/></div>' },
          BatchStepReportDialog: true,
          'el-tooltip': { template: '<div><slot/></div>' },
          'el-button': { template: '<button @click="$emit(\'click\')"><slot/></button>' },
          'el-alert': true,
          'el-table': { template: '<div><slot/></div>' },
          'el-table-column': {
            setup:
              (
                _props: unknown,
                {
                  slots,
                }: {
                  slots: {
                    default?: (scope: { row: ProductionWorkerTaskItem }) => VNode[];
                  };
                },
              ) =>
              () =>
                h('div', slots.default?.({ row: task })),
          },
          'el-tag': { template: '<span><slot/></span>' },
        },
        directives: { loading: () => undefined },
      },
    });
    await flushPromises();

    const download = wrapper.findAll('button').find((button) => button.text() === '下载 SOP');
    expect(download).toBeDefined();
    await download!.trigger('click');
    await flushPromises();

    expect(api.workerTaskSopContent).toHaveBeenCalledWith('1', '9');
  });
});
