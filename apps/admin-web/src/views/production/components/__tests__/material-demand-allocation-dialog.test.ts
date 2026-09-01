import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import MaterialDemandAllocationDialog from '../MaterialDemandAllocationDialog.vue';

describe('MaterialDemandAllocationDialog', () => {
  it('selects the first demand when demands finish loading after the dialog opens', async () => {
    const wrapper = mount(MaterialDemandAllocationDialog, {
      props: {
        visible: true,
        demands: [],
        availableItemBatches: [],
        loadingDemands: true,
        loadingAvailable: false,
        submitting: false,
        releasePendingIds: new Set<string>(),
      },
      global: {
        stubs: {
          'el-dialog': { template: '<div><slot/><slot name="footer"/></div>' },
          'el-empty': true,
          'el-table': { template: '<div><slot/></div>' },
          'el-table-column': true,
          'el-form': { template: '<div><slot/></div>' },
          'el-form-item': { template: '<div><slot/></div>' },
          'el-select': true,
          'el-radio': true,
          'el-option': true,
          'el-input-number': true,
          'el-button': true,
          'el-tag': true,
          'el-alert': true,
        },
        directives: { loading: () => undefined },
      },
    });

    await wrapper.setProps({
      loadingDemands: false,
      demands: [
        {
          demandId: 'd-async',
          itemName: '物料 A',
          businessStatus: 'active',
          generationGroupKey: 'NORMAL:b1',
          generationGroupType: 'normal',
          supplementNo: null,
          createdAt: '2026-09-01T09:00:00+08:00',
          remainingQuantity: '2.0000',
          allocations: [],
        },
      ] as never,
    });
    await nextTick();

    expect(wrapper.emitted('load-available')).toEqual([['d-async']]);
    expect((wrapper.vm as unknown as { selectedDemandId: string | null }).selectedDemandId).toBe(
      'd-async',
    );
  });

  it('loads inventory by demand and emits only a quantity within demand and stock limits', async () => {
    const wrapper = mount(MaterialDemandAllocationDialog, {
      props: {
        visible: false,
        demands: [
          {
            demandId: 'd1',
            itemName: '物料 A',
            businessStatus: 'active',
            generationGroupKey: 'NORMAL:b1',
            generationGroupType: 'normal',
            supplementNo: null,
            createdAt: '2026-09-01T09:00:00+08:00',
            remainingQuantity: '5.0000',
            allocations: [],
          },
        ] as never,
        availableItemBatches: [
          { itemBatchId: 'ib1', availableToAllocateQuantity: '3.0000' },
        ] as never,
        loadingDemands: false,
        loadingAvailable: false,
        submitting: false,
        releasePendingIds: new Set<string>(),
      },
      global: {
        stubs: {
          'el-dialog': { template: '<div><slot/><slot name="footer"/></div>' },
          'el-empty': true,
          'el-table': { template: '<div><slot/></div>' },
          'el-table-column': true,
          'el-form': { template: '<div><slot/></div>' },
          'el-form-item': { template: '<div><slot/></div>' },
          'el-select': true,
          'el-radio': true,
          'el-option': true,
          'el-input-number': true,
          'el-button': true,
          'el-tag': true,
          'el-alert': true,
        },
        directives: { loading: () => undefined },
      },
    });

    await wrapper.setProps({ visible: true });
    await nextTick();
    expect(wrapper.emitted('load-available')).toEqual([['d1']]);

    const vm = wrapper.vm as unknown as {
      form: { itemBatchId: string; assignedQuantity: number };
      canAllocate: boolean;
      submitAllocation: () => void;
    };
    vm.form.itemBatchId = 'ib1';
    vm.form.assignedQuantity = 4;
    await nextTick();
    expect(vm.canAllocate).toBe(false);

    vm.form.assignedQuantity = 3;
    await nextTick();
    expect(vm.canAllocate).toBe(true);
    vm.submitAllocation();
    expect(wrapper.emitted('allocate')).toEqual([
      [{ allocations: [{ demandId: 'd1', itemBatchId: 'ib1', assignedQuantity: 3 }] }],
    ]);
  });

  it('defaults to the oldest active demand with an allocation gap while keeping all rows selectable', async () => {
    const wrapper = mount(MaterialDemandAllocationDialog, {
      props: {
        visible: true,
        demands: [],
        availableItemBatches: [],
        loadingDemands: true,
        loadingAvailable: false,
        submitting: false,
        releasePendingIds: new Set<string>(),
      },
      global: {
        stubs: {
          'el-dialog': { template: '<div><slot/><slot name="footer"/></div>' },
          'el-empty': true,
          'el-table': { template: '<div><slot/></div>' },
          'el-table-column': true,
          'el-form': { template: '<div><slot/></div>' },
          'el-form-item': { template: '<div><slot/></div>' },
          'el-select': true,
          'el-radio': true,
          'el-option': true,
          'el-input-number': true,
          'el-button': true,
          'el-tag': true,
          'el-alert': true,
        },
        directives: { loading: () => undefined },
      },
    });

    await wrapper.setProps({
      loadingDemands: false,
      demands: [
        {
          demandId: 'd-oldest-fulfilled',
          itemName: '已完成物料',
          businessStatus: 'fulfilled',
          generationGroupKey: 'NORMAL:b1',
          generationGroupType: 'normal',
          supplementNo: null,
          createdAt: '2026-09-01T09:00:00+08:00',
          remainingQuantity: '0',
          allocations: [],
        },
        {
          demandId: 'd-oldest-actionable',
          itemName: '待分配物料',
          businessStatus: 'active',
          generationGroupKey: 'NORMAL:b1',
          generationGroupType: 'normal',
          supplementNo: null,
          createdAt: '2026-09-01T09:00:00+08:00',
          remainingQuantity: '2',
          allocations: [],
        },
        {
          demandId: 'd-newer-actionable',
          itemName: '后续补料',
          businessStatus: 'active',
          generationGroupKey: 'SCRAPSUP:s1',
          generationGroupType: 'scrap_supplement',
          supplementNo: 'SUP-0001',
          createdAt: '2026-09-01T10:00:00+08:00',
          remainingQuantity: '1',
          allocations: [],
        },
      ] as never,
    });
    await nextTick();

    const vm = wrapper.vm as unknown as {
      selectedDemandId: string | null;
      canAllocate: boolean;
      demandGroups: Array<{ generationGroupKey: string; demands: unknown[] }>;
      selectDemand: (row: {
        demandId: string;
        businessStatus: string;
        remainingQuantity: string;
      }) => void;
    };
    expect(vm.selectedDemandId).toBe('d-oldest-actionable');
    expect(vm.demandGroups.map((group) => group.generationGroupKey)).toEqual([
      'NORMAL:b1',
      'SCRAPSUP:s1',
    ]);
    expect(wrapper.emitted('load-available')).toEqual([['d-oldest-actionable']]);

    vm.selectDemand({
      demandId: 'd-oldest-fulfilled',
      businessStatus: 'fulfilled',
      remainingQuantity: '0',
    });
    await nextTick();
    expect(vm.selectedDemandId).toBe('d-oldest-fulfilled');
    expect(vm.canAllocate).toBe(false);
    expect(wrapper.emitted('load-available')).toEqual([['d-oldest-actionable']]);
  });
});
