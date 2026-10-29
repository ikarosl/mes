import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestError } from '@company/request';
import type { ProductionReportContext } from '../production-report-selection';
import { useProductionReportCreate } from '../use-production-report-create';

const api = vi.hoisted(() => ({
  createStepReport: vi.fn(),
  createHistoricalStepReport: vi.fn(),
}));
vi.mock('../../../../../api/production/step-reports', () => ({
  productionStepReportsApi: {
    createStepReport: api.createStepReport,
    createHistoricalStepReport: api.createHistoricalStepReport,
  },
}));
vi.mock('../../../../../utils/message', () => ({
  EMessage: { success: vi.fn(), error: vi.fn() },
}));

const context = {
  productionBatchId: '2',
  stepRecordId: '10',
  batchNo: 'PB-2',
  stepOrder: 1,
  stepName: '切割',
  hasPreviousStep: false,
  status: 'doing',
  unit: '件',
  plannedQuantity: '10',
  activatedSupplementInputQuantity: '0',
  effectiveDirectNormalQuantity: '4',
  effectiveNormalQuantity: '4',
  upperLimitQuantity: '10',
  availableReportQuantity: '6',
  pendingSupplementInputQuantity: '0',
  quotaDistribution: {
    scrappedQuantity: '0',
    processingQuantity: '0',
    terminatedQuantity: '0',
    pendingReviewQuantity: '0',
    pendingReworkQuantity: '0',
    doingReworkQuantity: '0',
    isReliable: true,
    unavailableReason: null,
    pendingDispositions: [],
    pendingReworks: [],
    doingReworks: [],
    terminatedDispositions: [],
    cancelledReworks: [],
  },
  version: 3,
  canReport: true,
  reportBlockedReason: null,
} satisfies ProductionReportContext;

const createState = (refresh = vi.fn<() => Promise<void>>().mockResolvedValue()) =>
  useProductionReportCreate({
    getContext: () => context,
    isReady: () => true,
    refresh,
  });

describe('useProductionReportCreate', () => {
  beforeEach(() => Object.values(api).forEach((mock) => mock.mockReset()));

  it('sends a trimmed pure-normal report with its idempotency key and refreshes after success', async () => {
    api.createStepReport.mockResolvedValue({});
    const refresh = vi.fn<() => Promise<void>>().mockResolvedValue();
    const state = createState(refresh);
    const input = {
      normalQuantity: 2,
      abnormalQuantity: 0,
      abnormalOrigin: null,
      remark: '  本次正常  ',
    };

    state.open(context, 'normal');
    await state.submit(input);

    expect(api.createStepReport).toHaveBeenCalledOnce();
    expect(api.createStepReport).toHaveBeenCalledWith(
      '2',
      '10',
      {
        version: 3,
        normalQuantity: 2,
        abnormalQuantity: 0,
        abnormalOrigin: null,
        remark: '本次正常',
      },
      expect.any(String),
    );
    expect(refresh).toHaveBeenCalledOnce();
    expect(state.visible).toBe(false);
    expect(state.intentStatus).toBe('idle');
  });

  it('keeps an ambiguous report open with its original input, reuses the key, and resets only when explicitly discarded', async () => {
    const networkFailure = new RequestError('网络断开', 0);
    api.createStepReport
      .mockRejectedValueOnce(networkFailure)
      .mockRejectedValueOnce(networkFailure);
    const refresh = vi.fn<() => Promise<void>>().mockResolvedValue();
    const state = createState(refresh);
    const input = {
      normalQuantity: 2,
      abnormalQuantity: 0,
      abnormalOrigin: null,
      remark: '  本次正常  ',
    };

    state.open(context, 'normal');
    await state.submit(input);

    expect(state.intentStatus).toBe('pending');
    expect(state.visible).toBe(true);
    expect(state.task).toEqual(context);

    await state.submit(input);

    expect(api.createStepReport).toHaveBeenCalledTimes(2);
    expect(api.createStepReport.mock.calls[0]?.[2]).toEqual(
      api.createStepReport.mock.calls[1]?.[2],
    );
    expect(api.createStepReport.mock.calls[1]?.[3]).toBe(api.createStepReport.mock.calls[0]?.[3]);
    expect(state.intentStatus).toBe('pending');
    expect(state.visible).toBe(true);
    expect(refresh).not.toHaveBeenCalled();

    state.resetIntent();
    expect(state.intentStatus).toBe('idle');
    expect(refresh).not.toHaveBeenCalled();
  });
});
