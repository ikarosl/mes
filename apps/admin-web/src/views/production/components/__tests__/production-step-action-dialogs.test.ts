import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter as makeRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductionWorkerTaskItem } from '@company/contracts';
import ProductionStepActionDialogs from '../ProductionStepActionDialogs.vue';

const api = vi.hoisted(() => ({ startStep: vi.fn() }));
vi.mock('../../../../api/production', () => ({ productionApi: api }));
vi.mock('../../../../utils/message', () => ({
  EMessage: { success: vi.fn(), error: vi.fn() },
}));

const step = {
  stepRecordId: '9',
  productionBatchId: '1',
  batchStatus: 'doing',
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
  sopFileName: null,
  sopVersionNo: null,
  status: 'assigned',
  unit: 'pcs',
  plannedQuantity: '10.0000',
  baseNormalQuantity: '10.0000',
  upperLimitQuantity: '10.0000',
  requiredNormalQuantity: '10.0000',
  availableReportQuantity: '10.0000',
  effectiveReportedQuantity: '0.0000',
  effectiveDirectReportedQuantity: '0.0000',
  effectiveDirectNormalQuantity: '0.0000',
  effectiveDirectAbnormalQuantity: '0.0000',
  effectiveNormalQuantity: '0.0000',
  effectiveAbnormalQuantity: '0.0000',
  remainingNormalQuantity: '10.0000',
  previousStepNormalQuantity: null,
  directReportedVsPreviousNormalDifference: null,
  normalVsPreviousNormalDifference: null,
  normalVsTargetDifference: '-10.0000',
  activatedSupplementInputQuantity: '0.0000',
  activatedSupplementTargetQuantity: '0.0000',
  pendingSupplementInputQuantity: '0.0000',
  quotaDistribution: {
    scrappedQuantity: '0.0000',
    processingQuantity: '0.0000',
    terminatedQuantity: '0.0000',
    pendingReviewQuantity: '0.0000',
    pendingReworkQuantity: '0.0000',
    doingReworkQuantity: '0.0000',
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
  version: 4,
  canStart: true,
  startBlockedReason: null,
  canReport: true,
  reportBlockedReason: null,
  canCorrectReport: false,
  correctionBlockedReason: null,
  canComplete: false,
  completeBlockedReason: null,
  canReopen: false,
  reopenBlockedReason: null,
} satisfies ProductionWorkerTaskItem;

const createTestRouter = async () => {
  const router = makeRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'worker-tasks', component: { template: '<div />' } }],
  });
  await router.push('/');
  await router.isReady();
  return router;
};

describe('ProductionStepActionDialogs', () => {
  beforeEach(() => {
    api.startStep.mockReset().mockResolvedValue({});
  });

  it('starts the step with the selected frozen version and emits changed', async () => {
    const router = await createTestRouter();
    const wrapper = mount(ProductionStepActionDialogs, {
      props: { steps: [step], worker: true },
      global: {
        plugins: [createPinia(), router],
        stubs: {
          'el-dialog': {
            props: ['modelValue'],
            template: '<div v-if="modelValue"><slot/><slot name="footer"/></div>',
          },
          'el-button': {
            props: ['disabled', 'loading'],
            emits: ['click'],
            template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot/></button>',
          },
          'el-descriptions': { template: '<div><slot/></div>' },
          'el-descriptions-item': { template: '<div><slot/></div>' },
          'el-alert': true,
          'el-form': { template: '<form><slot/></form>' },
          'el-form-item': { template: '<div><slot/></div>' },
          'el-input': true,
          InlineHint: true,
          ProductionStepExecutionHistoryDialog: true,
        },
      },
    });
    const exposed = wrapper.vm as unknown as {
      open: (row: ProductionWorkerTaskItem, action: 'start') => Promise<void>;
    };

    await exposed.open(step, 'start');
    const submit = wrapper.findAll('button').find((button) => button.text() === '开始工序');
    expect(submit).toBeDefined();
    await submit!.trigger('click');
    await flushPromises();

    expect(api.startStep).toHaveBeenCalledWith('1', '9', 4);
    expect(wrapper.emitted('changed')).toHaveLength(1);
  });
});
