import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductionWorkerTaskItem } from '@company/contracts';
import { RequestError } from '@company/request';
import { useWorkerTasks } from '../useWorkerTasks';

const api = vi.hoisted(() => ({
  listWorkerTasks: vi.fn(),
  startStep: vi.fn(),
  completeStep: vi.fn(),
  createStepReport: vi.fn(),
}));
vi.mock('../../../../api/production', () => ({ productionApi: api }));

const task = {
  stepRecordId: '10',
  productionBatchId: '2',
  version: 3,
} as ProductionWorkerTaskItem;

describe('useWorkerTasks', () => {
  beforeEach(() => Object.values(api).forEach((mock) => mock.mockReset()));

  it('starts with the server version and refreshes the employee projection', async () => {
    api.startStep.mockResolvedValue({});
    api.listWorkerTasks.mockResolvedValue([]);
    const state = useWorkerTasks();
    await state.start(task);
    expect(api.startStep).toHaveBeenCalledWith('2', '10', 3);
    expect(api.listWorkerTasks).toHaveBeenCalledOnce();
    expect(state.startPendingIds.value.size).toBe(0);
  });

  it('completes a non-reporting step with the server version and refreshes the projection', async () => {
    api.completeStep.mockResolvedValue({});
    api.listWorkerTasks.mockResolvedValue([]);
    const state = useWorkerTasks();
    await state.complete(task);
    expect(api.completeStep).toHaveBeenCalledWith('2', '10', 3);
    expect(api.listWorkerTasks).toHaveBeenCalledOnce();
    expect(state.completePendingIds.value.size).toBe(0);
  });

  it('ignores a stale list response after a newer refresh', async () => {
    let resolveFirst!: (rows: ProductionWorkerTaskItem[]) => void;
    api.listWorkerTasks
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce([]);
    const state = useWorkerTasks();
    const first = state.load();
    await state.load();
    resolveFirst([task]);
    await first;
    expect(state.tasks.value).toEqual([]);
  });

  it('sends the same normalized report object for intent signing and transport', async () => {
    api.createStepReport.mockResolvedValue({});
    api.listWorkerTasks.mockResolvedValue([]);
    const state = useWorkerTasks();
    await state.report(task, 2, 1, 'current_step', '  本次异常  ');
    expect(api.createStepReport).toHaveBeenCalledWith(
      '2',
      '10',
      {
        version: 3,
        normalQuantity: 2,
        abnormalQuantity: 1,
        abnormalOrigin: 'current_step',
        remark: '本次异常',
      },
      expect.any(String),
    );
    expect(state.reportPendingIds.value.size).toBe(0);
    expect(api.listWorkerTasks).toHaveBeenCalledOnce();
  });

  it('retains an ambiguous report intent until the caller explicitly discards it', async () => {
    api.createStepReport.mockRejectedValue(new RequestError('网络断开', 0));
    const state = useWorkerTasks();

    await expect(state.report(task, 1, 0, null, null)).rejects.toBeInstanceOf(RequestError);

    expect(state.getReportIntentStatus('10')).toBe('pending');
    state.resetReportIntent('10');
    expect(state.getReportIntentStatus('10')).toBe('idle');
  });
});
