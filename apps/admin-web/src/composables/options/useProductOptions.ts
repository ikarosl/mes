import { productApi } from '../../api/product';
import { useRefreshableOptions } from './useRefreshableOptions';

/** 产品候选（/products/options）：跨页复用实现、每消费方独立实例（architecture.md） */
export function useProductOptions() {
  return useRefreshableOptions(
    () => productApi.productOptions(),
    '产品选项刷新失败，暂时保留上次数据',
  );
}
