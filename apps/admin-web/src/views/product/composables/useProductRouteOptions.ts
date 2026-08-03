import { computed } from 'vue';
import { useReferenceOptionsStore } from '../../../stores/reference-options';

/** 默认路线弹窗候选数据：原始路线选项来自共享候选 Store，过滤/映射留在消费侧。 */
export function useProductRouteOptions() {
  const store = useReferenceOptionsStore();

  const routeOptions = computed(() => store.routes);
  /** 打开弹窗：命中共享缓存即返回，首次访问（或 invalidate 后）发起请求 */
  const loadRouteOptions = () => store.ensureRoutes();
  /** 下拉展开 / 页面激活：强制刷新共享路线候选 */
  const refreshRouteOptions = () => store.refreshRoutes();

  return { routeOptions, loadRouteOptions, refreshRouteOptions };
}
