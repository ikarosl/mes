import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductionExecutionRecordsPage from '../ProductionExecutionRecordsPage.vue';

const api = vi.hoisted(() => ({
  listExecutionBatchSummaries: vi.fn(),
  getBatchExecutionRecords: vi.fn(),
  getExecutionCompletionCheck: vi.fn(),
  listBatchReworks: vi.fn(),
  completeProductionExecution: vi.fn(),
}));
vi.mock('../../../api/production', () => ({ productionApi: api }));

describe('ProductionExecutionRecordsPage', () => {
  beforeEach(() => {
    api.listExecutionBatchSummaries.mockReset().mockResolvedValue({ items: [], total: 0 });
    api.getBatchExecutionRecords.mockReset();
    api.getExecutionCompletionCheck.mockReset();
    api.listBatchReworks.mockReset().mockResolvedValue([]);
    api.completeProductionExecution.mockReset();
  });

  it('keeps the batch sidebar within the allocated workspace height', () => {
    const pagePath = [
      resolve(process.cwd(), 'src/views/production/ProductionExecutionRecordsPage.vue'),
      resolve(
        process.cwd(),
        'apps/admin-web/src/views/production/ProductionExecutionRecordsPage.vue',
      ),
    ].find(existsSync);
    const batchListPath = [
      resolve(process.cwd(), 'src/views/production/components/ProductionExecutionBatchList.vue'),
      resolve(
        process.cwd(),
        'apps/admin-web/src/views/production/components/ProductionExecutionBatchList.vue',
      ),
    ].find(existsSync);

    expect(pagePath).toBeDefined();
    expect(batchListPath).toBeDefined();
    const pageSource = readFileSync(pagePath!, 'utf8');
    const batchListSource = readFileSync(batchListPath!, 'utf8');

    expect(pageSource).toMatch(
      /\.execution-page\s*\{[^}]*grid-template-rows: auto minmax\(0, 1fr\);[^}]*height: 100%;[^}]*min-height: 0;/s,
    );
    expect(pageSource).toMatch(
      /\.workspace\s*\{[^}]*flex: 1;[^}]*min-height: 0;[^}]*overflow: hidden;/s,
    );
    expect(pageSource).toMatch(
      /\.record-panel\s*\{[^}]*height: 100%;[^}]*max-height: 100%;[^}]*min-height: 0;[^}]*overflow-y: auto;/s,
    );
    expect(batchListSource).toMatch(
      /\.batch-list\s*\{[^}]*display: flex;[^}]*flex-direction: column;[^}]*min-height: 0;[^}]*overflow: hidden;/s,
    );
    expect(batchListSource).toMatch(
      /\.batch-items\s*\{[^}]*flex: 1;[^}]*min-height: 0;[^}]*overflow-y: auto;/s,
    );
  });

  it('uses the current project query-panel shell without duplicating the route title', () => {
    const wrapper = mount(ProductionExecutionRecordsPage, {
      global: {
        stubs: {
          TableToolbar: { template: '<div><slot name="actions"/><slot name="tools"/></div>' },
          'el-form': { template: '<form><slot/></form>' },
          'el-form-item': { template: '<div><slot/></div>' },
          'el-input': true,
          'el-button': true,
          'el-tooltip': { template: '<div><slot/></div>' },
          'el-empty': true,
          'el-dialog': true,
          'el-tag': true,
          'el-alert': true,
          'el-progress': true,
          'el-table': true,
          'el-table-column': true,
          'el-descriptions': true,
          'el-descriptions-item': true,
          'el-input-number': true,
          'el-checkbox': true,
          'el-pagination': true,
        },
        directives: { loading: () => undefined },
      },
    });
    expect(wrapper.find('.query-panel').exists()).toBe(true);
    expect(wrapper.find('.page-heading').exists()).toBe(false);
    expect(wrapper.find('.records-caption').text()).toContain('选择生产批次后查看');
    expect(wrapper.find('h1').exists()).toBe(false);
  });

  it('makes overdue and abnormal execution risks visible near batch identity and step facts', async () => {
    api.listExecutionBatchSummaries.mockResolvedValue({
      total: 1,
      items: [
        {
          id: '1',
          batchNo: 'PB-RISK',
          workOrderNo: 'WO-RISK',
          productCode: 'P-1',
          productName: '风险产品',
          planEndDate: '2000-01-01',
          status: 'doing',
          completedStepCount: 1,
          totalStepCount: 2,
          effectiveAbnormalQuantity: '1.0000',
          pendingAbnormalCount: 1,
        },
      ],
    });
    api.getBatchExecutionRecords.mockResolvedValue({
      productionBatchId: '1',
      batchNo: 'PB-RISK',
      workOrderNo: 'WO-RISK',
      productCode: 'P-1',
      productName: '风险产品',
      batchStatus: 'doing',
      plannedQuantity: '10.0000',
      steps: [
        {
          stepRecordId: '11',
          stepOrder: 1,
          stepCode: 'S1',
          stepName: '工序一',
          status: 'doing',
          responsibleUserName: '员工',
          requiredNormalQuantity: '10.0000',
          releasedNormalQuantity: '10.0000',
          availableNormalQuantity: '0.0000',
          effectiveNormalQuantity: '9.0000',
          effectiveAbnormalQuantity: '1.0000',
          remainingNormalQuantity: '1.0000',
          reports: [],
          abnormalDispositions: [{ dispositionId: '1', reviewStatus: 'pending_review' }],
        },
        {
          stepRecordId: '12',
          stepOrder: 2,
          stepCode: 'S2',
          stepName: '工序二',
          status: 'completed',
          responsibleUserName: '员工',
          requiredNormalQuantity: '10.0000',
          releasedNormalQuantity: '9.0000',
          availableNormalQuantity: '0.0000',
          effectiveNormalQuantity: '9.0000',
          effectiveAbnormalQuantity: '0.0000',
          remainingNormalQuantity: '1.0000',
          reports: [],
          abnormalDispositions: [],
        },
      ],
    });
    api.getExecutionCompletionCheck.mockResolvedValue({
      productionBatchId: '1',
      batchStatus: 'doing',
      canComplete: false,
      blockers: [],
      completedRequiredStepCount: 1,
      requiredStepCount: 2,
      finalRequiredStepName: '工序二',
      finalEffectiveNormalQuantity: '9.0000',
      plannedQuantity: '10.0000',
      version: 1,
    });
    const wrapper = mount(ProductionExecutionRecordsPage, {
      global: {
        stubs: {
          TableToolbar: { template: '<div><slot name="actions"/><slot name="tools"/></div>' },
          'el-form': { template: '<form><slot/></form>' },
          'el-form-item': { template: '<div><slot/></div>' },
          'el-input': true,
          'el-button': true,
          'el-tooltip': { template: '<div><slot/></div>' },
          'el-empty': true,
          'el-dialog': true,
          'el-tag': { template: '<span><slot/></span>' },
          'el-alert': true,
          'el-progress': true,
          'el-table': true,
          'el-table-column': true,
          'el-descriptions': true,
          'el-descriptions-item': true,
          'el-input-number': true,
          'el-checkbox': true,
          'el-pagination': true,
        },
        directives: { loading: () => undefined },
      },
    });
    await flushPromises();
    expect(wrapper.find('.batch-item.risk-error').exists()).toBe(true);
    expect(wrapper.find('.batch-health.risk-error').exists()).toBe(true);
    expect(wrapper.find('.step-card.has-abnormal').exists()).toBe(true);
    expect(wrapper.text()).toContain('已逾期');
    expect(wrapper.text()).toContain('待处置异常1');
  });
});
