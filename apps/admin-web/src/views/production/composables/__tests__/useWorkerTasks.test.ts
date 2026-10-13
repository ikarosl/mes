import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductionWorkerTaskItem } from '@company/contracts';
import { useWorkerTasks } from '../useWorkerTasks';

const api = vi.hoisted(() => ({
  listWorkerTasks: vi.fn(),
}));
vi.mock('../../../../api/production', () => ({ productionApi: api }));

const task = {
  stepRecordId: '10',
  productionBatchId: '2',
  version: 3,
} as ProductionWorkerTaskItem;

describe('useWorkerTasks', () => {
  beforeEach(() => Object.values(api).forEach((mock) => mock.mockReset()));

  it('ignores a stale list response after a newer refresh', async () => {
    let resolveFirst!: (result: { items: ProductionWorkerTaskItem[]; total: number }) => void;
    api.listWorkerTasks
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce({ items: [], total: 0 });
    const state = useWorkerTasks();
    const first = state.load();
    await state.load();
    resolveFirst({ items: [task], total: 1 });
    await first;
    expect(state.tasks.value).toEqual([]);
  });
});
