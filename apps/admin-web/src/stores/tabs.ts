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
  const visit = (route: RouteLocationNormalizedLoaded) => {
    if (!route.meta.tab || typeof route.name !== 'string') return;
    const tab: ViewTab = {
      path: route.fullPath,
      name: route.name,
      title: route.meta.title ?? String(route.name),
      keepAliveName: route.meta.keepAliveName,
      closable: route.name !== 'dashboard',
    };
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
      if (removed?.path === active)
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
