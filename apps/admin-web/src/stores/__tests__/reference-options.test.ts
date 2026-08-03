import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useReferenceOptionsStore } from '../reference-options';

const { productOptions, routeOptions, userOptions, warning } = vi.hoisted(() => ({
  productOptions: vi.fn(),
  routeOptions: vi.fn(),
  userOptions: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('../../api/product', () => ({
  productApi: { productOptions, routeOptions, userOptions },
}));
vi.mock('../../utils/message', () => ({ EMessage: { warning } }));

describe('reference-options store', () => {
  beforeEach(() => {
    productOptions.mockReset();
    routeOptions.mockReset();
    userOptions.mockReset();
    warning.mockReset();
    setActivePinia(createPinia());
  });

  it('merges concurrent calls of the same resource into a single request', async () => {
    productOptions.mockResolvedValue([]);
    const store = useReferenceOptionsStore();

    await Promise.all([store.ensureProducts(), store.refreshProducts()]);

    expect(productOptions).toHaveBeenCalledTimes(1);
  });

  it('ensure returns cached data without refetching after a successful load', async () => {
    productOptions.mockResolvedValue([]);
    const store = useReferenceOptionsStore();

    await store.ensureProducts();
    await store.ensureProducts();

    expect(productOptions).toHaveBeenCalledTimes(1);
    expect(store.productsStatus).toBe('ready');
  });

  it('refresh forces a new request even when data is cached', async () => {
    productOptions.mockResolvedValue([]);
    const store = useReferenceOptionsStore();

    await store.ensureProducts();
    await store.refreshProducts();

    expect(productOptions).toHaveBeenCalledTimes(2);
  });

  it('keeps last-known-good data when a refresh fails', async () => {
    productOptions.mockResolvedValueOnce([{ id: '1' }]);
    productOptions.mockRejectedValueOnce(new Error('500'));
    const store = useReferenceOptionsStore();

    await store.ensureProducts();
    await store.refreshProducts();

    expect(store.products).toHaveLength(1);
    expect(store.productsStatus).toBe('error');
    expect(warning).toHaveBeenCalledOnce();
  });

  it('keeps empty on first load failure without prompting', async () => {
    productOptions.mockRejectedValue(new Error('500'));
    const store = useReferenceOptionsStore();

    await store.ensureProducts();

    expect(store.products).toEqual([]);
    expect(store.productsStatus).toBe('error');
    expect(warning).not.toHaveBeenCalled();
  });

  it('invalidate causes the next ensure to refetch', async () => {
    productOptions.mockResolvedValue([]);
    const store = useReferenceOptionsStore();

    await store.ensureProducts();
    store.invalidateProducts();
    await store.ensureProducts();

    expect(productOptions).toHaveBeenCalledTimes(2);
  });

  it('$reset clears all cached options', async () => {
    userOptions.mockResolvedValue([{ id: 'u1', displayName: '张三' }]);
    const store = useReferenceOptionsStore();

    await store.ensureUsers();
    store.$reset();

    expect(store.users).toEqual([]);
    expect(store.usersStatus).toBe('idle');
  });

  it('$reset drops in-flight results from the previous generation', async () => {
    let resolveUsers!: (value: Array<{ id: string; displayName: string }>) => void;
    userOptions.mockReturnValue(
      new Promise((resolve) => {
        resolveUsers = resolve;
      }),
    );
    const store = useReferenceOptionsStore();

    const pending = store.ensureUsers();
    store.$reset();
    resolveUsers([{ id: 'u1', displayName: '旧用户' }]);
    await pending;

    expect(store.users).toEqual([]);
    expect(productOptions).not.toHaveBeenCalled();
    expect(routeOptions).not.toHaveBeenCalled();
  });

  it('each resource keeps an independent request slot', async () => {
    productOptions.mockResolvedValue([]);
    userOptions.mockResolvedValue([]);
    const store = useReferenceOptionsStore();

    await Promise.all([store.ensureProducts(), store.ensureUsers()]);

    expect(productOptions).toHaveBeenCalledTimes(1);
    expect(userOptions).toHaveBeenCalledTimes(1);
  });
});
