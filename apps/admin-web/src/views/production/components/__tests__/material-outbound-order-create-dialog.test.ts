import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MaterialOutboundOrderCreateDialog from '../MaterialOutboundOrderCreateDialog.vue';

const { confirm } = vi.hoisted(() => ({ confirm: vi.fn() }));
vi.mock('../../../../utils/route-message-box', () => ({ RouteMessageBox: { confirm } }));

const candidate = {
  allocationId: 'allocation-1',
  demandId: 'demand-1',
  itemId: 'item-1',
  materialVariantId: 'variant-1',
  materialVariantCode: 'RM-001-V1',
  itemCode: 'RM-001',
  itemName: '物料 A',
  itemBatchId: 'batch-1',
  batchCode: 'IB-001',
  assignedQuantity: '3',
  confirmedOutboundQuantity: '0',
  pendingOutboundQuantity: '0',
  availableToOrderQuantity: '3',
  remainingActualOutboundQuantity: '3',
  unit: '件',
  generationGroupKey: 'NORMAL:b1',
  generationGroupType: 'normal' as const,
  supplementNo: null,
};

describe('MaterialOutboundOrderCreateDialog', () => {
  beforeEach(() => confirm.mockReset());

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

  it('keeps the selected exact-version candidate and draft when an unknown result is retained', async () => {
    const wrapper = mount(MaterialOutboundOrderCreateDialog, {
      props: {
        modelValue: true,
        batchOptions: [],
        candidates: [candidate],
        optionLoading: false,
        candidateLoading: false,
        submitting: false,
        intentStatus: 'pending',
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
    const vm = wrapper.vm as unknown as {
      batchId: string;
      remark: string;
      quantities: Record<string, number>;
      selectedCandidates: Array<{ materialVariantId: string }>;
      handleGroupSelection: (key: string, rows: (typeof candidate)[]) => void;
      requestClose: () => Promise<void>;
    };
    vm.batchId = 'b1';
    vm.remark = '纸质领料';
    vm.quantities[candidate.allocationId] = 2;
    vm.handleGroupSelection(candidate.generationGroupKey, [candidate]);
    await wrapper.vm.$nextTick();

    expect(vm.selectedCandidates).toEqual(
      expect.arrayContaining([expect.objectContaining({ materialVariantId: 'variant-1' })]),
    );
    confirm.mockRejectedValueOnce('cancel');
    await vm.requestClose();

    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining('结果尚未确认'),
      '放弃幂等意图确认',
      expect.objectContaining({ cancelButtonText: '继续保留' }),
    );
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(vm.batchId).toBe('b1');
    expect(vm.remark).toBe('纸质领料');
    expect(vm.quantities[candidate.allocationId]).toBe(2);
  });
});
