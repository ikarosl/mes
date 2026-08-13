import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import BatchStepReportDialog from '../BatchStepReportDialog.vue';

const task = {
  stepRecordId: '9',
  productionBatchId: '1',
  batchNo: 'PB-1',
  workOrderId: '2',
  workOrderNo: 'WO-1',
  productId: '3',
  productCode: 'P-1',
  productName: '产品',
  stepOrder: 1,
  stepCode: 'S-1',
  stepName: '切割',
  status: 'doing',
  needRecord: true,
  unit: '件',
  plannedQuantity: '10.0000',
  baseNormalQuantity: '10.0000',
  requiredNormalQuantity: '10.0000',
  releasedNormalQuantity: '6.0000',
  availableNormalQuantity: '2.0000',
  effectiveReportedQuantity: '4.0000',
  effectiveDirectReportedQuantity: '4.0000',
  effectiveNormalQuantity: '4.0000',
  effectiveAbnormalQuantity: '0.0000',
  activatedSupplementInputQuantity: '0.0000',
  activatedSupplementTargetQuantity: '0.0000',
  pendingSupplementInputQuantity: '0.0000',
  isSupplementReopened: false,
  supplementBlockedReason: null,
  startedAt: null,
  version: 2,
  canStart: false,
  startBlockedReason: null,
} as const;

describe('BatchStepReportDialog', () => {
  it('submits only this report quantities and derives the remaining normal quantity', async () => {
    const wrapper = mount(BatchStepReportDialog, {
      props: { modelValue: true, task: task as never, submitting: false },
      global: {
        stubs: {
          'el-dialog': { template: '<div><slot/><slot name="footer"/></div>' },
          'el-form': { template: '<form><slot/></form>' },
          'el-form-item': { template: '<div><slot/></div>' },
          'el-alert': true,
          'el-input-number': true,
          'el-input': true,
          'el-button': { template: '<button @click="$emit(\'click\')"><slot/></button>' },
        },
      },
    });
    const vm = wrapper.vm as unknown as {
      remaining: number;
      available: number;
      form: { normalQuantity: number; abnormalQuantity: number; remark: string };
      submit: () => void;
    };
    expect(vm.remaining).toBe(6);
    expect(vm.available).toBe(2);
    vm.form.normalQuantity = 1;
    vm.form.abnormalQuantity = 1;
    vm.form.remark = ' 本次异常 ';
    vm.submit();
    expect(wrapper.emitted('submit')?.[0]).toEqual([
      { normalQuantity: 1, abnormalQuantity: 1, remark: '本次异常' },
    ]);
  });

  it('limits this normal report by upstream release without treating it as completion target', async () => {
    const wrapper = mount(BatchStepReportDialog, {
      props: { modelValue: true, task: task as never, submitting: false },
      global: {
        stubs: {
          'el-dialog': { template: '<div><slot/><slot name="footer"/></div>' },
          'el-alert': { props: ['title'], template: '<p>{{ title }}</p>' },
          'el-form': { template: '<form><slot/></form>' },
          'el-form-item': { template: '<div><slot/></div>' },
          'el-input-number': true,
          'el-input': true,
          'el-button': { template: '<button><slot/></button>' },
        },
      },
    });
    expect(wrapper.text()).toContain('达到当前放行量不会提前完成本工序');
    expect(wrapper.text()).toContain('最终剩余需完成');
  });

  it('counts abnormal quantity against the same released report capacity', () => {
    const wrapper = mount(BatchStepReportDialog, {
      props: { modelValue: true, task: task as never, submitting: false },
      global: {
        stubs: {
          'el-dialog': { template: '<div><slot/><slot name="footer"/></div>' },
          'el-form': { template: '<form><slot/></form>' },
          'el-form-item': { template: '<div><slot/></div>' },
          'el-alert': true,
          'el-input-number': true,
          'el-input': true,
          'el-button': true,
        },
      },
    });
    const vm = wrapper.vm as unknown as {
      canSubmit: boolean;
      form: { normalQuantity: number; abnormalQuantity: number };
    };
    vm.form.normalQuantity = 2;
    vm.form.abnormalQuantity = 1;
    expect(vm.canSubmit).toBe(false);
  });
});
