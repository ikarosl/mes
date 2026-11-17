import type { Router } from 'vue-router';
import { STOCK_DOCUMENT_SOURCE_TYPES } from '@company/constants';
import type { StockDocumentSourceType } from '@company/contracts';
import {
  STOCK_DOCUMENT_ROUTES,
  stockDocumentViewPermission,
} from '../views/warehouse/stock-document-navigation';
import { useAuthStore } from '../stores/auth';
import { useTabsStore } from '../stores/tabs';

export function installRouterGuards(router: Router): void {
  router.beforeEach(async (to) => {
    const auth = useAuthStore();
    if (to.meta.public) {
      if (auth.authenticated) return { name: 'dashboard' };
      return true;
    }
    if (!auth.authenticated) {
      try {
        await auth.restore();
      } catch {
        return { name: 'login', query: { redirect: to.fullPath } };
      }
    }
    const scope = STOCK_DOCUMENT_ROUTES.find((record) => record.name === to.name);
    const source = to.query.sourceType;
    if (
      scope &&
      typeof source === 'string' &&
      STOCK_DOCUMENT_SOURCE_TYPES.includes(source as StockDocumentSourceType) &&
      !auth.can(stockDocumentViewPermission(scope.direction, source as StockDocumentSourceType))
    )
      return { name: 'no-permission' };

    if (!auth.can(to.meta.permission)) {
      if (scope && !Object.keys(to.query).length) {
        const target = STOCK_DOCUMENT_ROUTES.find(
          (record) => record.itemKind === scope.itemKind && auth.can(record.permission),
        );
        if (target) return { name: target.name, replace: true };
      }
      return { name: 'no-permission' };
    }
    return true;
  });

  router.afterEach((to, _from, failure) => {
    if (!failure) useTabsStore().visit(to, router);
  });
}
