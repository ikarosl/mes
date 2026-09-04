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
          authorizationAction: 'authorize',
          authorizationCoverage: 'none',
          blockedReason: null,
          lines: [
            {
              demandId: '10',
              itemId: '20',
              materialVariantId: 'mv-20',
              materialVariantCode: 'M-001-v1-A',
              itemCode: 'M-001',
              itemName: '物料 A',
              generationGroupKey: 'LOSSSUP:52',
              generationGroupType: 'material_loss_supplement',
              supplementNo: 'BL-20260902-570A4B60',
              unit: 'kg',
              demandQuantity: '50.0000',
              confirmedOutboundQuantity: '0.0000',
              expectedOutboundQuantity: '30.0000',
              authorizedRemainingQuantity: '20.0000',
              existingAuthorizedRemainingQuantity: null,
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
    expect(wrapper.html()).toContain('label="需求来源"');
  });

  it('renders a current authorization as read-only and does not offer duplicate submission', () => {
    const wrapper = mount(ShortBatchAuthorizationDialog, {
      props: {
        visible: true,
        preview: {
          productionBatchId: '1',
          batchStatus: 'material_pending',
          batchVersion: 4,
          materialPlanVersion: 2,
          authorizationStatus: 'valid',
          authorizationAction: 'view',
          authorizationCoverage: 'covered',
          blockedReason: '当前短批授权仍覆盖现有缺口，无需重复授权',
          lines: [],
        },
        loading: false,
        submitting: false,
      },
      global: {
        stubs: {
          'el-dialog': {
            props: ['title'],
            template: '<div><h2>{{ title }}</h2><slot/><slot name="footer"/></div>',
          },
          'el-alert': { props: ['title'], template: '<p>{{ title }}<slot/></p>' },
          'el-table': true,
          'el-table-column': true,
          'el-form': true,
          'el-form-item': true,
          'el-input': true,
          'el-checkbox': true,
          'el-button': { template: '<button><slot/></button>' },
        },
        directives: { loading: () => undefined },
      },
    });

    expect(wrapper.text()).toContain('查看短批授权');
    expect(wrapper.text()).toContain('无需重复授权');
    expect(wrapper.text()).not.toContain('确认承担风险并授权');
  });

  it('缺料但尚无可出库分配时显示待办授权类型且禁止提交', () => {
    const wrapper = mount(ShortBatchAuthorizationDialog, {
      props: {
        visible: true,
        preview: {
          productionBatchId: '1',
          batchStatus: 'material_pending',
          batchVersion: 1,
          materialPlanVersion: 1,
          authorizationStatus: 'none',
          authorizationAction: 'authorize',
          authorizationCoverage: 'none',
          blockedReason: '当前尚无可预计出库分配，且批次没有净确认领料',
          lines: [],
        },
        loading: false,
        submitting: false,
      },
      global: {
        stubs: {
          'el-dialog': {
            props: ['title'],
            template: '<div><h2>{{ title }}</h2><slot/><slot name="footer"/></div>',
          },
          'el-alert': { props: ['title'], template: '<p>{{ title }}<slot/></p>' },
          'el-table': true,
          'el-table-column': true,
          'el-form': true,
          'el-form-item': true,
          'el-input': true,
          'el-checkbox': true,
          'el-button': { template: '<button><slot/></button>' },
        },
        directives: { loading: () => undefined },
      },
    });

    expect(wrapper.text()).toContain('短批授权');
    expect(wrapper.text()).toContain('当前尚无可预计出库分配，且批次没有净确认领料');
    expect(wrapper.text()).not.toContain('物料已齐套');
    expect(wrapper.text()).not.toContain('确认承担风险并授权');
  });

  it('已有净确认领料时允许对无当前分配的活动需求重新授权', async () => {
    const wrapper = mount(ShortBatchAuthorizationDialog, {
      props: {
        visible: true,
        preview: {
          productionBatchId: '1',
          batchStatus: 'material_partially_outbound',
          batchVersion: 5,
          materialPlanVersion: 3,
          authorizationStatus: 'stale',
          authorizationAction: 'reauthorize',
          authorizationCoverage: 'stale',
          blockedReason: null,
          lines: [
            {
              demandId: '12',
              itemId: '20',
              materialVariantId: 'mv-20',
              materialVariantCode: 'M-001-v1-A',
              itemCode: 'M-001',
              itemName: '物料 A',
              generationGroupKey: 'LOSSSUP:52',
              generationGroupType: 'material_loss_supplement',
              supplementNo: 'BL-20260903-570A4B60',
              unit: 'kg',
              demandQuantity: '1.0000',
              confirmedOutboundQuantity: '0.0000',
              expectedOutboundQuantity: '0.0000',
              authorizedRemainingQuantity: '1.0000',
              existingAuthorizedRemainingQuantity: null,
            },
          ],
        },
        loading: false,
        submitting: false,
      },
      global: {
        stubs: {
          'el-dialog': {
            props: ['title'],
            template: '<div><h2>{{ title }}</h2><slot/><slot name="footer"/></div>',
          },
          'el-alert': true,
          'el-table': true,
          'el-table-column': true,
          'el-form': { template: '<div><slot/></div>' },
          'el-form-item': { template: '<div><slot/></div>' },
          'el-input': true,
          'el-checkbox': { template: '<div><slot/></div>' },
          'el-button': { template: '<button><slot/></button>' },
        },
        directives: { loading: () => undefined },
      },
    });
    const vm = wrapper.vm as unknown as {
      reason: string;
      acknowledged: boolean;
      canSubmit: boolean;
    };

    expect(wrapper.text()).toContain('重新短批授权');
    vm.reason = '接受当前全部活动需求缺口';
    vm.acknowledged = true;
    await wrapper.vm.$nextTick();
    expect(vm.canSubmit).toBe(true);
  });
});
