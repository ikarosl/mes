import { describe, expect, it } from 'vitest';
import { router } from '../index';

describe('admin routes after product/production consolidation', () => {
  it('does not expose the removed standalone material-demand page', () => {
    const routes = router.getRoutes();

    expect(routes.some((route) => route.path === '/production/material-demands')).toBe(false);
    expect(routes.some((route) => route.name === 'production-material-demands')).toBe(false);
    expect(routes.find((route) => route.name === 'production-tasks')?.path).toBe(
      '/production/tasks',
    );
  });

  it('redirects the removed standalone material-variant route to the merged product page', () => {
    const route = router.getRoutes().find((item) => item.path === '/product/material-variants');

    expect(route?.redirect).toEqual({ name: 'product-products', query: { tab: 'materials' } });
  });
});
