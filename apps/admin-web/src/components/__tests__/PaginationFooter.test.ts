import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import PaginationFooter from '../PaginationFooter.vue';

describe('PaginationFooter', () => {
  it('renders a configurable total suffix and forwards pagination changes', async () => {
    const wrapper = mount(PaginationFooter, {
      props: {
        total: 23,
        currentPage: 2,
        pageSize: 10,
        totalSuffix: '项正库存',
      },
      global: {
        stubs: {
          'el-select': {
            props: ['modelValue'],
            emits: ['update:modelValue'],
            template: '<button @click="$emit(\'update:modelValue\', 20)"><slot /></button>',
          },
          'el-option': true,
          'el-pagination': {
            emits: ['update:currentPage'],
            template: '<button class="next-page" @click="$emit(\'update:currentPage\', 3)" />',
          },
        },
      },
    });

    expect(wrapper.text()).toContain('共 23 项正库存');
    await wrapper.find('.page-size-select').trigger('click');
    await wrapper.find('.next-page').trigger('click');
    expect(wrapper.emitted('update:pageSize')).toEqual([[20]]);
    expect(wrapper.emitted('pageChange')).toEqual([[3]]);
  });
});
