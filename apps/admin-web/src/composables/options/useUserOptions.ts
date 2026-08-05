import { productApi } from '../../api/product';
import { useRefreshableOptions } from './useRefreshableOptions';

/** 用户/负责人候选（/users/options）：跨页复用实现、每消费方独立实例 */
export function useUserOptions() {
  return useRefreshableOptions(
    () => productApi.userOptions(),
    '用户选项刷新失败，暂时保留上次数据',
  );
}
