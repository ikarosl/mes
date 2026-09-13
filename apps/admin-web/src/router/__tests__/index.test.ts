import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@company/constants';
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

  it('registers stable approval routes with their page-level permission alternatives', () => {
    const routes = router.getRoutes();
    const inbox = routes.find((route) => route.name === 'approval-inbox');
    const flows = routes.find((route) => route.name === 'approval-flows');

    expect(inbox?.path).toBe('/approval/inbox');
    expect(inbox?.meta.keepAliveName).toBe('ApprovalInboxPage');
    expect(inbox?.meta.permission).toEqual([
      PERMISSIONS.approval.view,
      PERMISSIONS.approval.decide,
      PERMISSIONS.product.products.manageBom,
    ]);
    expect(flows?.path).toBe('/approval/flows');
    expect(flows?.meta.keepAliveName).toBe('ApprovalFlowsPage');
    expect(flows?.meta.permission).toBe(PERMISSIONS.approval.configure);
  });
});
