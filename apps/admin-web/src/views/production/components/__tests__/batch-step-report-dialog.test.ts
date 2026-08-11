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
  requiredNormalQuantity: '10.0000',
  effectiveNormalQuantity: '4.0000',
  effectiveAbnormalQuantity: '0.0000',
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
          'el-input-number': true,
          'el-input': true,
          'el-button': { template: '<button @click="$emit(\'click\')"><slot/></button>' },
        },
      },
    });
    const vm = wrapper.vm as unknown as {
      remaining: number;
      form: { normalQuantity: number; abnormalQuantity: number; remark: string };
      submit: () => void;
    };
    expect(vm.remaining).toBe(6);
    vm.form.normalQuantity = 2;
    vm.form.abnormalQuantity = 1;
    vm.form.remark = ' 本次异常 ';
    vm.submit();
    expect(wrapper.emitted('submit')?.[0]).toEqual([
      { normalQuantity: 2, abnormalQuantity: 1, remark: '本次异常' },
    ]);
  });
});
