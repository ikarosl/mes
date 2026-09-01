import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { productionApi } from '../../../api/production';
import WarehouseInventoryPage from '../WarehouseInventoryPage.vue';

vi.mock('../../../api/production', () => ({
  productionApi: {
    listInventoryBatches: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    listInventoryMaterialSupplyDemand: vi
      .fn()
      .mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 }),
    listInventoryMaterialDemandTrace: vi
      .fn()
      .mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 }),
    getInventoryBatch: vi.fn().mockResolvedValue({
      itemBatchId: '101',
      itemId: '5',
      itemCode: 'MAT-1',
      itemName: '测试物料',
      unit: '件',
      batchCode: 'B001',
      sourceType: 'purchased',
      provider: '供应商 A',
      batchStatus: 'available',
      onHandAvailableQuantity: '6',
      reservedQuantity: '0',
      availableToAllocateQuantity: '6',
      inboundSources: [],
      inventoryTransactions: [
        {
          inventoryTransactionId: '12',
          transactionType: 'production_material_outbound',
          quantity: '-4',
          unit: '件',
          stockStatus: 'available',
          referenceType: 'outbound_detail',
          referenceDetailId: '31',
          transactionGroupKey: null,
          reversalOfInventoryTransactionId: null,
          remark: '领料',
          transactionAt: '2026-08-31T10:00:00+08:00',
        },
      ],
    }),
  },
}));

describe('WarehouseInventoryPage', () => {
  it('uses the current read-only inventory layout without stock mutation actions', () => {
    const wrapper = mount(WarehouseInventoryPage, {
      global: {
        stubs: {
          'el-form': { template: '<form><slot/></form>' },
          'el-tabs': { template: '<div><slot/></div>' },
          'el-tab-pane': { template: '<div><slot/></div>' },
          'el-form-item': { template: '<div><slot/></div>' },
          'el-input': true,
          'el-select': { template: '<div><slot/></div>' },
          'el-option': true,
          'el-button': { template: '<button><slot/></button>' },
          'el-table': { template: '<div><slot/></div>' },
          'el-table-column': true,
          'el-pagination': true,
          'el-dialog': true,
          'el-tag': true,
          'el-alert': true,
          'el-descriptions': { template: '<div><slot/></div>' },
          'el-descriptions-item': { template: '<div><slot/></div>' },
          TableToolbar: { template: '<div><slot name="actions"/><slot name="tools"/></div>' },
        },
        directives: { loading: () => undefined },
      },
    });
    expect(wrapper.find('.inventory-page').exists()).toBe(true);
    expect(wrapper.find('.query-panel').exists()).toBe(true);
    expect(wrapper.find('.table-panel').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('调整库存');
    expect(wrapper.text()).not.toContain('盘点');
  });

  it('loads the complete positive and negative inventory ledger in batch detail', async () => {
    const wrapper = mount(WarehouseInventoryPage, {
      global: {
        stubs: {
          'el-form': { template: '<form><slot/></form>' },
          'el-tabs': { template: '<div><slot/></div>' },
          'el-tab-pane': { template: '<div><slot/></div>' },
          'el-form-item': { template: '<div><slot/></div>' },
          'el-input': true,
          'el-select': { template: '<div><slot/></div>' },
          'el-option': true,
          'el-button': { template: '<button><slot/></button>' },
          'el-table': { template: '<div><slot/></div>' },
          'el-table-column': true,
          'el-pagination': true,
          'el-dialog': { template: '<div><slot/></div>' },
          'el-tag': true,
          'el-alert': true,
          'el-descriptions': { template: '<div><slot/></div>' },
          'el-descriptions-item': { template: '<div><slot/></div>' },
          TableToolbar: { template: '<div><slot name="actions"/><slot name="tools"/></div>' },
        },
        directives: { loading: () => undefined },
      },
    });

    await (wrapper.vm as unknown as { openDetail: (id: string) => Promise<void> }).openDetail(
      '101',
    );
    await wrapper.vm.$nextTick();

    expect(productionApi.getInventoryBatch).toHaveBeenCalledWith('101');
    expect(wrapper.text()).not.toContain('正库存流水');
    expect(wrapper.text()).toContain('库存流水（全部正负记录）');
    const detail = (wrapper.vm as unknown as { detail: { inventoryTransactions: unknown[] } })
      .detail;
    expect(detail.inventoryTransactions).toEqual([
      expect.objectContaining({ transactionType: 'production_material_outbound', quantity: '-4' }),
    ]);
  });
});
