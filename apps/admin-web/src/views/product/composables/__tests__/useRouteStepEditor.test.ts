import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRouteStepEditor } from '../useRouteStepEditor';

const { routeSteps, error } = vi.hoisted(() => ({
  routeSteps: vi.fn(),
  error: vi.fn(),
}));
vi.mock('../../../../api/product', () => ({ productApi: { routeSteps } }));
vi.mock('../../../../utils/message', () => ({ EMessage: { error } }));

const stepItem = {
  id: 'rs1',
  processStepId: 's1',
  stepOrder: 1,
  stepCode: 'CUT',
  stepName: '切割',
  description: null,
  defaultOwnerId: null,
  defaultOwnerName: null,
  sopFileId: null,
  sopFileName: null,
  needInspection: false,
  needRecord: true,
  status: 1,
  remark: null,
};

describe('useRouteStepEditor', () => {
  beforeEach(() => {
    routeSteps.mockReset();
    error.mockReset();
  });

  it('loads only route steps; BOM/material candidates are not part of route editing', async () => {
    routeSteps.mockResolvedValue([stepItem]);
    const state = useRouteStepEditor();

    const steps = await state.loadSteps('r1');

    expect(steps).toEqual([stepItem]);
    expect(routeSteps).toHaveBeenCalledWith('r1');
    expect(state.stepsStatus.value).toBe('success');
    expect(state.loadedRouteId.value).toBe('r1');
    expect(state).not.toHaveProperty('loadMaterialOptions');
    expect(state).not.toHaveProperty('routeMaterialOptions');
  });

  it('marks stepsStatus error and returns empty when route steps fail', async () => {
    routeSteps.mockRejectedValue(new Error('500'));
    const state = useRouteStepEditor();

    const steps = await state.loadSteps('r1');

    expect(steps).toEqual([]);
    expect(state.stepsStatus.value).toBe('error');
    expect(state.loadedRouteId.value).toBeNull();
    expect(error).toHaveBeenCalled();
  });

  it('exposes the stepsStatus lifecycle', async () => {
    let resolve!: (value: (typeof stepItem)[]) => void;
    routeSteps.mockImplementation(() => new Promise((done) => (resolve = done)));
    const state = useRouteStepEditor();

    expect(state.stepsStatus.value).toBe('idle');
    const pending = state.loadSteps('r1');
    expect(state.stepsStatus.value).toBe('loading');

    resolve([stepItem]);
    await pending;

    expect(state.stepsStatus.value).toBe('success');
    expect(state.loadedRouteId.value).toBe('r1');
  });

  it('discards a late steps response for a previous route (last-request-wins)', async () => {
    let resolveA!: (value: (typeof stepItem)[]) => void;
    routeSteps.mockImplementation((routeId: string) =>
      routeId === 'A'
        ? new Promise((resolve) => (resolveA = resolve))
        : Promise.resolve([stepItem]),
    );
    const state = useRouteStepEditor();

    const pendingA = state.loadSteps('A');
    const pendingB = state.loadSteps('B');
    await pendingB;
    resolveA([{ ...stepItem, processStepId: 'sA' }]);

    expect(await pendingA).toBeNull();
    expect(state.loadedRouteId.value).toBe('B');
    expect(state.stepsStatus.value).toBe('success');
  });

  it('returns null for a stale response after invalidateSteps', async () => {
    const resolvers: Array<(value: (typeof stepItem)[]) => void> = [];
    routeSteps.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
    const state = useRouteStepEditor();

    const pendingOld = state.loadSteps('R');
    state.invalidateSteps();
    const pendingNew = state.loadSteps('R');
    expect(resolvers).toHaveLength(2);

    resolvers[0]([{ ...stepItem, processStepId: 'sOld' }]);
    expect(await pendingOld).toBeNull();

    resolvers[1]([{ ...stepItem, processStepId: 'sNew' }]);
    expect(await pendingNew).toEqual([{ ...stepItem, processStepId: 'sNew' }]);
    expect(state.loadedRouteId.value).toBe('R');
    expect(state.stepsStatus.value).toBe('success');
  });

  it('discards a late steps failure for a previous route without polluting current state', async () => {
    let rejectA!: (reason: Error) => void;
    routeSteps.mockImplementation((routeId: string) =>
      routeId === 'A'
        ? new Promise((_resolve, reject) => (rejectA = reject))
        : Promise.resolve([stepItem]),
    );
    const state = useRouteStepEditor();

    const pendingA = state.loadSteps('A');
    const pendingB = state.loadSteps('B');
    await pendingB;
    rejectA(new Error('500'));
    await pendingA;

    expect(state.loadedRouteId.value).toBe('B');
    expect(state.stepsStatus.value).toBe('success');
    expect(error).not.toHaveBeenCalled();
  });
});
