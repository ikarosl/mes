import { ref } from 'vue';
import type { ProcessRouteStepItem } from '@company/contracts';
import { productApi } from '../../../api/product';
import { EMessage } from '../../../utils/message';

export interface TaskStepPreview extends ProcessRouteStepItem {
  actualSopFileId: string | null;
}

/**
 * 新增任务弹窗的工序执行预览。
 * routeSteps(routeId) 关联具体路线，属 ID-bound 明细（docs/frontend-architecture.md §7.2），
 * 不进入共享候选 Store；带 routeId 请求身份守卫（last-request-wins），路线切换后旧响应必须丢弃。
 */
export function useTaskRouteSteps() {
  const preview = ref<TaskStepPreview[]>([]);
  let requestToken = 0;

  const load = async (routeId: string, editing: boolean): Promise<void> => {
    const token = ++requestToken; // 所有目标变化分支先推进代际，清空/编辑也会作废在途请求
    if (!routeId || editing) {
      preview.value = [];
      return;
    }
    try {
      const steps = await productApi.routeSteps(routeId);
      if (token !== requestToken) return; // 路线已切换或已清空，丢弃旧响应
      preview.value = steps.map((step) => ({
        ...step,
        actualSopFileId: null,
      }));
    } catch (error) {
      if (token !== requestToken) return;
      preview.value = [];
      EMessage.error(error, '工序执行预览加载失败');
    }
  };

  const reset = (): void => {
    preview.value = [];
    requestToken += 1;
  };

  return { preview, load, reset };
}
