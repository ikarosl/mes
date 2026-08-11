import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductionWorkerTaskItem } from '@company/contracts';
import { useWorkerTasks } from '../useWorkerTasks';

const api = vi.hoisted(() => ({ listWorkerTasks: vi.fn(), startStep: vi.fn() }));
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
});
