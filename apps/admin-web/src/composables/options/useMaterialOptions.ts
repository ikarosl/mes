import { productApi } from '../../api/product';
import { useRefreshableOptions } from './useRefreshableOptions';

/** 基础物料候选。每个页面或弹窗持有独立实例，避免跨缓存页共享状态。 */
export const useMaterialOptions = () =>
  useRefreshableOptions(productApi.materialOptions, '物料选项刷新失败，暂时保留上次数据');
