import { beforeEach, describe, expect, it } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useTabsStore } from '../tabs';

describe('tabs store', () => {
  beforeEach(() => {
    sessionStorage.clear();
    setActivePinia(createPinia());
  });

  it('deduplicates cached routes by route name', () => {
    const store = useTabsStore();
    const route = {
      name: 'users',
      fullPath: '/system/users',
      meta: { tab: true, title: '用户', keepAliveName: 'UsersPage' },
    };
    store.visit(route as never);
    store.visit(route as never);
    expect(store.tabs).toHaveLength(1);
    expect(store.keepAliveNames).toContain('UsersPage');
  });
});
