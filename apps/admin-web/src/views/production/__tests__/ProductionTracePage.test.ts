import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductionTracePage from '../ProductionTracePage.vue';

const api = vi.hoisted(() => ({ searchProductionTrace: vi.fn(), getProductionTrace: vi.fn() }));
vi.mock('../../../api/production', () => ({ productionApi: api }));

describe('ProductionTracePage', () => {
  beforeEach(() => {
    api.searchProductionTrace.mockReset().mockResolvedValue({
      items: [
        {
          workOrderId: '2',
          workOrderNo: 'WO-1',
          productCode: 'P-1',
          productName: 'Product',
          batches: [
            {
              productionBatchId: '1',
              batchNo: 'PB-1',
              batchStatus: 'doing',
            },
          ],
        },
      ],
      total: 1,
    });
    api.getProductionTrace.mockReset().mockResolvedValue({
      summary: {
        productionBatchId: '1',
        batchNo: 'PB-1',
        workOrderNo: 'WO-1',
        productCode: 'P-1',
        productName: 'Product',
        batchStatus: 'doing',
        plannedQuantity: '1.0000',
        completedQuantity: '0.0000',
        startedAt: null,
        completedAt: null,
      },
      materialDemands: [],
      materialOutbounds: [],
      inventoryTransactions: [],
      steps: [],
    });
  });

  it('uses the current project shell and exposes only persisted Production fact tabs', async () => {
    const wrapper = mount(ProductionTracePage, {
      global: {
        stubs: {
          TableToolbar: { template: '<div><slot name="actions"/><slot name="tools"/></div>' },
          'el-form': { template: '<form><slot/></form>' },
          'el-form-item': { template: '<div><slot/></div>' },
          'el-input': true,
          'el-button': true,
          'el-tooltip': { template: '<div><slot/></div>' },
          'el-alert': true,
          'el-tag': true,
          'el-empty': true,
          'el-pagination': true,
          'el-tabs': { template: '<div><slot/></div>' },
          'el-tab-pane': {
            template: '<section class="trace-tab" :data-label="label"><slot/></section>',
            props: ['label', 'name'],
          },
          'el-table': true,
          'el-table-column': true,
        },
        directives: { loading: () => undefined },
      },
    });
    await flushPromises();
    expect(wrapper.find('.query-panel').exists()).toBe(true);
    expect(wrapper.find('h1').exists()).toBe(false);
    const tabs = wrapper.findAll('.trace-tab').map((tab) => tab.attributes('data-label'));
    expect(tabs).toEqual(['物料需求与分配', '领料出库与库存流水', '工序与报工']);
    expect(tabs).not.toContain('质量/返工');
    expect(tabs).not.toContain('成品流转');
  });
});
