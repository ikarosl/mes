import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductionExecutionCompletionDialog from '../ProductionExecutionCompletionDialog.vue';

const api = vi.hoisted(() => ({
  getExecutionCompletionCheck: vi.fn(),
  completeProductionExecution: vi.fn(),
}));
vi.mock('../../../../api/production/execution', () => ({
  productionExecutionApi: {
    getExecutionCompletionCheck: api.getExecutionCompletionCheck,
    completeProductionExecution: api.completeProductionExecution,
  },
}));
vi.mock('../../../../utils/message', () => ({
  EMessage: { success: vi.fn(), error: vi.fn() },
}));

const createTestRouter = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'production-execution-records', component: { template: '<div />' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  return router;
};

describe('ProductionExecutionCompletionDialog', () => {
  beforeEach(() => {
    api.getExecutionCompletionCheck.mockReset().mockResolvedValue({
      productionBatchId: '1',
      batchStatus: 'doing',
      version: 4,
      closeoutId: '8',
      closeoutVersion: 7,
      plannedQuantity: '10.0000',
      requiredStepCount: 2,
      completedRequiredStepCount: 2,
      activeMaterialDemandCount: 0,
      canComplete: true,
      blockers: [],
    });
    api.completeProductionExecution.mockReset().mockResolvedValue({
      productionBatchId: '1',
      batchStatus: 'closing',
      closeoutId: '8',
      executionCompletedAt: '2026-10-13T12:00:00+08:00',
      executionCompletedById: '7',
      version: 5,
    });
  });

  it('submits the checked task and closeout versions, then emits changed', async () => {
    const router = await createTestRouter();
    const wrapper = mount(ProductionExecutionCompletionDialog, {
      props: { visible: true, batchId: '1', batchLabel: 'PB-001' },
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
          'el-alert': true,
          'el-descriptions': { template: '<div><slot/></div>' },
          'el-descriptions-item': { template: '<div><slot/></div>' },
        },
        directives: { loading: () => undefined },
      },
    });
    await flushPromises();

    const submit = wrapper.findAll('button').find((button) => button.text() === '确认生产执行完工');
    expect(submit).toBeDefined();
    expect(submit!.element.disabled).toBe(false);
    await submit!.trigger('click');
    await flushPromises();

    expect(api.completeProductionExecution).toHaveBeenCalledWith(
      '1',
      { version: 4, closeoutVersion: 7 },
      expect.any(String),
    );
    expect(wrapper.emitted('changed')).toEqual([['1']]);
    expect(wrapper.emitted('update:visible')).toEqual([[false]]);
  });
});
