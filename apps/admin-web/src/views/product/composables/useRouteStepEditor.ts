import { computed, ref } from 'vue';
import type { ProcessRouteStepItem, ProductMaterialItem } from '@company/contracts';
import { productApi } from '../../../api/product';
import { EMessage } from '../../../utils/message';

export type StepsStatus = 'idle' | 'loading' | 'success' | 'error';

/**
 * 路线步骤弹窗关键明细（docs/frontend-architecture.md §5.3 Editor）：
 *  - routeSteps(routeId)：关键编辑明细，本地加载；用 stepsRequestToken + loadedRouteId 做
 *    last-request-wins 守卫（快速切换路线或弹窗关闭后丢弃迟到响应/迟到失败），独立 stepsStatus
 *    （idle/loading/success/error）表达加载结果，非 success 时禁止保存，不转为可编辑空明细。
 *    过期请求返回 null 标记（而非空数组），调用方必须显式忽略，避免借用新请求的 success 状态。
 *  - materials(productId)：当前产品 BOM 候选，ID-bound 本地加载，带 productId 请求守卫（last-request-wins）。
 *
 * 工序 / 负责人候选已移至 RouteStepDialog 自持（useProcessStepOptions / useUserOptions）：
 * 弹窗打开、页面重新激活、下拉展开由弹窗统一触发刷新；本 editor 只负责 ID-bound 的
 * 路线步骤明细与物料候选（refreshMaterialOptions 供下拉展开 / 刷新按钮强制重请求）。
 */
export function useRouteStepEditor() {
  const routeMaterialOptions = ref<ProductMaterialItem[]>([]);
  /** 路线步骤加载状态（idle/loading/success/error），独立于通用 loading */
  const stepsStatus = ref<StepsStatus>('idle');
  /** 当前已成功加载步骤的路线 ID；失败或未加载时为 null */
  const loadedRouteId = ref<string | null>(null);
  /** 步骤加载中（由 stepsStatus 推导，保持导出兼容） */
  const loading = computed(() => stepsStatus.value === 'loading');
  /** 请求代际，快速切换路线时丢弃旧响应（last-request-wins） */
  let stepsRequestToken = 0;

  let materialRequest: Promise<void> | null = null;
  let materialRequestProductId: string | null = null;
  let materialRequestToken = 0;
  let loadedMaterialProductId: string | null = null;

  /** 当前产品 BOM 候选（ID-bound 本地）：last-request-wins，目标切换后旧响应必须丢弃 */
  const loadMaterialOptions = (productId: string, force = false): Promise<void> => {
    if (materialRequest && materialRequestProductId === productId) return materialRequest;
    if (!force && loadedMaterialProductId === productId) return Promise.resolve();
    materialRequestProductId = productId;
    const token = ++materialRequestToken;
    materialRequest = (async () => {
      try {
        const items = await productApi.materials(productId);
        if (token !== materialRequestToken) return; // 目标已变化，丢弃
        routeMaterialOptions.value = items.filter((item) => item.status === 1);
        loadedMaterialProductId = productId;
      } catch {
        if (token !== materialRequestToken) return;
        if (loadedMaterialProductId !== productId) routeMaterialOptions.value = []; // 首次失败保持空
        EMessage.warning('当前产品物料候选加载失败，下拉可能为空');
      } finally {
        if (token === materialRequestToken) {
          materialRequest = null;
          materialRequestProductId = null;
        }
      }
    })();
    return materialRequest;
  };

  /** 下拉展开 / 刷新按钮 / 页面激活：强制刷新当前产品物料候选 */
  const refreshMaterialOptions = (productId: string): Promise<void> =>
    loadMaterialOptions(productId, true);

  /**
   * 关键明细：路线步骤。last-request-wins：切换路线后旧响应/旧失败必须丢弃；失败置 error 并禁止保存，不转可保存空数据。
   * 返回值语义：成功返回步骤数组（空数组即该路线确实没有步骤）；过期请求返回 null 由调用方明确忽略——
   * 不得返回空数组，否则"关闭后重新打开同一路线"时旧响应会借用新请求的 success 状态，把空数组当成正常结果清空草稿。
   */
  const loadSteps = async (routeId: string): Promise<ProcessRouteStepItem[] | null> => {
    stepsStatus.value = 'loading';
    const token = ++stepsRequestToken;
    try {
      const steps = await productApi.routeSteps(routeId);
      if (token !== stepsRequestToken) return null; // 已切换路线或弹窗已关闭：过期标记，丢弃迟到响应
      loadedRouteId.value = routeId;
      stepsStatus.value = 'success';
      return steps;
    } catch (error) {
      if (token !== stepsRequestToken) return null; // 已切换路线或弹窗已关闭：过期标记，丢弃迟到失败
      loadedRouteId.value = null;
      stepsStatus.value = 'error';
      EMessage.error(error, '路线步骤加载失败');
      return [];
    }
  };

  /** 关闭弹窗：推进步骤请求代际使在途请求失效，并复位加载状态。弹窗关闭后迟到的步骤响应不得写回 localSteps */
  const invalidateSteps = (): void => {
    stepsRequestToken += 1;
    stepsStatus.value = 'idle';
  };

  return {
    routeMaterialOptions,
    loading,
    stepsStatus,
    loadedRouteId,
    loadSteps,
    loadMaterialOptions,
    refreshMaterialOptions,
    invalidateSteps,
  };
}
