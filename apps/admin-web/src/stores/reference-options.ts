import { defineStore } from 'pinia';
import { ref, type Ref } from 'vue';
import type { ProcessRouteOption, ProductOption, UserOption } from '@company/contracts';
import { productApi } from '../api/product';
import { EMessage } from '../utils/message';

/**
 * 跨页面共享的原始候选（产品 / 路线 / 用户）。
 * 只保存"原始 /options 数据"；业务过滤与字段映射由消费方 computed 完成，Store 不知道业务语义。
 * 每类资源独立维护状态，各自持有独立 in-flight Promise；禁止出现共享 refreshAll。
 *
 * 语义（见 docs/frontend-architecture.md §4.2）：
 *  - ensureXxx(): cache-first。已有未失效的成功快照直接返回；未加载或已失效时请求。
 *  - refreshXxx(): 明确请求最新快照；若同资源已有在途请求，返回同一个 Promise。
 *  - invalidateXxx(): 只标记失效，不立即产生网络请求；下一个合法生命周期再 ensure/refresh。
 *  - $reset(): 清空全部快照、错误、失效标记并提升请求代次；登出、切换用户或权限变化时执行。
 *
 * 失败策略（共享缓存会传播到所有页面，不得无条件清空）：
 *  - 首次加载失败：保持空数组，状态置为 error（静默，不提示）。
 *  - 已缓存后刷新失败：保留最后一次成功快照，记录 error、提示，并标记为失效，
 *    下一次 ensure 会重新请求，而不是直接返回已确认陈旧的缓存。
 *  - 成功刷新：原子替换 items，清除错误与失效标记；业务投影经 computed 自动更新。
 *
 * 失效标记竞态（每资源独立 revision 解决）：
 *  - 请求开始时记录 revision；invalidate 递增 revision。
 *  - 请求成功返回时若 revision 已变化（请求期间被 invalidate）：仍可写入快照，
 *    但不得清除失效标记，确保下一次 ensure 能拉到写操作之后的最新数据。
 */

export type ReferenceResourceStatus = 'idle' | 'loading' | 'ready' | 'refreshing' | 'error';

interface OptionResourceState<T> {
  items: Ref<T[]>;
  status: Ref<ReferenceResourceStatus>;
  error: Ref<unknown | null>;
  loadedAt: Ref<number | null>;
  isInvalidated: Ref<boolean>;
}

interface ResourceSlot<T> {
  state: OptionResourceState<T>;
  inFlight: Promise<void> | null;
  warning: string;
  /** 每次 invalidate 递增；请求记录起始值，返回时若已变化则不得清除失效标记 */
  revision: number;
}

function createResource<T>(warning: string): ResourceSlot<T> {
  const state: OptionResourceState<T> = {
    items: ref<T[]>([]) as Ref<T[]>,
    status: ref<ReferenceResourceStatus>('idle'),
    error: ref<unknown | null>(null),
    loadedAt: ref<number | null>(null),
    isInvalidated: ref(false),
  };
  return { state, inFlight: null, revision: 0, warning };
}

export const useReferenceOptionsStore = defineStore('reference-options', () => {
  /** 请求代次：$reset 时递增，旧会话在途响应因 gen 不匹配而被丢弃 */
  let generation = 0;

  const products = createResource<ProductOption>('产品选项刷新失败，下拉可能未更新');
  const routes = createResource<ProcessRouteOption>('工艺路线选项刷新失败，下拉可能未更新');
  const users = createResource<UserOption>('用户选项刷新失败，下拉可能未更新');

  const run = <T>(
    slot: ResourceSlot<T>,
    fetch: () => Promise<T[]>,
    force: boolean,
  ): Promise<void> => {
    const { state } = slot;
    const hasSnapshot = state.loadedAt.value !== null;
    if (slot.inFlight) return slot.inFlight;
    if (!force && hasSnapshot && !state.isInvalidated.value) return Promise.resolve();
    const gen = generation;
    const rev = slot.revision;
    const p = (async () => {
      state.status.value = hasSnapshot ? 'refreshing' : 'loading';
      try {
        const data = await fetch();
        if (gen !== generation) return;
        state.items.value = data;
        state.loadedAt.value = Date.now();
        state.error.value = null;
        // 请求期间被 invalidate（revision 变化）时保留失效标记，下次 ensure 拉到最新
        if (rev === slot.revision) state.isInvalidated.value = false;
        state.status.value = 'ready';
      } catch (error) {
        if (gen !== generation) return;
        state.error.value = error;
        state.status.value = 'error';
        if (hasSnapshot) {
          // 已确认数据陈旧：下次 ensure 应重新请求，而非直接返回旧缓存
          state.isInvalidated.value = true;
          EMessage.warning(slot.warning);
        }
      } finally {
        if (gen === generation) slot.inFlight = null;
      }
    })();
    slot.inFlight = p;
    return p;
  };

  const invalidate = <T>(slot: ResourceSlot<T>): void => {
    slot.state.isInvalidated.value = true;
    slot.revision += 1;
  };
  const clear = <T>(slot: ResourceSlot<T>): void => {
    slot.state.items.value = [];
    slot.state.status.value = 'idle';
    slot.state.error.value = null;
    slot.state.loadedAt.value = null;
    slot.state.isInvalidated.value = false;
    slot.inFlight = null;
    slot.revision = 0;
  };

  const ensureProducts = () => run(products, () => productApi.productOptions(), false);
  const refreshProducts = () => run(products, () => productApi.productOptions(), true);
  const invalidateProducts = () => invalidate(products);

  const ensureRoutes = () => run(routes, () => productApi.routeOptions(), false);
  const refreshRoutes = () => run(routes, () => productApi.routeOptions(), true);
  const invalidateRoutes = () => invalidate(routes);

  const ensureUsers = () => run(users, () => productApi.userOptions(), false);
  const refreshUsers = () => run(users, () => productApi.userOptions(), true);
  const invalidateUsers = () => invalidate(users);

  /** 登出 / 切换用户 / 权限变化：清空全部缓存与在途状态，旧代际响应不得回填 */
  const $reset = (): void => {
    generation += 1;
    clear(products);
    clear(routes);
    clear(users);
  };

  return {
    products: products.state.items,
    routes: routes.state.items,
    users: users.state.items,
    productsStatus: products.state.status,
    routesStatus: routes.state.status,
    usersStatus: users.state.status,
    productsError: products.state.error,
    routesError: routes.state.error,
    usersError: users.state.error,
    ensureProducts,
    refreshProducts,
    invalidateProducts,
    ensureRoutes,
    refreshRoutes,
    invalidateRoutes,
    ensureUsers,
    refreshUsers,
    invalidateUsers,
    $reset,
  };
});
