import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestError } from '@company/request';
import { useProductionExecutionRecords } from '../useProductionExecutionRecords';

const api = vi.hoisted(() => ({
  listExecutionBatchSummaries: vi.fn(),
  getBatchExecutionRecords: vi.fn(),
  getExecutionCompletionCheck: vi.fn(),
  listBatchReworks: vi.fn(),
  completeProductionExecution: vi.fn(),
  correctStepReport: vi.fn(),
  reverseStepReport: vi.fn(),
  listSupplementCandidates: vi.fn(),
  approveScrapSupplement: vi.fn(),
}));
vi.mock('../../../../api/production', () => ({ productionApi: api }));

const batch = (id: string) => ({ id, batchNo: `PB-${id}` });
const group = (id: string) => ({ productionBatchId: id, batchNo: `PB-${id}`, steps: [] });

describe('useProductionExecutionRecords', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.getExecutionCompletionCheck.mockResolvedValue({
      productionBatchId: '1',
      batchStatus: 'doing',
      version: 4,
      canComplete: true,
      blockers: [],
    });
    api.listBatchReworks.mockResolvedValue([]);
  });

  it('keeps the selected detail within the current filtered page', async () => {
    api.listExecutionBatchSummaries.mockResolvedValueOnce({ items: [batch('1')], total: 1 });
    api.getBatchExecutionRecords.mockResolvedValueOnce(group('1'));
    const state = useProductionExecutionRecords();
    await state.loadBatches('PB-1');
    expect(state.selectedBatchId.value).toBe('1');

    api.listExecutionBatchSummaries.mockResolvedValueOnce({ items: [batch('2')], total: 1 });
    api.getBatchExecutionRecords.mockResolvedValueOnce(group('2'));
    await state.loadBatches('PB-2');
    expect(state.selectedBatchId.value).toBe('2');
    expect(state.record.value?.productionBatchId).toBe('2');
  });

  it('uses an idempotent intent for correction and refreshes the batch projection', async () => {
    api.correctStepReport.mockResolvedValue({});
    api.getBatchExecutionRecords.mockResolvedValue(group('1'));
    const state = useProductionExecutionRecords();
    await state.correct(
      { productionBatchId: '1', stepRecordId: '9', version: 3 } as never,
      { reportId: '12' } as never,
      2,
      0,
      '  录入更正  ',
    );
    expect(api.correctStepReport).toHaveBeenCalledWith(
      '1',
      '9',
      '12',
      { version: 3, normalQuantity: 2, abnormalQuantity: 0, reason: '录入更正' },
      expect.any(String),
    );
    expect(api.getBatchExecutionRecords).toHaveBeenCalledWith('1');
  });

  it('retains an ambiguous correction intent until the administrator explicitly discards it', async () => {
    api.correctStepReport.mockRejectedValue(new RequestError('网络断开', 0));
    const state = useProductionExecutionRecords();

    await expect(
      state.correct(
        { productionBatchId: '1', stepRecordId: '9', version: 3 } as never,
        { reportId: '12' } as never,
        2,
        0,
        '录入更正',
      ),
    ).rejects.toBeInstanceOf(RequestError);

    expect(state.getCorrectionIntentStatus('12')).toBe('pending');
    state.resetCorrectionIntent('12');
    expect(state.getCorrectionIntentStatus('12')).toBe('idle');
  });

  it('uses the server check version and refreshes the projection after completion', async () => {
    api.getBatchExecutionRecords.mockResolvedValue(group('1'));
    api.completeProductionExecution.mockResolvedValue({ batchStatus: 'completed' });
    const state = useProductionExecutionRecords();
    await state.selectBatch('1');
    await state.completeExecution();
    expect(api.completeProductionExecution).toHaveBeenCalledWith('1', 4);
    expect(api.getBatchExecutionRecords).toHaveBeenCalledTimes(2);
    expect(api.getExecutionCompletionCheck).toHaveBeenCalledTimes(2);
  });

  it('uses an idempotent intent when approving scrap supplement demand', async () => {
    api.approveScrapSupplement.mockResolvedValue({});
    api.getBatchExecutionRecords.mockResolvedValue(group('1'));
    const state = useProductionExecutionRecords();
    await state.approveScrapSupplement(
      { dispositionId: '8', productionBatchId: '1', version: 2 } as never,
      [{ originalDemandId: '5', supplementQuantity: 1.25 }],
      ' 补料 ',
    );
    expect(api.approveScrapSupplement).toHaveBeenCalledWith(
      '8',
      {
        version: 2,
        details: [{ originalDemandId: '5', supplementQuantity: 1.25 }],
        remark: '补料',
      },
      expect.any(String),
    );
  });
});
