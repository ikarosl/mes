import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { BatchStepRecordItem } from '@company/contracts';
import StepAssignmentDialog from '../StepAssignmentDialog.vue';

const step = {
  id: '10',
  stepOrder: 1,
  stepName: 'Cutting',
  responsibleUserId: '7',
  responsibleUserName: 'Operator A',
} as BatchStepRecordItem;

describe('StepAssignmentDialog', () => {
  it('preselects the existing employee for reassign and emits the explicit command value', async () => {
    const wrapper = mount(StepAssignmentDialog, {
      props: {
        visible: true,
        mode: 'reassign',
        stepRecord: step,
        userOptions: [{ id: '7', displayName: 'Operator A' }],
        submitting: false,
      },
      global: {
        stubs: {
          'el-dialog': { template: '<div><slot/><slot name="footer"/></div>' },
          'el-form': { template: '<div><slot/></div>' },
          'el-form-item': { template: '<div><slot/></div>' },
          'el-select': {
            props: ['modelValue'],
            template: '<div class="selected">{{ modelValue }}</div>',
          },
          'el-option': true,
          'el-button': {
            emits: ['click'],
            template: '<button @click="$emit(\'click\')"><slot/></button>',
          },
        },
      },
    });
    await flushPromises();
    expect(wrapper.find('.selected').text()).toBe('7');
    await wrapper.findAll('button')[1]!.trigger('click');
    expect(wrapper.emitted('submit')).toEqual([['7']]);
  });
});
