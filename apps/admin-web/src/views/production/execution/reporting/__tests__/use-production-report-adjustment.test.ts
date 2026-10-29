import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestError } from '@company/request';
import type { BatchStepExecutionRecordItem, BatchStepReportView } from '@company/contracts';
import { useProductionReportAdjustment } from '../use-production-report-adjustment';

const api = vi.hoisted(() => ({
  correctStepReport: vi.fn(),
  correctHistoricalStepReport: vi.fn(),
  reverseStepReport: vi.fn(),
  reverseHistoricalStepReport: vi.fn(),
}));
const confirm = vi.hoisted(() => vi.fn());
vi.mock('../../../../../api/production/step-reports', () => ({
  productionStepReportsApi: {
    correctStepReport: api.correctStepReport,
    correctHistoricalStepReport: api.correctHistoricalStepReport,
    reverseStepReport: api.reverseStepReport,
    reverseHistoricalStepReport: api.reverseHistoricalStepReport,
  },
}));
vi.mock('../../../../../utils/message', () => ({
  EMessage: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../../../utils/route-message-box', () => ({
  RouteMessageBox: { confirm },
}));

const step = {
  productionBatchId: '2',
  stepRecordId: '10',
  version: 4,
  upperLimitQuantity: '10',
  availableReportQuantity: '6',
  effectiveDirectReportedQuantity: '4',
  effectiveNormalQuantity: '4',
  canCorrectReport: true,
} as unknown as BatchStepExecutionRecordItem;

const report = {
  reportId: '12',
  productionBatchId: '2',
  stepRecordId: '10',
  sourceKind: 'direct_normal',
  reportedQuantity: '2',
  normalQuantity: '2',
  abnormalQuantity: '0',
  canCorrect: true,
  canReverse: true,
} as BatchStepReportView;

const createEditor = (refresh = vi.fn<() => Promise<void>>().mockResolvedValue()) =>
  useProductionReportAdjustment({
    getStep: () => step,
    getBatchStatus: () => 'doing',
    isReady: () => true,
    refresh,
  });

const validCorrectionResult = {
  productionBatchId: '2',
  stepRecordId: '10',
  reversal: { reversalOfReportId: '12' },
  replacement: {
    correctionOfReportId: '12',
    normalQuantity: '3',
    abnormalQuantity: '0',
  },
};

describe('useProductionReportAdjustment', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    confirm.mockReset();
  });

  it('sends the complete normal replacement, reason, and version, then refreshes the matching result', async () => {
    api.correctStepReport.mockResolvedValue(validCorrectionResult);
    const refresh = vi.fn<() => Promise<void>>().mockResolvedValue();
    const editor = createEditor(refresh);

    editor.open('correct', step, report);
    editor.setNormalQuantity('3');
    editor.setReason('  录入更正  ');
    await editor.submit();

    expect(api.correctStepReport).toHaveBeenCalledWith(
      '2',
      '10',
      '12',
      { version: 4, normalQuantity: 3, reason: '录入更正' },
      expect.any(String),
    );
    expect(refresh).toHaveBeenCalledOnce();
    expect(editor.visible).toBe(false);
    expect(editor.intentStatus).toBe('idle');
  });

  it('locks an ambiguous correction to its original request until the user confirms discard', async () => {
    const networkFailure = new RequestError('网络断开', 0);
    api.correctStepReport
      .mockRejectedValueOnce(networkFailure)
      .mockRejectedValueOnce(networkFailure);
    const refresh = vi.fn<() => Promise<void>>().mockResolvedValue();
    const editor = createEditor(refresh);

    editor.open('correct', step, report);
    editor.setNormalQuantity('3');
    editor.setReason('  录入更正  ');
    await editor.submit();

    expect(editor.intentStatus).toBe('pending');
    expect(editor.visible).toBe(true);
    expect(editor.inputsLocked).toBe(true);
    expect(editor.form).toEqual({ normalQuantity: '3', reason: '  录入更正  ' });
    expect(refresh).not.toHaveBeenCalled();

    editor.setNormalQuantity('4');
    editor.setReason('改成其他内容');
    expect(editor.form).toEqual({ normalQuantity: '3', reason: '  录入更正  ' });

    confirm.mockRejectedValueOnce(new Error('用户取消放弃'));
    await editor.close();
    expect(editor.intentStatus).toBe('pending');
    expect(editor.visible).toBe(true);
    expect(editor.form).toEqual({ normalQuantity: '3', reason: '  录入更正  ' });

    await editor.submit();
    expect(api.correctStepReport).toHaveBeenCalledTimes(2);
    expect(api.correctStepReport.mock.calls[0]?.[3]).toEqual({
      version: 4,
      normalQuantity: 3,
      reason: '录入更正',
    });
    expect(api.correctStepReport.mock.calls[1]?.[3]).toEqual(
      api.correctStepReport.mock.calls[0]?.[3],
    );
    expect(api.correctStepReport.mock.calls[1]?.[4]).toBe(api.correctStepReport.mock.calls[0]?.[4]);
    expect(editor.intentStatus).toBe('pending');

    confirm.mockResolvedValueOnce('confirm');
    await editor.close();
    expect(editor.intentStatus).toBe('idle');
    expect(editor.visible).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });
});
