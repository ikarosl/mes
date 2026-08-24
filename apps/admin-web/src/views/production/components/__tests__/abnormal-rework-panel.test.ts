import { mount } from '@vue/test-utils';
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
});
