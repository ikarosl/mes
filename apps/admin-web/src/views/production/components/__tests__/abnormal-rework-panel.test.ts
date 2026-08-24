import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import AbnormalReworkPanel from '../AbnormalReworkPanel.vue';

describe('AbnormalReworkPanel', () => {
  it('shows persisted reason or remark after abnormal disposition review', () => {
    const wrapper = mount(AbnormalReworkPanel, {
      props: {
        dispositions: [
          {
            dispositionId: '1',
            dispositionNo: 'AD-001',
            productionBatchId: '2',
            stepRecordId: '3',
            sourceReportId: '4',
            abnormalOrigin: 'current_step',
            reviewStatus: 'rejected',
            dispositionType: null,
            remark: '尺寸复核无异常',
            version: 1,
            createdAt: '2026-08-24T10:00:00+08:00',
          },
        ],
        reports: [{ reportId: '4', abnormalQuantity: '2' }] as never,
        reworks: [],
        pendingKeys: new Set<string>(),
        sourceStep: {} as never,
        routeSteps: [],
        candidateLoader: vi.fn(),
        planLoader: vi.fn(),
        planSaver: vi.fn(),
        planConfirmer: vi.fn(),
        intentStatusLoader: vi.fn(() => 'idle' as const),
        intentResetter: vi.fn(),
      },
      global: {
        stubs: {
          'el-tag': { template: '<span><slot/></span>' },
          'el-button': { template: '<button><slot/></button>' },
          'el-dialog': true,
        },
      },
    });

    expect(wrapper.text()).toContain('驳回原因：尺寸复核无异常');
  });

  it('keeps the review dialog open until final confirmation succeeds', async () => {
    let resolveConfirm!: () => void;
    const planConfirmer = vi.fn(() => new Promise<void>((resolve) => (resolveConfirm = resolve)));
    const wrapper = mount(AbnormalReworkPanel, {
      props: {
        dispositions: [
          {
            dispositionId: '8',
            dispositionNo: 'AD-008',
            productionBatchId: '2',
            stepRecordId: '3',
            sourceReportId: '4',
            abnormalOrigin: 'current_step',
            reviewStatus: 'pending_review',
            dispositionType: null,
            remark: null,
            version: 2,
            createdAt: '2026-08-24T10:00:00+08:00',
          },
        ],
        reports: [{ reportId: '4', abnormalQuantity: '2' }] as never,
        reworks: [],
        pendingKeys: new Set<string>(),
        sourceStep: { stepOrder: 1, stepName: '切割', stepRecordId: '3' } as never,
        routeSteps: [{ stepOrder: 1, stepName: '切割', stepRecordId: '3' }] as never,
        candidateLoader: vi.fn(async () => []),
        planLoader: vi.fn(
          async () =>
            ({
              planId: '10',
              dispositionId: '8',
              materialEndStepRecordId: '3',
              status: 'draft',
              version: 3,
              remark: '已复核',
              lines: [
                {
                  originalDemandId: '5',
                  itemCode: 'MAT-1',
                  itemName: '原料',
                  plannedQuantity: '2.0000',
                  unit: 'kg',
                },
              ],
            }) as never,
        ),
        planSaver: vi.fn(),
        planConfirmer,
        intentStatusLoader: vi.fn(() => 'pending' as const),
        intentResetter: vi.fn(),
      },
      global: {
        stubs: {
          'el-dialog': {
            props: ['modelValue'],
            template: '<div v-if="modelValue"><slot/><div><slot name="footer"/></div></div>',
          },
          'el-button': { template: '<button @click="$emit(\'click\')"><slot/></button>' },
          'el-tag': { template: '<span><slot/></span>' },
          'el-alert': true,
          'el-descriptions': { template: '<div><slot/></div>' },
          'el-descriptions-item': { template: '<div><slot/></div>' },
          'el-table': { template: '<div><slot/></div>' },
          'el-table-column': true,
          'el-form': { template: '<div><slot/></div>' },
          'el-form-item': { template: '<div><slot/></div>' },
          'el-select': true,
          'el-option': true,
          'el-input': true,
          'el-input-number': true,
          'el-checkbox': true,
        },
      },
    });

    const openButton = wrapper.findAll('button').find((button) => button.text() === '报废并补料');
    await openButton!.trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('重试最终确认');

    const confirmButton = wrapper
      .findAll('button')
      .find((button) => button.text() === '重试最终确认');
    await confirmButton!.trigger('click');
    await flushPromises();
    expect(planConfirmer).toHaveBeenCalledWith(expect.objectContaining({ dispositionId: '8' }), 3);
    expect(wrapper.text()).toContain('重试最终确认');

    resolveConfirm();
    await flushPromises();
    expect(wrapper.text()).not.toContain('重试最终确认');
  });
});
