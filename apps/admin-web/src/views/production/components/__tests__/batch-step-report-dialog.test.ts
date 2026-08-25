import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BatchStepReportDialog from '../BatchStepReportDialog.vue';

const confirm = vi.hoisted(() => vi.fn());
vi.mock('../../../../utils/route-message-box', () => ({
  RouteMessageBox: { confirm },
}));

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
  hasPreviousStep: false,
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
  canComplete: false,
  completeBlockedReason: null,
} as const;

const mountDialog = (props: Record<string, unknown>) =>
  mount(BatchStepReportDialog, {
    props: { modelValue: true, task: task as never, mode: 'normal', submitting: false, ...props },
    global: {
      stubs: {
        'el-dialog': { template: '<div><slot/><slot name="footer"/></div>' },
        'el-form': { template: '<form><slot/></form>' },
        'el-form-item': { template: '<div><slot/></div>' },
        'el-alert': { props: ['title'], template: '<p>{{ title }}</p>' },
        'el-input-number': true,
        'el-input': true,
        'el-radio-group': { template: '<div><slot/></div>' },
        'el-radio': { template: '<label><slot/></label>' },
        'el-button': {
          emits: ['click'],
          template: '<button @click="$emit(\'click\')"><slot/></button>',
        },
      },
    },
  });

describe('BatchStepReportDialog', () => {
  beforeEach(() => confirm.mockReset());

  it('submits only this report quantities and derives the remaining normal quantity', async () => {
    const wrapper = mountDialog({});
    const vm = wrapper.vm as unknown as {
      remaining: number;
      available: number;
      canSubmit: boolean;
      form: {
        quantity: number;
        abnormalOrigin: 'current_step' | 'previous_step' | null;
        remark: string;
      };
      submit: () => void;
    };
    expect(vm.remaining).toBe(6);
    expect(vm.available).toBe(2);
    vm.form.quantity = 1;
    vm.form.remark = ' 本次正常 ';
    expect(vm.canSubmit).toBe(true);
    vm.submit();
    expect(wrapper.emitted('submit')?.[0]).toEqual([
      {
        normalQuantity: 1,
        abnormalQuantity: 0,
        abnormalOrigin: null,
        remark: '本次正常',
      },
    ]);
  });

  it('submits only the abnormal quantity with a required origin in abnormal mode', async () => {
    const wrapper = mountDialog({
      mode: 'abnormal',
      task: { ...task, hasPreviousStep: true } as never,
    });
    const vm = wrapper.vm as unknown as {
      canSubmit: boolean;
      form: {
        quantity: number;
        abnormalOrigin: 'current_step' | 'previous_step' | null;
        remark: string;
      };
      submit: () => void;
    };
    vm.form.quantity = 2;
    // 异常报工必须选择异常来源
    expect(vm.canSubmit).toBe(false);
    vm.form.abnormalOrigin = 'current_step';
    expect(vm.canSubmit).toBe(true);
    vm.submit();
    expect(wrapper.emitted('submit')?.[0]).toEqual([
      {
        normalQuantity: 0,
        abnormalQuantity: 2,
        abnormalOrigin: 'current_step',
        remark: null,
      },
    ]);
  });

  it('only allows current-step abnormal origin for the first route step', () => {
    const wrapper = mountDialog({ mode: 'abnormal' });
    const vm = wrapper.vm as unknown as {
      canSubmit: boolean;
      form: { quantity: number; abnormalOrigin: string | null };
    };

    expect(wrapper.text()).not.toContain('前置工序异常');
    expect(wrapper.text()).toContain('当前为首道工序，只能上报当前工序发生的异常');
    expect(vm.form.abnormalOrigin).toBe('current_step');
    vm.form.quantity = 1;
    expect(vm.canSubmit).toBe(true);
    vm.form.abnormalOrigin = 'previous_step';
    expect(vm.canSubmit).toBe(false);
  });

  it('limits this normal report by upstream release without treating it as completion target', () => {
    const wrapper = mountDialog({});
    expect(wrapper.text()).toContain('达到当前放行量不会提前完成本工序');
    expect(wrapper.text()).toContain('最终剩余需完成');
  });

  it('counts abnormal quantity against the same released report capacity', () => {
    const wrapper = mountDialog({
      mode: 'abnormal',
      task: { ...task, hasPreviousStep: true } as never,
    });
    const vm = wrapper.vm as unknown as {
      canSubmit: boolean;
      form: { quantity: number; abnormalOrigin: string | null };
    };
    // 超过本次可报数量（available = 2）不可提交
    vm.form.quantity = 3;
    vm.form.abnormalOrigin = 'current_step';
    expect(vm.canSubmit).toBe(false);
    vm.form.quantity = 2;
    expect(vm.canSubmit).toBe(true);
  });

  it('requires explicit confirmation before discarding an ambiguous report intent', async () => {
    confirm.mockResolvedValue('confirm');
    const wrapper = mountDialog({ intentStatus: 'pending' });
    const cancel = wrapper.findAll('button').find((button) => button.text() === '取消');
    expect(cancel).toBeDefined();
    await cancel!.trigger('click');

    expect(confirm).toHaveBeenCalledOnce();
    expect(wrapper.emitted('resetIntent')).toHaveLength(1);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
  });
});
