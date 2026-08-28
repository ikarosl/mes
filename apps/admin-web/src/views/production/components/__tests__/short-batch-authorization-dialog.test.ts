import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ShortBatchAuthorizationDialog from '../ShortBatchAuthorizationDialog.vue';

describe('ShortBatchAuthorizationDialog', () => {
  it('requires an explicit acknowledgement and reason before authorization', async () => {
    const wrapper = mount(ShortBatchAuthorizationDialog, {
      props: {
        visible: true,
        preview: {
          productionBatchId: '1',
          batchStatus: 'material_pending',
          batchVersion: 3,
          materialPlanVersion: 2,
          authorizationStatus: 'none',
          canAuthorize: true,
          blockedReason: null,
          lines: [
            {
              demandId: '10',
              itemId: '20',
              itemCode: 'M-001',
              itemName: '物料 A',
              unit: 'kg',
              demandQuantity: '50.0000',
              confirmedOutboundQuantity: '0.0000',
              expectedOutboundQuantity: '30.0000',
              authorizedRemainingQuantity: '20.0000',
            },
          ],
        },
        loading: false,
        submitting: false,
      },
      global: {
        stubs: {
          'el-dialog': { template: '<div><slot/><slot name="footer"/></div>' },
          'el-alert': { template: '<div><slot/></div>' },
          'el-table': { template: '<div><slot/></div>' },
          'el-table-column': true,
          'el-form': { template: '<div><slot/></div>' },
          'el-form-item': { template: '<div><slot/></div>' },
          'el-input': true,
          'el-checkbox': { template: '<div><slot/></div>' },
          'el-button': true,
        },
        directives: { loading: () => undefined },
      },
    });
    const vm = wrapper.vm as unknown as {
      reason: string;
      acknowledged: boolean;
      canSubmit: boolean;
    };
    expect(vm.canSubmit).toBe(false);
    vm.reason = '当前按已到料先行生产';
    vm.acknowledged = true;
    await wrapper.vm.$nextTick();
    expect(vm.canSubmit).toBe(true);
    expect(wrapper.text()).toContain('需求新增或取消后');
  });
});
