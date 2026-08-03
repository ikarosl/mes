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

  it('invalidate causes the next ensure to refetch, and a fresh success clears the flag', async () => {
    productOptions.mockResolvedValue([]);
    const store = useReferenceOptionsStore();

    await store.ensureProducts();
    store.invalidateProducts();
    await store.ensureProducts();
    await store.ensureProducts(); // 第二次 ensure 拉取成功 → 失效标记已清除，不再请求

    expect(productOptions).toHaveBeenCalledTimes(2);
  });

  it('a late response after invalidate must not clear the invalidation flag', async () => {
    let resolveProducts!: (value: Array<{ id: string }>) => void;
    productOptions.mockReturnValue(
      new Promise((resolve) => {
        resolveProducts = resolve;
      }),
    );
    const store = useReferenceOptionsStore();

    // 请求在途时另一页面完成写操作并 invalidate
    const pending = store.refreshProducts();
    store.invalidateProducts();
    resolveProducts([{ id: '1' }]); // 写操作之前的旧快照
    await pending;

    expect(store.products.map((p) => p.id)).toEqual(['1']); // 旧快照被写入（允许）
    expect(store.productsStatus).toBe('ready');

    // 失效标记必须保留：下一次 ensure 重新请求，而不是直接返回旧缓存
    await store.ensureProducts();
    expect(productOptions).toHaveBeenCalledTimes(2);
  });

  it('a failed refresh marks the resource stale so the next ensure refetches', async () => {
    productOptions.mockResolvedValueOnce([{ id: '1' }]);
    productOptions.mockRejectedValueOnce(new Error('500'));
    productOptions.mockResolvedValue([{ id: '2' }]);
    const store = useReferenceOptionsStore();

    await store.ensureProducts();
    await store.refreshProducts();
    expect(store.productsStatus).toBe('error');
    expect(warning).toHaveBeenCalledOnce();

    // 刷新失败已确认数据陈旧：ensure 不再直接返回旧缓存，而是重新请求
    await store.ensureProducts();
    expect(productOptions).toHaveBeenCalledTimes(3);
    expect(store.products).toEqual([{ id: '2' }]);
    expect(store.productsStatus).toBe('ready');
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
