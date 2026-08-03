import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskRouteSteps } from '../useTaskRouteSteps';

const { routeSteps, error } = vi.hoisted(() => ({
  routeSteps: vi.fn(),
  error: vi.fn(),
}));
vi.mock('../../../../api/product', () => ({
  productApi: { routeSteps },
}));
vi.mock('../../../../utils/message', () => ({ EMessage: { error } }));

const stepItem = {
  processStepId: 's1',
  stepOrder: 1,
  defaultOwnerId: null,
  sopFileId: null,
  needInspection: false,
  needRecord: true,
  status: 1,
  remark: null,
  productMaterialIds: [],
};

describe('useTaskRouteSteps', () => {
  beforeEach(() => {
    routeSteps.mockReset();
    error.mockReset();
  });

  it('loads step preview and resets it for editing mode', async () => {
    routeSteps.mockResolvedValue([stepItem]);
    const state = useTaskRouteSteps();

    await state.load('r1', false);
    expect(state.preview.value).toHaveLength(1);
    expect(state.preview.value[0]?.actualSopFileId).toBeNull();

    await state.load('r1', true); // 编辑模式不加载
    expect(state.preview.value).toEqual([]);
    expect(routeSteps).toHaveBeenCalledTimes(1);
  });

  it('discards a late response after the route changes', async () => {
    let resolveA!: (value: Array<typeof stepItem>) => void;
    routeSteps.mockImplementation((routeId: string) =>
      routeId === 'A'
        ? new Promise((resolve) => {
            resolveA = resolve;
          })
        : Promise.resolve([]),
    );
    const state = useTaskRouteSteps();

    const pendingA = state.load('A', false);
    const pendingB = state.load('B', false);
    await pendingB;
    resolveA([stepItem]);
    await pendingA;

    expect(state.preview.value).toEqual([]);
  });

  it('reports and clears the preview when the route steps request fails', async () => {
    routeSteps.mockRejectedValue(new Error('500'));
    const state = useTaskRouteSteps();

    await state.load('r1', false);

    expect(state.preview.value).toEqual([]);
    expect(error).toHaveBeenCalled();
  });
});
