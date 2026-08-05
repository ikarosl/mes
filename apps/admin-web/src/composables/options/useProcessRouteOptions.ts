import { productApi } from '../../api/product';
import { useRefreshableOptions } from './useRefreshableOptions';

/** 工艺路线候选（/process-routes/options）：跨页复用实现、每消费方独立实例 */
export function useProcessRouteOptions() {
  return useRefreshableOptions(
    () => productApi.routeOptions(),
    '工艺路线选项刷新失败，暂时保留上次数据',
  );
}
