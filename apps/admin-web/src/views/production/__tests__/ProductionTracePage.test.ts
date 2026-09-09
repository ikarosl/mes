import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushPromises, mount } from '@vue/test-utils';
import { h, inject, provide, type VNode } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDateTimeForDisplay } from '../../../utils/date';
import ProductionTracePage from '../ProductionTracePage.vue';

const api = vi.hoisted(() => ({ searchProductionTrace: vi.fn(), getProductionTrace: vi.fn() }));
vi.mock('../../../api/production', () => ({ productionApi: api }));

const traceTableContext = Symbol('trace-table-context');
const traceTableStub = {
  props: ['data'],
  setup(props: { data?: unknown[] }, context: { slots: { default?: () => VNode[] } }) {
    provide(traceTableContext, props);
    return () => h('div', { class: 'trace-table-stub' }, context.slots.default?.());
  },
};
const traceTableColumnStub = {
  setup(_props: unknown, context: { slots: { default?: (scope: { row: unknown }) => unknown } }) {
    const table = inject<{ data?: unknown[] }>(traceTableContext, { data: [] });
    return () =>
      h(
        'div',
        { class: 'trace-column-stub' },
        (table.data ?? []).flatMap((row) =>
          context.slots.default ? [context.slots.default({ row })] : [],
        ) as unknown as VNode[],
      );
  },
};

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
    expect(tabs).toEqual(['物料需求与分配', '物料入库来源', '领料出库与库存流水', '工序与报工']);
    expect(tabs).not.toContain('质量/返工');
    expect(tabs).not.toContain('成品流转');
  });

  it('keeps the result sidebar within the allocated workspace height', () => {
    const pagePath = [
      resolve(process.cwd(), 'src/views/production/ProductionTracePage.vue'),
      resolve(process.cwd(), 'apps/admin-web/src/views/production/ProductionTracePage.vue'),
    ].find(existsSync);

    expect(pagePath).toBeDefined();
    const pageSource = readFileSync(pagePath!, 'utf8');

    expect(pageSource).toMatch(
      /\.trace-page\s*\{[^}]*grid-template-rows: auto minmax\(0, 1fr\);[^}]*height: 100%;[^}]*min-height: 0;/s,
    );
    expect(pageSource).toMatch(
      /\.trace-workspace\s*\{[^}]*flex: 1;[^}]*min-height: 0;[^}]*overflow: hidden;/s,
    );
    expect(pageSource).toMatch(/\.trace-results\s*\{[^}]*min-height: 0;[^}]*overflow-y: auto;/s);
  });

  it('renders return/source document identity, transaction labels, and confirmed time without initial-stock inference', async () => {
    api.searchProductionTrace.mockResolvedValue({
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
    api.getProductionTrace.mockResolvedValue({
      summary: {
        productionBatchId: '1',
        batchNo: 'PB-1',
        workOrderNo: 'WO-1',
        productCode: 'P-1',
        productName: 'Product',
        batchStatus: 'doing',
        plannedQuantity: '5',
        completedQuantity: '1',
        startedAt: null,
        completedAt: null,
      },
      materialDemands: [
        {
          demandId: 'd1',
          itemCode: 'M-1',
          itemName: '物料一',
          materialVariantCode: 'M-1-v1',
          demandQuantity: '5',
          allocatedQuantity: '5',
          outboundQuantity: '2',
          unit: 'pcs',
          allocations: [],
        },
      ],
      materialOutbounds: [],
      inventoryTransactions: [
        {
          transactionId: 'tx-out',
          outboundDetailId: 'od-1',
          itemId: 'm-1',
          materialVariantId: 'mv-1',
          materialVariantCode: 'M-1-v1',
          itemCode: 'M-1',
          itemName: '物料一',
          itemBatchId: 'ib-1',
          batchCode: 'IB-1',
          quantity: '-2',
          unit: 'pcs',
          transactionAt: '2026-09-01T10:00:00+08:00',
        },
      ],
      materialInboundSources: [
        {
          itemBatchId: 'ib-1',
          materialVariantId: 'mv-1',
          materialVariantCode: 'M-1-v1',
          batchCode: 'IB-1',
          itemCode: 'M-1',
          itemName: '物料一',
          sourceLabel: 'material_return_inbound',
          sourceDocumentNo: 'RT-001',
          provider: null,
          confirmedAt: '2026-09-01T10:00:00+08:00',
          inboundQuantity: '2',
          inventoryTransactionId: 'tx-return',
        },
        {
          itemBatchId: 'ib-2',
          materialVariantId: 'mv-1',
          materialVariantCode: 'M-1-v1',
          batchCode: 'IB-2',
          itemCode: 'M-1',
          itemName: '物料一',
          sourceLabel: 'stock_check_adjustment',
          sourceDocumentNo: null,
          provider: null,
          confirmedAt: '2026-09-02T11:00:00+08:00',
          inboundQuantity: '1',
          inventoryTransactionId: 'tx-check',
        },
      ],
      steps: [
        {
          stepRecordId: 'step-1',
          stepOrder: 1,
          stepName: '装配',
          status: 'pending',
          effectiveNormalQuantity: '0',
          requiredNormalQuantity: '5',
          effectiveAbnormalQuantity: '0',
          abnormalDispositions: [],
          reports: [],
        },
      ],
    });

    const wrapper = mount(ProductionTracePage, {
      global: {
        stubs: {
          TableToolbar: { template: '<div><slot name="actions"/><slot name="tools"/></div>' },
          'el-form': { template: '<form><slot/></form>' },
          'el-form-item': { template: '<div><slot/></div>' },
          'el-input': true,
          'el-button': { template: '<button><slot/></button>' },
          'el-tooltip': { template: '<div><slot/></div>' },
          'el-alert': { template: '<div><slot/></div>' },
          'el-tag': { template: '<span><slot/></span>' },
          'el-empty': true,
          'el-pagination': true,
          'el-tabs': { template: '<div><slot/></div>' },
          'el-tab-pane': {
            template: '<section class="trace-tab" :data-label="label"><slot/></section>',
            props: ['label', 'name'],
          },
          'el-table': traceTableStub,
          'el-table-column': traceTableColumnStub,
        },
        directives: { loading: () => undefined },
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('生产退料入库');
    expect(wrapper.text()).toContain('RT-001');
    expect(wrapper.text()).toContain('盘点差异调整');
    expect(wrapper.text()).toContain(formatDateTimeForDisplay('2026-09-01T10:00:00+08:00'));
    expect(wrapper.text()).not.toContain('期初库存');
    const vm = wrapper.vm as unknown as {
      sourceLabel: (value: string) => string;
      detail: { materialInboundSources: Array<{ sourceDocumentNo: string | null }> };
    };
    expect(vm.sourceLabel('material_return_inbound')).toBe('生产退料入库');
    expect(vm.sourceLabel('stock_check_adjustment')).toBe('盘点差异调整');
    expect(vm.detail.materialInboundSources[1]?.sourceDocumentNo).toBeNull();
  });
});
