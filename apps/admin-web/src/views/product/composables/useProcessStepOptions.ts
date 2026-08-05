import { productApi } from '../../../api/product';
import { useRefreshableOptions } from '../../../composables/options/useRefreshableOptions';

/** 工序候选（/process-steps/options）：唯一消费者（路线步骤弹窗），自持实例 */
export function useProcessStepOptions() {
  return useRefreshableOptions(
    () => productApi.processStepOptions(),
    '工序选项刷新失败，暂时保留上次数据',
  );
}
