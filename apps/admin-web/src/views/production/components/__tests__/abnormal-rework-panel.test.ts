import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AbnormalReworkPanel from '../AbnormalReworkPanel.vue';

describe('AbnormalReworkPanel', () => {
  it('shows actionable pending dispositions and source-bound rework state', () => {
    const wrapper = mount(AbnormalReworkPanel, {
      props: {
        dispositions: [
          {
            dispositionId: '1',
            dispositionNo: 'BAD-1',
            productionBatchId: '2',
            stepRecordId: '3',
            sourceReportId: '4',
            reviewStatus: 'pending_review',
            dispositionType: null,
            remark: null,
            version: 0,
            createdAt: '2026-08-13T08:00:00+08:00',
          },
        ],
        reports: [
          {
            reportId: '4',
            abnormalQuantity: '2.0000',
          },
        ] as never,
        reworks: [
          {
            reworkId: '5',
            reworkNo: 'RW-5',
            stepRecordId: '3',
            responsibleUserId: '7',
            responsibleUserName: '员工',
            reworkQuantity: '2.0000',
            unit: '件',
            status: 'pending',
          },
        ] as never,
        pendingKeys: new Set<string>(),
        unit: '件',
      },
      global: {
        stubs: {
          'el-tag': { template: '<span><slot/></span>' },
          'el-button': { template: '<button @click="$emit(\'click\')"><slot/></button>' },
          'el-dialog': true,
        },
      },
    });
    expect(wrapper.text()).toContain('批准返工');
    expect(wrapper.text()).toContain('2.0000 件');
    expect(wrapper.text()).toContain('开始返工');
  });
});
