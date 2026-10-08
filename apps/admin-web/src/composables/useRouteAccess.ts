import { useRouter, type RouteLocationRaw } from 'vue-router';
import { useAuthStore } from '../stores/auth';

/** 快捷入口与路由守卫共用目标页面的权限声明，不判断业务记录访问资格。 */
export function useRouteAccess(): { canAccessRoute: (target: RouteLocationRaw) => boolean } {
  const router = useRouter();
  const auth = useAuthStore();
  const canAccessRoute = (target: RouteLocationRaw): boolean => {
    const resolved = router.resolve(target);
    return resolved.matched.length > 0 && auth.can(resolved.meta.permission);
  };
  return { canAccessRoute };
}
