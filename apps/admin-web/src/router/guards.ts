import type { Router } from 'vue-router';
import { PERMISSIONS } from '@company/constants';
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
    // 旧入库链接仍按真实来源定位；分类各自保留查看权限。
    if (
      to.name === 'warehouse-inbound' &&
      typeof to.query.inboundId === 'string' &&
      to.query.inboundId &&
      to.query.sourceType !== 'purchased'
    )
      return { name: 'warehouse-inbound-finished', query: to.query, hash: to.hash, replace: true };

    // 通用菜单地址允许最小查看角色进入自己可见的分类，不扩大原分类准入。
    if (!auth.can(to.meta.permission)) {
      if (
        to.name === 'warehouse-inbound' &&
        !to.query.inboundId &&
        !to.query.receiptLineId &&
        auth.can(PERMISSIONS.warehouse.otherInbounds.view)
      )
        return { name: 'warehouse-other-inbounds', query: to.query, hash: to.hash, replace: true };
      if (
        to.name === 'warehouse-outbound' &&
        !to.query.outboundId &&
        auth.can(PERMISSIONS.warehouse.otherOutbounds.view)
      )
        return { name: 'warehouse-other-outbounds', query: to.query, hash: to.hash, replace: true };
      return { name: 'no-permission' };
    }
    return true;
  });

  router.afterEach((to, _from, failure) => {
    if (!failure) useTabsStore().visit(to, router);
  });
}
