import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProcessRoutesList } from '../useProcessRoutesList';

const { routes } = vi.hoisted(() => ({ routes: vi.fn() }));
vi.mock('../../../../api/product', () => ({
  productApi: { routes },
}));
vi.mock('../../../../utils/message', () => ({ EMessage: { error: vi.fn() } }));

describe('useProcessRoutesList', () => {
  beforeEach(() => {
    routes.mockReset();
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
});
