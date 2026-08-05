import { productApi } from '../../api/product';
import { useRefreshableOptions } from './useRefreshableOptions';

/** 产品分类候选（/categories/options）：跨页复用实现、每消费方独立实例。
 *  产品列表筛选、产品表单、分类表单共用同一实现；刷新失败保留上次成功快照。 */
export function useProductCategoryOptions() {
  return useRefreshableOptions(
    () => productApi.categoryOptions(),
    '产品分类选项刷新失败，暂时保留上次数据',
  );
}
