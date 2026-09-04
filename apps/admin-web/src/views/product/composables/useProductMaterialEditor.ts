import { computed, ref } from 'vue';
import type { ProductMaterialItem } from '@company/contracts';
import { productApi } from '../../../api/product';
import { useProductOptions } from '../../../composables/options/useProductOptions';
import { EMessage } from '../../../utils/message';

/** 当前产品 BOM 明细的就绪状态：loading/error 时禁止保存 */
export type ProductMaterialDetailStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * 产品物料清单弹窗关键明细与候选（apps/admin-web/docs/architecture.md §5.3 Editor）：
 *  - 当前产品 BOM 明细（materials(productId)）为 ID-bound 关键明细，本地加载并带 productId 请求守卫：
 *    过期响应不得覆盖新目标；失败返回 null（不转换成可保存的空数据）。
 *    通过 detailStatus + loadedProductId 记录明细就绪状态，调用方仅在
 *    detailStatus === 'ready' 且 loadedProductId === 当前产品时才允许保存，
 *    否则旧产品的行可能被保存到新产品，或失败后用空数组清空新产品的 BOM。
 *  - 可选物料候选来自本弹窗自持的产品候选实例（useProductOptions），按当前产品过滤
 *    （排除自身、仅保留物料）；刷新失败保留上次成功快照并提示，不拖累 BOM 明细。
 */
export function useProductMaterialEditor() {
  const productSource = useProductOptions();
  const currentProductId = ref<string | null>(null);
  /** BOM 明细已加载完成归属的产品；明细失败/过期不更新，表示 localRows 仍属于上一个产品 */
  const loadedProductId = ref<string | null>(null);
  /** 当前目标产品 BOM 明细的就绪状态：loading/error 时禁止保存 */
  const detailStatus = ref<ProductMaterialDetailStatus>('idle');
  const bomLoading = ref(false);
  let requestToken = 0;

  const materialOptions = computed(() =>
    productSource.options.value.filter(
      (item) => item.itemKind === 'material' && item.id !== currentProductId.value,
    ),
  );
  /** BOM 明细加载或产品候选刷新进行中，供刷新按钮展示 loading */
  const loading = computed(() => bomLoading.value || productSource.loading.value);

  /** 下拉展开 / 刷新按钮 / 页面激活：只刷新产品候选，不重载 BOM 行 */
  const refreshOptions = (productId: string): Promise<void> => {
    currentProductId.value = productId;
    return productSource.refresh();
  };

  /**
   * 打开弹窗：候选 best-effort 独立启动，仅等待当前产品 BOM 明细（architecture.md §5.3/§8）。
   * 明细成功返回数组，并置 detailStatus='ready' / loadedProductId=productId；
   * 明细失败或目标产品已变化返回 null（不覆盖为可保存空数据），失败置 detailStatus='error'。
   * 候选刷新（useRefreshableOptions.refresh()）不 reject：失败保留上次快照并提示，
   * 结果就绪后单独更新候选 loading/options，不拖累明细的 loading/status。
   */
  const load = async (productId: string): Promise<ProductMaterialItem[] | null> => {
    currentProductId.value = productId;
    const token = ++requestToken;
    detailStatus.value = 'loading';
    bomLoading.value = true;
    // 候选刷新独立启动、不 await：候选再慢/再失败也不阻塞 BOM 明细就绪
    void productSource.refresh();
    try {
      const rows = await productApi.materials(productId);
      if (token !== requestToken) return null; // 目标产品已变化，过期响应丢弃
      loadedProductId.value = productId;
      detailStatus.value = 'ready';
      return rows;
    } catch (reason) {
      if (token !== requestToken) return null; // 目标产品已变化，过期失败不提示
      EMessage.error(reason, '物料清单加载失败');
      detailStatus.value = 'error';
      return null;
    } finally {
      if (token === requestToken) bomLoading.value = false;
    }
  };

  /**
   * 关闭弹窗：推进请求代际使在途明细请求失效，并复位就绪状态。
   * 弹窗关闭后迟到的明细响应不得写回 localRows；再次打开时从 idle 重新加载。
   */
  const invalidate = (): void => {
    requestToken += 1;
    bomLoading.value = false;
    detailStatus.value = 'idle';
  };

  return {
    materialOptions,
    loading,
    detailStatus,
    loadedProductId,
    load,
    refreshOptions,
    invalidate,
  };
}
