import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import MaterialOutboundDialog from '../MaterialOutboundDialog.vue';

describe('MaterialOutboundDialog', () => {
  it('offers only active allocations with positive orderable quantity', () => {
    const wrapper = mount(MaterialOutboundDialog, {
      props: {
        visible: true,
        demands: [
          {
            itemName: '物料A',
            allocations: [
              {
                allocationId: 'a1',
                allocationStatus: 'active',
                remainingOutboundQuantity: '2.0000',
                availableToOrderQuantity: '2.0000',
                pendingOutboundQuantity: '0.0000',
              },
              {
                allocationId: 'a2',
                allocationStatus: 'released',
                remainingOutboundQuantity: '3.0000',
                availableToOrderQuantity: '3.0000',
                pendingOutboundQuantity: '0.0000',
              },
            ],
          },
        ] as never,
        outbounds: [],
        loadingOutbounds: false,
        submitting: false,
      },
      global: {
        stubs: {
          'el-dialog': { template: '<div><slot/><slot name="footer"/></div>' },
          'el-alert': true,
          'el-table': { template: '<div><slot/></div>' },
          'el-table-column': true,
          'el-input': true,
          'el-input-number': true,
          'el-button': true,
        },
        directives: { loading: () => undefined },
      },
    });
    const vm = wrapper.vm as unknown as { availableAllocations: Array<{ allocationId: string }> };
    expect(vm.availableAllocations.map((row) => row.allocationId)).toEqual(['a1']);
  });
});
