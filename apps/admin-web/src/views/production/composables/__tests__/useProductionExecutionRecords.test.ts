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
  getScrapSupplementPlan: vi.fn(),
  saveScrapSupplementPlan: vi.fn(),
  confirmScrapSupplementPlan: vi.fn(),
}));
vi.mock('../../../../api/production', () => ({ productionApi: api }));

const batch = (id: string) => ({ id, batchNo: `PB-${id}` });
const group = (id: string) => ({ productionBatchId: id, batchNo: `PB-${id}`, steps: [] });
const disposition = { dispositionId: '8', productionBatchId: '1', version: 2 };

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
      null,
      '  录入更正  ',
    );
    expect(api.correctStepReport).toHaveBeenCalledWith(
      '1',
      '9',
      '12',
      {
        version: 3,
        normalQuantity: 2,
        abnormalQuantity: 0,
        abnormalOrigin: null,
        reason: '录入更正',
      },
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
        null,
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

  it('loads supplement candidates for the whole batch BOM without a process-step selector', async () => {
    api.listSupplementCandidates.mockResolvedValue([]);
    const state = useProductionExecutionRecords();
    await state.loadSupplementCandidates('8');
    expect(api.listSupplementCandidates).toHaveBeenCalledWith('8');
  });

  it('loads the persisted supplement draft for a disposition', async () => {
    api.getScrapSupplementPlan.mockResolvedValue(null);
    const state = useProductionExecutionRecords();
    await state.loadScrapSupplementPlan('8');
    expect(api.getScrapSupplementPlan).toHaveBeenCalledWith('8');
  });

  it('saves the staged supplement draft with plan and disposition versions', async () => {
    api.saveScrapSupplementPlan.mockResolvedValue({ status: 'draft' });
    const state = useProductionExecutionRecords();
    await state.saveScrapSupplementPlan(
      disposition as never,
      [
        {
          originalDemandId: '5',
          requirementBasisId: 'basis-5',
          materialVariantId: 'variant-5',
          supplementQuantity: 1.25,
        },
      ],
      '  补料备注  ',
      5,
    );
    expect(api.saveScrapSupplementPlan).toHaveBeenCalledWith('8', {
      planVersion: 5,
      dispositionVersion: 2,
      details: [
        {
          originalDemandId: '5',
          requirementBasisId: 'basis-5',
          materialVariantId: 'variant-5',
          supplementQuantity: 1.25,
        },
      ],
      remark: '补料备注',
    });
  });

  it('saves a first-time draft without a plan version and trims an empty remark to null', async () => {
    api.saveScrapSupplementPlan.mockResolvedValue({ status: 'draft' });
    const state = useProductionExecutionRecords();
    await state.saveScrapSupplementPlan(disposition as never, [], '   ', null);
    expect(api.saveScrapSupplementPlan).toHaveBeenCalledWith('8', {
      planVersion: null,
      dispositionVersion: 2,
      details: [],
      remark: null,
    });
  });

  it('confirms the scrap supplement with only the plan and disposition versions and an idempotent intent', async () => {
    api.confirmScrapSupplementPlan.mockResolvedValue({});
    api.getBatchExecutionRecords.mockResolvedValue(group('1'));
    const state = useProductionExecutionRecords();
    await state.approveScrapSupplement(disposition as never, 3);
    expect(api.confirmScrapSupplementPlan).toHaveBeenCalledWith(
      '8',
      { version: 3, dispositionVersion: 2 },
      expect.any(String),
    );
    // 确认请求不携带物料明细、备注或截止工序
    const body = api.confirmScrapSupplementPlan.mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('details');
    expect(body).not.toHaveProperty('remark');
    expect(body).not.toHaveProperty('materialEndStepRecordId');
    // 确认成功后刷新批次投影
    expect(api.getBatchExecutionRecords).toHaveBeenCalledWith('1');
    expect(state.getSupplementIntentStatus('8')).toBe('idle');
  });

  it('reconciles an ambiguous supplement confirmation that the server already completed', async () => {
    api.confirmScrapSupplementPlan.mockRejectedValue(new RequestError('响应中断', 500));
    api.getScrapSupplementPlan.mockResolvedValue({ status: 'confirmed' });
    api.getBatchExecutionRecords.mockResolvedValue(group('1'));
    const state = useProductionExecutionRecords();

    await state.approveScrapSupplement(disposition as never, 3);

    expect(api.getScrapSupplementPlan).toHaveBeenCalledWith('8');
    expect(api.getBatchExecutionRecords).toHaveBeenCalledWith('1');
    expect(state.getSupplementIntentStatus('8')).toBe('idle');
  });

  it('retains and explicitly discards an unresolved supplement confirmation', async () => {
    api.confirmScrapSupplementPlan.mockRejectedValue(new RequestError('响应中断', 500));
    api.getScrapSupplementPlan.mockResolvedValue({ status: 'draft' });
    const state = useProductionExecutionRecords();

    await expect(state.approveScrapSupplement(disposition as never, 3)).rejects.toBeInstanceOf(
      RequestError,
    );
    expect(state.getSupplementIntentStatus('8')).toBe('pending');

    state.resetSupplementIntent('8');
    expect(state.getSupplementIntentStatus('8')).toBe('idle');
  });

  it('prevents a second confirm while the first approval is still in flight', async () => {
    let resolveConfirm!: (value: unknown) => void;
    api.confirmScrapSupplementPlan.mockReturnValue(
      new Promise((resolve) => (resolveConfirm = resolve)),
    );
    api.getBatchExecutionRecords.mockResolvedValue(group('1'));
    const state = useProductionExecutionRecords();
    const first = state.approveScrapSupplement(disposition as never, 3);
    const second = state.approveScrapSupplement(disposition as never, 3);
    await second;
    expect(api.confirmScrapSupplementPlan).toHaveBeenCalledTimes(1);
    resolveConfirm({});
    await first;
    expect(state.pendingKeys.value.has('approve-scrap:8')).toBe(false);
  });
});
