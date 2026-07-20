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
const KEY = 'company-mes-view-tabs';
const read = (): ViewTab[] => {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as ViewTab[];
  } catch {
    return [];
  }
};
export const useTabsStore = defineStore('tabs', () => {
  const tabs = ref<ViewTab[]>(read());
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
    const index = tabs.value.findIndex((item) => item.path === path);
    if (index < 0 || !tabs.value[index]?.closable) return;
    tabs.value.splice(index, 1);
    persist();
    if (path === currentPath) await router.push(tabs.value[Math.max(0, index - 1)]?.path ?? '/');
  };
  return {
    tabs,
    keepAliveNames: computed(() =>
      tabs.value.map((item) => item.keepAliveName).filter((item): item is string => Boolean(item)),
    ),
    visit,
    close,
  };
});
