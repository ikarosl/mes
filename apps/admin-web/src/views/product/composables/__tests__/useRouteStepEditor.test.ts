import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useRouteStepEditor } from '../useRouteStepEditor';

const { routeSteps, processStepOptions, userOptions, materials, error, warning } = vi.hoisted(
  () => ({
    routeSteps: vi.fn(),
    processStepOptions: vi.fn(),
    userOptions: vi.fn(),
    materials: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  }),
);
vi.mock('../../../../api/product', () => ({
  productApi: { routeSteps, processStepOptions, userOptions, materials },
}));
vi.mock('../../../../utils/message', () => ({ EMessage: { error, warning } }));

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

const materialItem = {
  id: 'm1',
  materialProductId: '2',
  itemCode: 'C2',
  productName: '物料2',
  itemKind: 'material',
  quantityPerUnit: '1',
  unit: 'kg',
  isKeyMaterial: true,
  needBatchRecord: true,
  status: 1,
  remark: null,
};

describe('useRouteStepEditor', () => {
  beforeEach(() => {
    routeSteps.mockReset();
    processStepOptions.mockReset();
    userOptions.mockReset();
    materials.mockReset();
    error.mockReset();
    warning.mockReset();
    setActivePinia(createPinia());
  });

  it('loads steps and all candidates on dialog open', async () => {
    routeSteps.mockResolvedValue([stepItem]);
    processStepOptions.mockResolvedValue([
      { id: 's1', stepCode: 'P1', stepName: '工序1', sopFileName: null },
    ]);
    userOptions.mockResolvedValue([{ id: 'u1', displayName: '张三' }]);
    materials.mockResolvedValue([materialItem]);
    const state = useRouteStepEditor();

    const [, steps] = await Promise.all([state.loadAllOptions('p1', false), state.loadSteps('r1')]);

    expect(steps).toHaveLength(1);
    expect(state.processOptions.value).toHaveLength(1);
    expect(state.userOptions.value).toHaveLength(1);
    expect(state.routeMaterialOptions.value).toHaveLength(1);
    expect(state.stepsStatus.value).toBe('success');
    expect(state.loadedRouteId.value).toBe('r1');
  });

  it('keeps steps when a candidate fails (first load keeps that candidate empty)', async () => {
    routeSteps.mockResolvedValue([stepItem]);
    processStepOptions.mockRejectedValue(new Error('403'));
    userOptions.mockResolvedValue([{ id: 'u1', displayName: '张三' }]);
    materials.mockResolvedValue([]);
    const state = useRouteStepEditor();

    const steps = await state.loadSteps('r1');
    await state.loadAllOptions(null, false);

    expect(steps).toHaveLength(1);
    expect(state.processOptions.value).toEqual([]);
    expect(state.userOptions.value).toHaveLength(1);
    expect(state.stepsStatus.value).toBe('success');
    expect(state.loadedRouteId.value).toBe('r1');
    expect(error).not.toHaveBeenCalled();
  });

  it('marks stepsStatus error and returns empty when route steps fail (no saveable empty detail)', async () => {
    routeSteps.mockRejectedValue(new Error('500'));
    const state = useRouteStepEditor();

    const steps = await state.loadSteps('r1');

    expect(steps).toEqual([]);
    expect(state.stepsStatus.value).toBe('error');
    expect(state.loadedRouteId.value).toBeNull();
    expect(error).toHaveBeenCalled();
  });

  it('refreshing candidates never reloads route steps', async () => {
    processStepOptions.mockResolvedValue([]);
    userOptions.mockResolvedValue([]);
    materials.mockResolvedValue([]);
    const state = useRouteStepEditor();

    await state.loadAllOptions('p1', true);

    expect(routeSteps).not.toHaveBeenCalled();
  });

  it('expanding the owner dropdown only refreshes users', async () => {
    userOptions.mockResolvedValue([{ id: 'u1', displayName: '张三' }]);
    const state = useRouteStepEditor();

    await state.loadUserOptions(true);

    expect(userOptions).toHaveBeenCalledTimes(1);
    expect(processStepOptions).not.toHaveBeenCalled();
    expect(materials).not.toHaveBeenCalled();
    expect(routeSteps).not.toHaveBeenCalled();
  });

  it('expanding the process dropdown only refreshes process', async () => {
    processStepOptions.mockResolvedValue([]);
    const state = useRouteStepEditor();

    await state.loadProcessOptions(true);

    expect(processStepOptions).toHaveBeenCalledTimes(1);
    expect(userOptions).not.toHaveBeenCalled();
    expect(materials).not.toHaveBeenCalled();
    expect(routeSteps).not.toHaveBeenCalled();
  });

  it('force refresh re-requests a resource even when already loaded', async () => {
    processStepOptions.mockResolvedValueOnce([
      { id: 's1', stepCode: 'P1', stepName: '工序1', sopFileName: null },
    ]);
    processStepOptions.mockResolvedValueOnce([]);
    const state = useRouteStepEditor();

    await state.loadProcessOptions(false);
    await state.loadProcessOptions(true);

    expect(processStepOptions).toHaveBeenCalledTimes(2);
  });

  it('discards a late materials response for a previous product', async () => {
    let resolveA!: (value: Array<typeof materialItem>) => void;
    materials.mockImplementation((productId: string) =>
      productId === 'A'
        ? new Promise((resolve) => {
            resolveA = resolve;
          })
        : Promise.resolve([materialItem]),
    );
    const state = useRouteStepEditor();

    const pendingA = state.loadMaterialOptions('A', false);
    const pendingB = state.loadMaterialOptions('B', false);
    await pendingB;
    resolveA([{ ...materialItem, id: 'mA' }]);
    await pendingA;

    // 产品 B 的结果保留，产品 A 的迟到响应被丢弃
    expect(state.routeMaterialOptions.value.map((i) => i.id)).toEqual(['m1']);
  });

  it('exposes stepsStatus lifecycle: idle -> loading -> success with loadedRouteId', async () => {
    let resolve!: (value: Array<typeof stepItem>) => void;
    routeSteps.mockImplementation(() => new Promise((resolveStep) => (resolve = resolveStep)));
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
    let resolveA!: (value: Array<typeof stepItem>) => void;
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
    await pendingA;

    // B 的结果保留，A 的迟到响应被丢弃且不改变状态
    expect(state.loadedRouteId.value).toBe('B');
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

    // A 的迟到失败被丢弃，不覆盖 B 的成功状态，也不触发错误提示
    expect(state.loadedRouteId.value).toBe('B');
    expect(state.stepsStatus.value).toBe('success');
    expect(error).not.toHaveBeenCalled();
  });
});
