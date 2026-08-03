import { computed, ref } from 'vue';
import type {
  ProcessRouteStepItem,
  ProcessStepOption,
  ProductMaterialItem,
} from '@company/contracts';
import { productApi } from '../../../api/product';
import { useReferenceOptionsStore } from '../../../stores/reference-options';
import { EMessage } from '../../../utils/message';

export type StepsStatus = 'idle' | 'loading' | 'success' | 'error';

/**
 * 路线步骤弹窗关键明细与候选（docs/frontend-architecture.md §5.3 Editor）：
 *  - routeSteps(routeId)：关键编辑明细，本地加载；用 stepsRequestToken + loadedRouteId 做
 *    last-request-wins 守卫（快速切换路线时丢弃迟到响应/迟到失败），独立 stepsStatus
 *    （idle/loading/success/error）表达加载结果，非 success 时禁止保存，不转为可编辑空明细。
 *  - processStepOptions()：工序候选，唯一消费者，本地加载；刷新失败保留上次成功快照。
 *  - userOptions()：负责人候选，委托共享候选 Store（跨页复用）。
 *  - materials(productId)：当前产品 BOM 候选，ID-bound 本地加载，带 productId 请求守卫（last-request-wins）。
 *
 * 事件映射：弹窗打开用 loadSteps + loadAllOptions 并发加载；页面重新激活/刷新按钮用 loadAllOptions(force)；
 * 下拉展开只刷新对应资源（process / user / material）。
 */
export function useRouteStepEditor() {
  const store = useReferenceOptionsStore();
  const processOptions = ref<ProcessStepOption[]>([]);
  const routeMaterialOptions = ref<ProductMaterialItem[]>([]);
  /** 路线步骤加载状态（idle/loading/success/error），独立于通用 loading */
  const stepsStatus = ref<StepsStatus>('idle');
  /** 当前已成功加载步骤的路线 ID；失败或未加载时为 null */
  const loadedRouteId = ref<string | null>(null);
  /** 步骤加载中（由 stepsStatus 推导，保持导出兼容） */
  const loading = computed(() => stepsStatus.value === 'loading');
  /** 请求代际，快速切换路线时丢弃旧响应（last-request-wins） */
  let stepsRequestToken = 0;

  let processRequest: Promise<void> | null = null;
  let processLoaded = false;
  let materialRequest: Promise<void> | null = null;
  let materialRequestProductId: string | null = null;
  let materialRequestToken = 0;
  let loadedMaterialProductId: string | null = null;

  const userOptions = computed(() => store.users);

  /** 工序候选（唯一消费者，本地）：cache-first，refresh 强制且与在途合并；失败保留上次成功快照 */
  const loadProcessOptions = (force = false): Promise<void> => {
    if (processRequest) return processRequest;
    if (!force && processLoaded) return Promise.resolve();
    processRequest = (async () => {
      try {
        processOptions.value = await productApi.processStepOptions();
        processLoaded = true;
      } catch {
        if (!processLoaded) processOptions.value = []; // 首次失败保持空
        EMessage.warning('工序选项加载失败，下拉可能为空');
      } finally {
        processRequest = null;
      }
    })();
    return processRequest;
  };

  /** 负责人候选：委托共享 Store；展开下拉 = 强制刷新 */
  const loadUserOptions = (force = false): Promise<void> =>
    force ? store.refreshUsers() : store.ensureUsers();

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

  /** 弹窗打开/页面激活：并发加载三类候选，各资源独立错误边界 */
  const loadAllOptions = (productId: string | null, force = false): Promise<void> =>
    Promise.all([
      loadProcessOptions(force),
      productId ? loadMaterialOptions(productId, force) : Promise.resolve(),
      loadUserOptions(force),
    ]).then(() => undefined);

  /** 关键明细：路线步骤。last-request-wins：切换路线后旧响应/旧失败必须丢弃；失败置 error 并禁止保存，不转可保存空数据 */
  const loadSteps = async (routeId: string): Promise<ProcessRouteStepItem[]> => {
    stepsStatus.value = 'loading';
    const token = ++stepsRequestToken;
    try {
      const steps = await productApi.routeSteps(routeId);
      if (token !== stepsRequestToken) return []; // 已切换到其他路线，丢弃迟到响应
      loadedRouteId.value = routeId;
      stepsStatus.value = 'success';
      return steps;
    } catch (error) {
      if (token !== stepsRequestToken) return []; // 已切换到其他路线，丢弃迟到失败
      loadedRouteId.value = null;
      stepsStatus.value = 'error';
      EMessage.error(error, '路线步骤加载失败');
      return [];
    }
  };

  return {
    processOptions,
    userOptions,
    routeMaterialOptions,
    loading,
    stepsStatus,
    loadedRouteId,
    loadSteps,
    loadProcessOptions,
    loadUserOptions,
    loadMaterialOptions,
    loadAllOptions,
  };
}
