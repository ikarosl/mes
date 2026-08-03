import { computed, ref } from 'vue';
import type { ProductMaterialItem } from '@company/contracts';
import { productApi } from '../../../api/product';
import { useReferenceOptionsStore } from '../../../stores/reference-options';
import { EMessage } from '../../../utils/message';

/** 当前产品 BOM 明细的就绪状态：loading/error 时禁止保存 */
export type ProductMaterialDetailStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * 产品物料清单弹窗关键明细与候选（docs/frontend-architecture.md §5.3 Editor）：
 *  - 当前产品 BOM 明细（materials(productId)）为 ID-bound 关键明细，本地加载并带 productId 请求守卫：
 *    过期响应不得覆盖新目标；失败返回 null（不转换成可保存的空数据）。
 *    通过 detailStatus + loadedProductId 记录明细就绪状态，调用方仅在
 *    detailStatus === 'ready' 且 loadedProductId === 当前产品时才允许保存，
 *    否则旧产品的行可能被保存到新产品，或失败后用空数组清空新产品的 BOM。
 *  - 可选物料候选来自共享候选 Store（产品候选），按当前产品过滤（排除自身、保留物料/半成品）。
 */
export function useProductMaterialEditor() {
  const store = useReferenceOptionsStore();
  const currentProductId = ref<string | null>(null);
  /** BOM 明细已加载完成归属的产品；明细失败/过期不更新，表示 localRows 仍属于上一个产品 */
  const loadedProductId = ref<string | null>(null);
  /** 当前目标产品 BOM 明细的就绪状态：loading/error 时禁止保存 */
  const detailStatus = ref<ProductMaterialDetailStatus>('idle');
  const bomLoading = ref(false);
  let requestToken = 0;

  const materialOptions = computed(() =>
    store.products.filter(
      (item) =>
        (item.itemKind === 'material' || item.itemKind === 'semi_finished') &&
        item.id !== currentProductId.value,
    ),
  );
  /** BOM 明细加载或共享产品候选刷新进行中，供刷新按钮展示 loading */
  const loading = computed(
    () =>
      bomLoading.value ||
      store.productsStatus === 'loading' ||
      store.productsStatus === 'refreshing',
  );

  /** 下拉展开 / 刷新按钮 / 页面激活：只刷新共享产品候选，不重载 BOM 行 */
  const refreshOptions = (productId: string): Promise<void> => {
    currentProductId.value = productId;
    return store.refreshProducts();
  };

  /**
   * 打开弹窗：并发加载当前产品 BOM 明细与候选。
   * 明细成功返回数组，并置 detailStatus='ready' / loadedProductId=productId；
   * 明细失败或目标产品已变化返回 null（不覆盖为可保存空数据），失败置 detailStatus='error'。
   */
  const load = async (productId: string): Promise<ProductMaterialItem[] | null> => {
    currentProductId.value = productId;
    const token = ++requestToken;
    detailStatus.value = 'loading';
    bomLoading.value = true;
    try {
      const [rowsResult] = await Promise.allSettled([
        productApi.materials(productId),
        store.ensureProducts(),
      ]);
      if (token !== requestToken) return null; // 目标产品已变化，过期响应丢弃
      if (rowsResult.status === 'rejected') {
        EMessage.error(rowsResult.reason, '物料清单加载失败');
        detailStatus.value = 'error';
        return null;
      }
      loadedProductId.value = productId;
      detailStatus.value = 'ready';
      return rowsResult.value;
    } finally {
      if (token === requestToken) bomLoading.value = false;
    }
  };

  return { materialOptions, loading, detailStatus, loadedProductId, load, refreshOptions };
}
