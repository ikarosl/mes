import type { RouteLocationRaw, RouteMeta, Router } from 'vue-router';

interface NavigationItem {
  routeNames: readonly string[];
}

interface NavigationGroup {
  key: string;
  title: string;
  items: readonly NavigationItem[];
}

interface VisibleNavigationItem {
  path: string;
  title: string;
  route: RouteLocationRaw;
}

interface VisibleNavigationGroup {
  key: string;
  title: string;
  items: VisibleNavigationItem[];
}

interface VisibleNavigation {
  home: VisibleNavigationItem | null;
  groups: VisibleNavigationGroup[];
}

const homeNavigation: NavigationItem = { routeNames: ['dashboard'] };

const navigationGroups: readonly NavigationGroup[] = [
  {
    key: 'system',
    title: '系统管理',
    items: [
      { routeNames: ['system-users'] },
      { routeNames: ['system-roles'] },
      { routeNames: ['system-user-candidates'] },
      { routeNames: ['system-permissions'] },
      { routeNames: ['system-logs'] },
      { routeNames: ['system-templates'] },
    ],
  },
  {
    key: 'approval',
    title: '审批中心',
    items: [{ routeNames: ['approval-inbox'] }, { routeNames: ['approval-flows'] }],
  },
  {
    key: 'product',
    title: '产品资料',
    items: [
      { routeNames: ['product-products'] },
      { routeNames: ['product-categories'] },
      { routeNames: ['product-processes'] },
      { routeNames: ['product-process-routes'] },
    ],
  },
  {
    key: 'procurement',
    title: '采购管理',
    items: [{ routeNames: ['procurement-orders'] }, { routeNames: ['procurement-suppliers'] }],
  },
  {
    key: 'production',
    title: '生产管理',
    items: [
      { routeNames: ['production-orders'] },
      { routeNames: ['production-tasks'] },
      { routeNames: ['production-worker-tasks'] },
      { routeNames: ['production-execution-records'] },
      { routeNames: ['production-trace'] },
    ],
  },
  {
    key: 'quality',
    title: '质量管理',
    items: [
      { routeNames: ['quality-process-inspections'] },
      { routeNames: ['quality-finished-inspections'] },
      { routeNames: ['quality-inbound-inspections'] },
    ],
  },
  {
    key: 'warehouse',
    title: '仓储管理',
    items: [
      { routeNames: ['procurement-receipts'] },
      { routeNames: ['warehouse-inventory'] },
      {
        routeNames: ['warehouse-inbound', 'warehouse-inbound-finished', 'warehouse-other-inbounds'],
      },
      { routeNames: ['warehouse-outbound', 'warehouse-other-outbounds'] },
      { routeNames: ['warehouse-returns'] },
      { routeNames: ['warehouse-scraps'] },
      { routeNames: ['warehouse-stock-checks'] },
    ],
  },
];

/** 菜单只维护导航结构；标题、地址与准入读取目标路由的声明。 */
export function getVisibleNavigation(
  router: Router,
  canAccess: (permission: RouteMeta['permission']) => boolean,
): VisibleNavigation {
  const resolveItem = (item: NavigationItem): VisibleNavigationItem | null => {
    for (const name of item.routeNames) {
      const target = router.resolve({ name });
      if (!target.matched.length || !canAccess(target.meta.permission)) continue;
      return {
        path: target.meta.menuPath ?? target.path,
        title: target.meta.title ?? name,
        route: { name },
      };
    }
    return null;
  };

  return {
    home: resolveItem(homeNavigation),
    groups: navigationGroups.flatMap((group) => {
      const items = group.items.flatMap((item) => {
        const resolved = resolveItem(item);
        return resolved ? [resolved] : [];
      });
      return items.length ? [{ key: group.key, title: group.title, items }] : [];
    }),
  };
}
