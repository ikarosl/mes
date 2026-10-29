import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BatchStepReportDialog from '../BatchStepReportDialog.vue';
import type { ProductionReportContext } from '../production-report-selection';

const confirm = vi.hoisted(() => vi.fn());
vi.mock('../../../../../utils/route-message-box', () => ({
  RouteMessageBox: { confirm },
}));

const task: ProductionReportContext = {
  productionBatchId: '1',
  stepRecordId: '9',
  batchNo: 'PB-1',
  stepOrder: 1,
  stepName: '切割',
  hasPreviousStep: false,
  status: 'doing',
  unit: '件',
  plannedQuantity: '10.0000',
  activatedSupplementInputQuantity: '0.0000',
  pendingSupplementInputQuantity: '0.0000',
  upperLimitQuantity: '10.0000',
  effectiveDirectNormalQuantity: '4.0000',
  effectiveNormalQuantity: '4.0000',
  availableReportQuantity: '6.0000',
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
  version: 2,
  canReport: true,
  reportBlockedReason: null,
};

const mountDialog = (
  props: {
    task?: ProductionReportContext;
    mode?: 'normal' | 'abnormal';
    intentStatus?: 'idle' | 'pending' | 'blocked' | 'expired';
  } = {},
) =>
  mount(BatchStepReportDialog, {
    props: {
      modelValue: true,
      task: props.task ?? task,
      mode: props.mode ?? 'normal',
      submitting: false,
      contextReady: true,
      ...(props.intentStatus ? { intentStatus: props.intentStatus } : {}),
    },
    global: {
      stubs: {
        'el-dialog': { template: '<div><slot/><slot name="footer"/></div>' },
        'el-form': { template: '<form><slot/></form>' },
        'el-form-item': { template: '<div><slot/></div>' },
        'el-alert': { props: ['title'], template: '<p>{{ title }}</p>' },
        'el-input-number': true,
        'el-input': {
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template:
            '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
        },
        'el-radio-group': {
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template:
            '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot/></select>',
        },
        'el-radio': {
          props: ['value'],
          template: '<option :value="value"><slot/></option>',
        },
        'el-button': {
          emits: ['click'],
          template: '<button @click="$emit(\'click\')"><slot/></button>',
        },
      },
    },
  });

describe('BatchStepReportDialog', () => {
  beforeEach(() => confirm.mockReset());

  it('submits one normal report within the unified remaining report quota', async () => {
    const wrapper = mountDialog({});
    const vm = wrapper.vm as unknown as {
      available: number;
      canSubmit: boolean;
      form: {
        quantity: string;
        abnormalOrigin: 'current_step' | 'previous_step' | null;
        remark: string;
      };
      submit: () => void;
    };
    expect(vm.available).toBe(6);
    await wrapper.find('input[aria-label="本次报工数量"]').setValue('1');
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
      task: { ...task, hasPreviousStep: true },
    });
    const vm = wrapper.vm as unknown as {
      canSubmit: boolean;
      form: {
        quantity: string;
        abnormalOrigin: 'current_step' | 'previous_step' | null;
        remark: string;
      };
      submit: () => void;
    };
    await wrapper.find('input[aria-label="本次报工数量"]').setValue('2');
    // 异常报工必须选择异常来源
    expect(vm.canSubmit).toBe(false);
    await wrapper.find('select').setValue('current_step');
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

  it('only allows current-step abnormal origin for the first route step', async () => {
    const wrapper = mountDialog({ mode: 'abnormal' });
    const vm = wrapper.vm as unknown as {
      canSubmit: boolean;
      form: { quantity: string; abnormalOrigin: string | null };
    };

    expect(wrapper.text()).not.toContain('前置工序异常');
    expect(wrapper.text()).toContain('当前为首道工序，只能上报当前工序发生的异常');
    expect(vm.form.abnormalOrigin).toBe('current_step');
    await wrapper.find('input[aria-label="本次报工数量"]').setValue('1');
    expect(vm.canSubmit).toBe(true);
    expect(wrapper.findAll('select option').map((option) => option.attributes('value'))).toEqual([
      'current_step',
    ]);
  });

  it('counts abnormal quantity against the same unified report limit', async () => {
    const wrapper = mountDialog({
      mode: 'abnormal',
      task: { ...task, hasPreviousStep: true },
    });
    const vm = wrapper.vm as unknown as {
      canSubmit: boolean;
      form: { quantity: string; abnormalOrigin: string | null };
    };
    // 超过本次可报数量（available = 6）不可提交
    await wrapper.find('input[aria-label="本次报工数量"]').setValue('7');
    await wrapper.find('select').setValue('current_step');
    expect(vm.canSubmit).toBe(false);
    await wrapper.find('input[aria-label="本次报工数量"]').setValue('6');
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
