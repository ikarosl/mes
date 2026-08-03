import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProcessRoutesList } from '../useProcessRoutesList';

const { routes, error } = vi.hoisted(() => ({ routes: vi.fn(), error: vi.fn() }));
vi.mock('../../../../api/product', () => ({
  productApi: { routes },
}));
vi.mock('../../../../utils/message', () => ({ EMessage: { error } }));

const pageResult = (items: unknown[], total: number, page: number) => ({
  items,
  total,
  page,
  pageSize: 10,
});

describe('useProcessRoutesList', () => {
  beforeEach(() => {
    routes.mockReset();
    error.mockReset();
    routes.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
  });

  it('loads the route list with the page query', async () => {
    const state = useProcessRoutesList();
    state.query.status = 'draft';
    state.query.keyword = ' 环形器 ';

    await state.loadRoutes();

    expect(routes).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
      keyword: '环形器',
      status: 'draft',
    });
  });

  it('maps route status labels and tag types', () => {
    const state = useProcessRoutesList();
    expect(state.routeStatusLabel('enabled')).toBe('启用');
    expect(state.routeStatusLabel('archived')).toBe('已归档');
    expect(state.routeStatusType('draft')).toBe('info');
    expect(state.routeStatusType('enabled')).toBe('success');
  });

  it('resets the query to first page and reloads', async () => {
    const state = useProcessRoutesList();
    state.query.status = 'enabled';
    await state.handlePageChange(2);

    await state.resetQuery();

    expect(state.currentPage.value).toBe(1);
    expect(state.query.status).toBe('');
    expect(routes).toHaveBeenCalledTimes(2);
  });

  it('discards a late response after the query changes', async () => {
    let resolvePage1!: (value: unknown) => void;
    routes.mockImplementation((params: { page: number }) =>
      params.page === 1
        ? new Promise((resolve) => {
            resolvePage1 = resolve;
          })
        : Promise.resolve(pageResult([{ id: '2' }], 1, 2)),
    );
    const state = useProcessRoutesList();

    const pendingPage1 = state.loadRoutes();
    const pendingPage2 = state.handlePageChange(2);
    await pendingPage2;
    resolvePage1(pageResult([{ id: '1' }], 5, 1));
    await pendingPage1;

    expect(state.routes.value).toEqual([{ id: '2' }]);
    expect(state.total.value).toBe(1);
    expect(state.loading.value).toBe(false);
  });

  it('keeps loading until the latest request settles', async () => {
    let resolvePage1!: (value: unknown) => void;
    let resolvePage2!: (value: unknown) => void;
    routes.mockImplementation((params: { page: number }) =>
      params.page === 1
        ? new Promise((resolve) => {
            resolvePage1 = resolve;
          })
        : new Promise((resolve) => {
            resolvePage2 = resolve;
          }),
    );
    const state = useProcessRoutesList();

    const pendingPage1 = state.loadRoutes();
    const pendingPage2 = state.handlePageChange(2);
    resolvePage1(pageResult([], 0, 1));
    await pendingPage1;
    expect(state.loading.value).toBe(true); // 旧请求不得提前结束 loading

    resolvePage2(pageResult([{ id: '2' }], 1, 2));
    await pendingPage2;
    expect(state.loading.value).toBe(false);
    expect(state.routes.value).toEqual([{ id: '2' }]);
  });

  it('does not surface a stale request failure', async () => {
    let rejectPage1!: (reason: unknown) => void;
    routes.mockImplementation((params: { page: number }) =>
      params.page === 1
        ? new Promise((_, reject) => {
            rejectPage1 = reject;
          })
        : Promise.resolve(pageResult([], 0, 2)),
    );
    const state = useProcessRoutesList();

    const pendingPage1 = state.loadRoutes();
    const pendingPage2 = state.handlePageChange(2);
    await pendingPage2;
    rejectPage1(new Error('500'));
    await pendingPage1;

    expect(error).not.toHaveBeenCalled();
    expect(state.loading.value).toBe(false);
  });
});
