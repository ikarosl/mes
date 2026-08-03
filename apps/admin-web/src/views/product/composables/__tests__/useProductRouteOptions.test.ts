import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useProductRouteOptions } from '../useProductRouteOptions';

const { routeOptions, warning } = vi.hoisted(() => ({
  routeOptions: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('../../../../api/product', () => ({
  productApi: { routeOptions },
}));
vi.mock('../../../../utils/message', () => ({ EMessage: { warning } }));

describe('useProductRouteOptions', () => {
  beforeEach(() => {
    routeOptions.mockReset();
    warning.mockReset();
    setActivePinia(createPinia());
  });

  it('loads route options from the shared store', async () => {
    routeOptions.mockResolvedValue([
      {
        id: 'r1',
        routeCode: 'R1',
        routeName: '路线1',
        productId: '1',
        versionNo: 'V1',
        status: 'enabled',
      },
    ]);
    const state = useProductRouteOptions();

    await state.loadRouteOptions();

    expect(state.routeOptions.value).toHaveLength(1);
  });

  it('keeps empty on first load failure without rejecting', async () => {
    routeOptions.mockRejectedValue(new Error('403'));
    const state = useProductRouteOptions();

    await expect(state.loadRouteOptions()).resolves.toBeUndefined();

    expect(state.routeOptions.value).toEqual([]);
    expect(warning).not.toHaveBeenCalled();
  });
});
