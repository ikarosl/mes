import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router';
export interface ViewTab {
  path: string;
  name: string;
  title: string;
  keepAliveName?: string;
  closable: boolean;
}
const KEY = 'easy-mes-view-tabs';
const read = (): ViewTab[] => {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as ViewTab[];
  } catch {
    return [];
  }
};
export const useTabsStore = defineStore('tabs', () => {
  const tabs = ref<ViewTab[]>(read());
  const closeGuards = new Map<string, Set<() => Promise<boolean>>>();
  const closing = new Set<string>();
  const registerCloseGuard = (name: string, guard: () => Promise<boolean>) => {
    const guards = closeGuards.get(name) ?? new Set<() => Promise<boolean>>();
    guards.add(guard);
    closeGuards.set(name, guards);
    return () => {
      guards.delete(guard);
      if (!guards.size) closeGuards.delete(name);
    };
  };
  const persist = () => sessionStorage.setItem(KEY, JSON.stringify(tabs.value));
  const fromRoute = (
    route: Pick<RouteLocationNormalizedLoaded, 'fullPath' | 'meta'> & {
      name?: string | symbol | null;
    },
  ): ViewTab | null => {
    if (!route.meta.tab || typeof route.name !== 'string') return null;
    const name = route.meta.tabName ?? route.name;
    return {
      path: route.fullPath,
      name,
      title: route.meta.title ?? name,
      keepAliveName: route.meta.keepAliveName,
      closable: name !== 'dashboard',
    };
  };
  const normalizeStoredTabs = (router: Router): void => {
    const normalized = new Map<string, ViewTab>();
    for (const item of tabs.value) {
      const resolved = router.resolve(item.path);
      if (typeof resolved.name !== 'string') continue;
      // 以稳定路由名解析正式地址，旧其他页面路径和重复分类标签归并到父标签。
      const canonical = router.resolve({
        name: resolved.name,
        params: resolved.params,
        query: resolved.query,
        hash: resolved.hash,
      });
      const tab = fromRoute(canonical);
      if (tab) normalized.set(tab.name, tab);
    }
    tabs.value = [...normalized.values()];
  };
  const visit = (route: RouteLocationNormalizedLoaded, router?: Router) => {
    if (!route.meta.tab || typeof route.name !== 'string') return;
    if (router) normalizeStoredTabs(router);
    const tab = fromRoute(
      router
        ? router.resolve({
            name: route.name,
            params: route.params,
            query: route.query,
            hash: route.hash,
          })
        : route,
    );
    if (!tab) return;
    const index = tabs.value.findIndex((item) => item.name === tab.name);
    if (index >= 0) tabs.value[index] = tab;
    else tabs.value.push(tab);
    persist();
  };
  const close = async (path: string, currentPath: string, router: Router) => {
    const tab = tabs.value.find((item) => item.path === path);
    if (!tab?.closable || closing.has(tab.name)) return;
    closing.add(tab.name);
    try {
      for (const guard of closeGuards.get(tab.name) ?? []) {
        if (!(await guard())) return;
      }
      const index = tabs.value.findIndex((item) => item.name === tab.name);
      if (index < 0) return;
      const active = router.currentRoute.value.fullPath || currentPath;
      const removed = tabs.value.splice(index, 1)[0];
      persist();
      const activeName = router.currentRoute.value.meta.tabName ?? router.currentRoute.value.name;
      if (removed?.name === activeName || removed?.path === active)
        await router.push(tabs.value[Math.max(0, index - 1)]?.path ?? '/');
    } finally {
      closing.delete(tab.name);
    }
  };
  return {
    tabs,
    keepAliveNames: computed(() =>
      tabs.value.map((item) => item.keepAliveName).filter((item): item is string => Boolean(item)),
    ),
    visit,
    close,
    registerCloseGuard,
  };
});
