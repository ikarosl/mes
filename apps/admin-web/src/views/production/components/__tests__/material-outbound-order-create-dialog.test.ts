import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import MaterialOutboundOrderCreateDialog from '../MaterialOutboundOrderCreateDialog.vue';

describe('MaterialOutboundOrderCreateDialog', () => {
  it('explains the pending-order boundary before a user creates the document', () => {
    const wrapper = mount(MaterialOutboundOrderCreateDialog, {
      props: {
        modelValue: true,
        batchOptions: [],
        candidates: [],
        optionLoading: false,
        candidateLoading: false,
        submitting: false,
        intentStatus: 'idle',
      },
      global: {
        stubs: {
          'el-dialog': { template: '<div><slot/><slot name="footer"/></div>' },
          'el-alert': { props: ['title'], template: '<p>{{ title }}</p>' },
          'el-form': { template: '<form><slot/></form>' },
          'el-form-item': { template: '<div><slot/></div>' },
          'el-select': { template: '<div><slot/></div>' },
          'el-option-group': { template: '<div><slot/></div>' },
          'el-option': true,
          'el-tag': { template: '<span><slot/></span>' },
          'el-input': true,
          'el-input-number': true,
          'el-empty': true,
          'el-table': { template: '<div><slot/></div>' },
          'el-table-column': true,
          'el-button': { template: '<button><slot/></button>' },
        },
        directives: { loading: () => undefined },
      },
    });

    expect(wrapper.text()).toContain('本步骤只创建待出库凭据，不扣减库存');
    expect(wrapper.text()).toContain('不同单位不会合并为误导性的总数量');
    expect(wrapper.text()).toContain('创建待出库单');
  });

  it('keeps blocked batches visible with an actionable reason instead of silently filtering them', () => {
    const wrapper = mount(MaterialOutboundOrderCreateDialog, {
      props: {
        modelValue: true,
        batchOptions: [
          {
            productionBatchId: '1',
            batchNo: 'PB-STALE',
            workOrderNo: 'WO-1',
            productCode: 'P-1',
            productName: '测试产品',
            batchStatus: 'material_partially_outbound',
            outboundEligibility: {
              eligible: false,
              outboundMode: null,
              blockedCode: 'short_batch_authorization_stale',
              blockedReason: '需求计划已变化，请到生产任务重新复核短批授权',
            },
          },
        ],
        candidates: [],
        optionLoading: false,
        candidateLoading: false,
        submitting: false,
        intentStatus: 'idle',
      },
      global: {
        stubs: {
          'el-dialog': { template: '<div><slot/><slot name="footer"/></div>' },
          'el-alert': { props: ['title'], template: '<p>{{ title }}</p>' },
          'el-form': { template: '<form><slot/></form>' },
          'el-form-item': { template: '<div><slot/></div>' },
          'el-select': { template: '<div><slot/></div>' },
          'el-option-group': { template: '<div><slot/></div>' },
          'el-option': true,
          'el-tag': { template: '<span><slot/></span>' },
          'el-input': true,
          'el-input-number': true,
          'el-empty': true,
          'el-table': { template: '<div><slot/></div>' },
          'el-table-column': true,
          'el-button': true,
        },
        directives: { loading: () => undefined },
      },
    });

    expect(wrapper.text()).toContain('另有 1 个生产批次暂不可制单');
    expect(wrapper.text()).toContain('PB-STALE');
    expect(wrapper.text()).toContain('需求计划已变化，请到生产任务重新复核短批授权');
  });
});
