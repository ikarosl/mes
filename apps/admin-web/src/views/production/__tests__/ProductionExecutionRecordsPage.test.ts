import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import ProductionExecutionRecordsPage from '../ProductionExecutionRecordsPage.vue';

const api = vi.hoisted(() => ({
  listExecutionBatchSummaries: vi.fn(),
  getBatchExecutionRecords: vi.fn(),
  getExecutionCompletionCheck: vi.fn(),
  listBatchReworks: vi.fn(),
  completeProductionExecution: vi.fn(),
}));
vi.mock('../../../api/production', () => ({ productionApi: api }));

const testPlugins = () => [
  createPinia(),
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'production-execution-records', component: { render: () => null } },
    ],
  }),
];

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
      /\.execution-page\s*\{[^}]*grid-template-rows: minmax\(0, 1fr\);[^}]*height: 100%;[^}]*min-height: 0;/s,
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

  it('uses the current execution workspace shell without duplicating the route title', () => {
    const wrapper = mount(ProductionExecutionRecordsPage, {
      global: {
        plugins: testPlugins(),
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
    expect(wrapper.find('.workspace').exists()).toBe(true);
    expect(wrapper.find('.page-heading').exists()).toBe(false);
    expect(wrapper.find('.records-caption').text()).toContain('选择任务查看状态');
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
          unit: 'pcs',
          responsibleUserName: '员工',
          upperLimitQuantity: '10.0000',
          availableReportQuantity: '0.0000',
          effectiveReportedQuantity: '10.0000',
          effectiveDirectReportedQuantity: '10.0000',
          effectiveDirectNormalQuantity: '9.0000',
          effectiveDirectAbnormalQuantity: '1.0000',
          effectiveNormalQuantity: '9.0000',
          effectiveAbnormalQuantity: '1.0000',
          previousStepNormalQuantity: null,
          directReportedVsPreviousNormalDifference: null,
          normalVsPreviousNormalDifference: null,
          normalVsTargetDifference: '-1.0000',
          baseNormalQuantity: '10.0000',
          activatedSupplementInputQuantity: '0.0000',
          activatedSupplementTargetQuantity: '0.0000',
          pendingSupplementInputQuantity: '0.0000',
          supplementSources: [],
          startedAt: '2026-10-13T09:00:00+08:00',
          completedAt: null,
          version: 3,
          reportCount: 2,
          hasReportHistory: true,
          firstReportedAt: '2026-10-13T09:01:00+08:00',
          lastReportedAt: '2026-10-13T09:02:00+08:00',
          canReport: true,
          reportBlockedReason: null,
          canCorrectReport: false,
          correctionBlockedReason: '存在异常处置',
          canCreateHistoricalReport: false,
          historicalCreateBlockedReason: null,
          historicalCorrectionBlockedReason: null,
          canAdminStart: false,
          startBlockedReason: null,
          canAdminComplete: false,
          completeBlockedReason: null,
          canAdminReopen: false,
          reopenBlockedReason: null,
          quotaDistribution: {
            scrappedQuantity: '0.0000',
            processingQuantity: '0.0000',
            terminatedQuantity: '0.0000',
            pendingReviewQuantity: '1.0000',
            pendingReworkQuantity: '0.0000',
            doingReworkQuantity: '0.0000',
            isReliable: true,
            unavailableReason: null,
            pendingDispositions: [
              {
                dispositionId: '1',
                dispositionNo: 'AD-1',
                quantity: '1.0000',
                sourceReport: {
                  reportId: '21',
                  reportNo: 'R-21',
                  productionBatchId: '1',
                  stepRecordId: '11',
                },
              },
            ],
            pendingReworks: [],
            doingReworks: [],
            terminatedDispositions: [],
            cancelledReworks: [],
          },
          abnormalDispositions: [
            {
              dispositionId: '1',
              dispositionNo: 'AD-1',
              productionBatchId: '1',
              stepRecordId: '11',
              sourceReportId: '21',
              sourceAbnormalQuantity: '1.0000',
              abnormalOrigin: 'current_step',
              reviewStatus: 'pending_review',
              dispositionType: null,
              remark: null,
              version: 0,
              createdAt: '2026-10-13T09:02:00+08:00',
              sourceReportNo: 'R-21',
              sourceReportSourceKind: 'direct_abnormal',
            },
          ],
        },
        {
          stepRecordId: '12',
          stepOrder: 2,
          stepCode: 'S2',
          stepName: '工序二',
          status: 'completed',
          unit: 'pcs',
          responsibleUserName: '员工',
          upperLimitQuantity: '10.0000',
          availableReportQuantity: '0.0000',
          effectiveReportedQuantity: '9.0000',
          effectiveDirectReportedQuantity: '9.0000',
          effectiveDirectNormalQuantity: '9.0000',
          effectiveDirectAbnormalQuantity: '0.0000',
          effectiveNormalQuantity: '9.0000',
          effectiveAbnormalQuantity: '0.0000',
          previousStepNormalQuantity: '9.0000',
          directReportedVsPreviousNormalDifference: '0.0000',
          normalVsPreviousNormalDifference: '0.0000',
          normalVsTargetDifference: '-1.0000',
          baseNormalQuantity: '10.0000',
          activatedSupplementInputQuantity: '0.0000',
          activatedSupplementTargetQuantity: '0.0000',
          pendingSupplementInputQuantity: '0.0000',
          supplementSources: [],
          startedAt: '2026-10-13T09:03:00+08:00',
          completedAt: '2026-10-13T09:04:00+08:00',
          version: 4,
          reportCount: 1,
          hasReportHistory: true,
          firstReportedAt: '2026-10-13T09:04:00+08:00',
          lastReportedAt: '2026-10-13T09:04:00+08:00',
          canReport: false,
          reportBlockedReason: '工序已明确完成',
          canCorrectReport: true,
          correctionBlockedReason: null,
          canCreateHistoricalReport: false,
          historicalCreateBlockedReason: null,
          historicalCorrectionBlockedReason: null,
          canAdminStart: false,
          startBlockedReason: null,
          canAdminComplete: false,
          completeBlockedReason: null,
          canAdminReopen: true,
          reopenBlockedReason: null,
          quotaDistribution: {
            scrappedQuantity: '0.0000',
            processingQuantity: '0.0000',
            terminatedQuantity: '0.0000',
            pendingReviewQuantity: '0.0000',
            pendingReworkQuantity: '0.0000',
            doingReworkQuantity: '0.0000',
            isReliable: true,
            unavailableReason: null,
            pendingDispositions: [],
            pendingReworks: [],
            doingReworks: [],
            terminatedDispositions: [],
            cancelledReworks: [],
          },
          abnormalDispositions: [],
        },
      ],
      workOrderId: '2',
      pendingApprovalId: null,
      canBatchReverse: false,
      batchReverseBlockedReason: null,
    });
    api.getExecutionCompletionCheck.mockResolvedValue({
      productionBatchId: '1',
      batchStatus: 'doing',
      version: 1,
      closeoutId: null,
      closeoutVersion: null,
      canComplete: false,
      blockers: [],
      completedRequiredStepCount: 1,
      requiredStepCount: 2,
      activeMaterialDemandCount: 0,
      plannedQuantity: '10.0000',
    });
    const wrapper = mount(ProductionExecutionRecordsPage, {
      global: {
        plugins: testPlugins(),
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
    expect(wrapper.find('.step-quota-distribution').exists()).toBe(true);
    expect(wrapper.find('.step-quota-distribution').text()).toContain('处理中');
    expect(wrapper.text()).toContain('已逾期');
    expect(wrapper.text()).toContain('待处置 1 项');
  });
});
