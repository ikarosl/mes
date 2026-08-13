import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestError } from '@company/request';
import { useProductionMaterials } from '../useProductionMaterials';

const api = vi.hoisted(() => ({
  listMaterialDemands: vi.fn(),
  listAvailableItemBatches: vi.fn(),
  listMaterialOutbounds: vi.fn(),
  releaseMaterialAllocation: vi.fn(),
  createMaterialAllocations: vi.fn(),
  createMaterialOutbound: vi.fn(),
}));
vi.mock('../../../../api/production', () => ({ productionApi: api }));

describe('useProductionMaterials', () => {
  beforeEach(() => Object.values(api).forEach((mock) => mock.mockReset()));
  it('discards a late demand response after switching batches', async () => {
    let resolveA!: (value: unknown[]) => void;
    api.listMaterialDemands.mockImplementation((id: string) =>
      id === 'A'
        ? new Promise((resolve) => {
            resolveA = resolve;
          })
        : Promise.resolve([]),
    );
    const state = useProductionMaterials();
    state.setBatch('A');
    const a = state.loadDemands();
    state.setBatch('B');
    await state.loadDemands();
    resolveA([{ demandId: 'old' }]);
    await a;
    expect(state.demands.value).toEqual([]);
  });
  it('uses row-level release pending state and refreshes only material demands', async () => {
    api.releaseMaterialAllocation.mockResolvedValue({});
    api.listMaterialDemands.mockResolvedValue([]);
    const state = useProductionMaterials();
    state.setBatch('1');
    await state.release('9', 2);
    expect(api.releaseMaterialAllocation).toHaveBeenCalledWith('1', '9', 2);
    expect(state.releasePendingIds.value.size).toBe(0);
    expect(api.listMaterialOutbounds).not.toHaveBeenCalled();
  });
  it('retains an unknown allocation intent so dialog close and batch switch can be guarded', async () => {
    api.createMaterialAllocations.mockRejectedValue(new RequestError('网络断开', 0));
    const state = useProductionMaterials();
    state.setBatch('1');
    await expect(
      state.allocate({
        allocations: [{ demandId: '2', itemBatchId: '3', assignedQuantity: 1 }],
      }),
    ).rejects.toThrow('网络断开');
    expect(state.getAllocationIntentStatus()).toBe('pending');
  });
});
