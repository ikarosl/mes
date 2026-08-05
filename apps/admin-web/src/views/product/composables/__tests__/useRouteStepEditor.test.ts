import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRouteStepEditor } from '../useRouteStepEditor';

const { routeSteps, materials, error, warning } = vi.hoisted(() => ({
  routeSteps: vi.fn(),
  materials: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('../../../../api/product', () => ({
  productApi: { routeSteps, materials },
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
    materials.mockReset();
    error.mockReset();
    warning.mockReset();
  });

  it('loads steps and material candidates on dialog open', async () => {
    routeSteps.mockResolvedValue([stepItem]);
    materials.mockResolvedValue([materialItem]);
    const state = useRouteStepEditor();

    const steps = await state.loadSteps('r1');
    await state.loadMaterialOptions('p1', false);

    expect(steps).toHaveLength(1);
    expect(state.routeMaterialOptions.value).toHaveLength(1);
    expect(state.stepsStatus.value).toBe('success');
    expect(state.loadedRouteId.value).toBe('r1');
  });

  it('keeps steps when material candidates fail (first load stays empty)', async () => {
    routeSteps.mockResolvedValue([stepItem]);
    materials.mockRejectedValue(new Error('403'));
    const state = useRouteStepEditor();

    const steps = await state.loadSteps('r1');
    await state.loadMaterialOptions('p1', false);

    expect(steps).toHaveLength(1);
    expect(state.routeMaterialOptions.value).toEqual([]);
    expect(state.stepsStatus.value).toBe('success');
    expect(state.loadedRouteId.value).toBe('r1');
    expect(warning).toHaveBeenCalled();
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

  it('refreshMaterialOptions never reloads route steps', async () => {
    materials.mockResolvedValue([]);
    const state = useRouteStepEditor();

    await state.refreshMaterialOptions('p1');

    expect(routeSteps).not.toHaveBeenCalled();
  });

  it('refreshMaterialOptions force re-requests materials even when already loaded', async () => {
    materials.mockResolvedValueOnce([materialItem]);
    materials.mockResolvedValueOnce([]);
    const state = useRouteStepEditor();

    await state.loadMaterialOptions('p1', false);
    await state.refreshMaterialOptions('p1');

    expect(materials).toHaveBeenCalledTimes(2);
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

  it('returns null (stale marker) for a late steps response of a previous route, not an empty array', async () => {
    let resolveA!: (value: Array<typeof stepItem>) => void;
    routeSteps.mockImplementation((routeId: string) =>
      routeId === 'A'
        ? new Promise((resolve) => {
            resolveA = resolve;
          })
        : Promise.resolve([stepItem]),
    );
    const state = useRouteStepEditor();

    const pendingA = state.loadSteps('A');
    const pendingB = state.loadSteps('B');
    await pendingB;
    resolveA([{ ...stepItem, processStepId: 'sA' }]);

    // 过期响应返回 null（而非空数组），调用方才能与"该路线确实没有步骤"区分开
    expect(await pendingA).toBeNull();
    expect(state.loadedRouteId.value).toBe('B');
    expect(state.stepsStatus.value).toBe('success');
  });

  it('returns null for a stale response after invalidateSteps (same route closed and reopened)', async () => {
    const resolvers: Array<(value: Array<typeof stepItem>) => void> = [];
    routeSteps.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const state = useRouteStepEditor();

    const pendingOld = state.loadSteps('R');
    state.invalidateSteps(); // 弹窗关闭：推进请求代际
    const pendingNew = state.loadSteps('R'); // 重新打开同一路线：新请求
    expect(resolvers).toHaveLength(2);

    // 旧请求（代际已过期）先返回：过期标记，不得被当作"该路线没有步骤"
    resolvers[0]([{ ...stepItem, processStepId: 'sOld' }]);
    expect(await pendingOld).toBeNull();

    // 新请求正常返回，不受旧响应影响
    resolvers[1]([{ ...stepItem, processStepId: 'sNew' }]);
    const fresh = await pendingNew;
    expect(fresh?.map((s) => s.processStepId)).toEqual(['sNew']);
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

    // A 的迟到失败被丢弃，不覆盖 B 的成功状态，也不触发错误提示
    expect(state.loadedRouteId.value).toBe('B');
    expect(state.stepsStatus.value).toBe('success');
    expect(error).not.toHaveBeenCalled();
  });
});
