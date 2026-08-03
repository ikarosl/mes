import { computed } from 'vue';
import { useReferenceOptionsStore } from '../../../stores/reference-options';

/** 路线基本信息弹窗候选数据：适用产品（自制半成品/成品）。原始数据来自共享候选 Store，过滤留在消费侧。 */
export function useProductFormOptions() {
  const store = useReferenceOptionsStore();

  const productOptions = computed(() =>
    store.products.filter(
      (item) => item.acquireMethod === 'self_made' && item.itemKind !== 'material',
    ),
  );
  /** 打开弹窗：命中共享缓存即返回，首次访问（或 invalidate 后）发起请求 */
  const loadProductOptions = () => store.ensureProducts();
  /** 下拉展开 / 页面激活：强制刷新共享产品候选 */
  const refreshProductOptions = () => store.refreshProducts();

  return { productOptions, loadProductOptions, refreshProductOptions };
}
