import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { h, type VNode } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductionWorkerTaskItem } from '@company/contracts';
import WorkerTasksPage from '../WorkerTasksPage.vue';

const api = vi.hoisted(() => ({
  listWorkerTasks: vi.fn(),
  startStep: vi.fn(),
  createStepReport: vi.fn(),
  workerTaskSopContent: vi.fn(),
}));
vi.mock('../../../api/production', () => ({ productionApi: api }));

const createTestRouter = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'worker-tasks', component: { template: '<div />' } }],
  });
  await router.push('/');
  await router.isReady();
  return router;
};

describe('WorkerTasksPage', () => {
  beforeEach(() => {
    api.listWorkerTasks.mockReset().mockResolvedValue({ items: [], total: 0 });
    api.workerTaskSopContent.mockReset().mockResolvedValue(new Blob(['sop']));
  });

  it('uses the current table toolbar shell and presents execution rules without a duplicate title', async () => {
    const router = await createTestRouter();
    const wrapper = mount(WorkerTasksPage, {
      global: {
        plugins: [createPinia(), router],
        stubs: {
          TableToolbar: { template: '<div><slot name="actions"/><slot name="tools"/></div>' },
          BatchStepReportDialog: true,
          'el-tooltip': { template: '<div><slot/></div>' },
          'el-button': { template: '<button><slot/></button>' },
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
    expect(wrapper.find('.tasks-caption').text()).toContain('当前分派与历史记录');
    expect(wrapper.find('.execution-tip').text()).toContain('明确完成和重开');
  });

  it('downloads the frozen SOP through the employee-scoped endpoint', async () => {
    const router = await createTestRouter();
    const task = {
      stepRecordId: '9',
      productionBatchId: '1',
      batchNo: 'PB-001',
      workOrderId: '2',
      workOrderNo: 'WO-001',
      productId: '3',
      productCode: 'P-001',
      productName: '产品',
      batchStatus: 'doing',
      stepOrder: 1,
      hasPreviousStep: false,
      stepCode: 'CUT',
      stepName: '下料',
      sopFileName: 'SOP-v1.pdf',
      sopVersionNo: 'V1',
      status: 'completed',
      unit: 'pcs',
      plannedQuantity: '10',
      baseNormalQuantity: '10',
      requiredNormalQuantity: '10',
      upperLimitQuantity: '10',
      availableReportQuantity: '0',
      effectiveReportedQuantity: '10',
      effectiveDirectReportedQuantity: '10',
      effectiveNormalQuantity: '10',
      effectiveAbnormalQuantity: '0',
      effectiveDirectNormalQuantity: '10',
      effectiveDirectAbnormalQuantity: '0',
      remainingNormalQuantity: '0',
      previousStepNormalQuantity: null,
      directReportedVsPreviousNormalDifference: null,
      normalVsPreviousNormalDifference: null,
      normalVsTargetDifference: '0',
      activatedSupplementInputQuantity: '0',
      activatedSupplementTargetQuantity: '0',
      pendingSupplementInputQuantity: '0',
      quotaDistribution: {
        scrappedQuantity: '0',
        processingQuantity: '0',
        terminatedQuantity: '0',
        pendingReviewQuantity: '0',
        pendingReworkQuantity: '0',
        doingReworkQuantity: '0',
        isReliable: true,
        unavailableReason: null,
        pendingDispositions: [],
        pendingReworks: [],
        doingReworks: [],
        terminatedDispositions: [],
        cancelledReworks: [],
      },
      startedAt: null,
      completedAt: null,
      version: 1,
      canStart: false,
      startBlockedReason: null,
      canReport: false,
      reportBlockedReason: '工序已完成，请重新开工后再报工',
      canCorrectReport: true,
      correctionBlockedReason: null,
      canComplete: false,
      completeBlockedReason: null,
      canReopen: true,
      reopenBlockedReason: null,
    } satisfies ProductionWorkerTaskItem;
    api.listWorkerTasks.mockResolvedValue({ items: [task], total: 1 });
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
        plugins: [createPinia(), router],
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

  it('keeps employee actions limited to start/report and has no complete-task command', async () => {
    const router = await createTestRouter();
    const task = {
      stepRecordId: '9',
      productionBatchId: '1',
      batchNo: 'PB-001',
      workOrderId: '2',
      workOrderNo: 'WO-001',
      productId: '3',
      productCode: 'P-001',
      productName: '产品',
      batchStatus: 'doing',
      stepOrder: 1,
      hasPreviousStep: false,
      stepCode: 'CUT',
      stepName: '下料',
      sopFileName: null,
      sopVersionNo: null,
      status: 'doing',
      unit: 'pcs',
      plannedQuantity: '10',
      baseNormalQuantity: '10',
      requiredNormalQuantity: '10',
      upperLimitQuantity: '10',
      availableReportQuantity: '4',
      effectiveReportedQuantity: '6',
      effectiveDirectReportedQuantity: '6',
      effectiveNormalQuantity: '6',
      effectiveAbnormalQuantity: '0',
      effectiveDirectNormalQuantity: '6',
      effectiveDirectAbnormalQuantity: '0',
      remainingNormalQuantity: '4',
      previousStepNormalQuantity: null,
      directReportedVsPreviousNormalDifference: null,
      normalVsPreviousNormalDifference: null,
      normalVsTargetDifference: '-4',
      activatedSupplementInputQuantity: '0',
      activatedSupplementTargetQuantity: '0',
      pendingSupplementInputQuantity: '0',
      quotaDistribution: {
        scrappedQuantity: '0',
        processingQuantity: '0',
        terminatedQuantity: '0',
        pendingReviewQuantity: '0',
        pendingReworkQuantity: '0',
        doingReworkQuantity: '0',
        isReliable: true,
        unavailableReason: null,
        pendingDispositions: [],
        pendingReworks: [],
        doingReworks: [],
        terminatedDispositions: [],
        cancelledReworks: [],
      },
      startedAt: '2026-09-01T09:00:00+08:00',
      completedAt: null,
      version: 1,
      canStart: false,
      startBlockedReason: null,
      canReport: true,
      reportBlockedReason: null,
      canCorrectReport: true,
      correctionBlockedReason: null,
      canComplete: true,
      completeBlockedReason: null,
      canReopen: false,
      reopenBlockedReason: null,
    } satisfies ProductionWorkerTaskItem;
    api.listWorkerTasks.mockResolvedValue({ items: [task], total: 1 });

    const wrapper = mount(WorkerTasksPage, {
      global: {
        plugins: [createPinia(), router],
        stubs: {
          TableToolbar: { template: '<div><slot name="actions"/><slot name="tools"/></div>' },
          BatchStepReportDialog: true,
          'el-tooltip': { template: '<div><slot/></div>' },
          'el-button': { template: '<button><slot/></button>' },
          'el-alert': true,
          'el-table': { template: '<div><slot/></div>' },
          'el-table-column': {
            setup(
              _props: unknown,
              {
                slots,
              }: {
                slots: { default?: (scope: { row: ProductionWorkerTaskItem }) => VNode[] };
              },
            ) {
              return () => h('div', slots.default?.({ row: task }));
            },
          },
          'el-tag': { template: '<span><slot/></span>' },
        },
        directives: { loading: () => undefined },
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('正常报工');
    expect(wrapper.text()).toContain('异常报工');
    expect(wrapper.findAll('button').map((button) => button.text().trim())).not.toContain(
      '完成工序',
    );
    expect(Object.keys(api).some((key) => key.toLowerCase().includes('complete'))).toBe(false);
  });
});
