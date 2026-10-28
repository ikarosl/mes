import { nextTick, watch, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { EMessage } from '../../../utils/message';

/** 外部专检来源定位仍通过执行页现有的任务切换和草稿保护。 */
export function useProductionExecutionLocation(options: {
  loading: Readonly<Ref<boolean>>;
  selectedBatchId: Readonly<Ref<string | null>>;
  selectBatch: (batchId: string) => Promise<void>;
  openStep: (stepId: string) => Promise<boolean>;
}): (force?: boolean) => Promise<void> {
  const route = useRoute(),
    router = useRouter();
  let locating = false;
  let acceptedTarget = '';
  const locate = async (force = false): Promise<void> => {
    if (route.name === 'production-execution-records' && !route.query.batchId) acceptedTarget = '';
    if (
      route.name !== 'production-execution-records' ||
      typeof route.query.batchId !== 'string' ||
      options.loading.value ||
      locating
    )
      return;
    const batchId = route.query.batchId;
    const stepId = typeof route.query.stepId === 'string' ? route.query.stepId : null;
    const target = `${batchId}:${stepId ?? ''}`;
    if (!force && acceptedTarget === target) return;
    locating = true;
    try {
      await nextTick();
      if (
        options.loading.value ||
        route.name !== 'production-execution-records' ||
        route.query.batchId !== batchId ||
        (typeof route.query.stepId === 'string' ? route.query.stepId : null) !== stepId
      )
        return;
      acceptedTarget = target;
      await options.selectBatch(batchId);
      if (
        options.selectedBatchId.value !== batchId ||
        route.name !== 'production-execution-records' ||
        route.query.batchId !== batchId
      )
        return;
      if (stepId && (route.query.stepId !== stepId || !(await options.openStep(stepId)))) return;
      if (
        route.name === 'production-execution-records' &&
        route.query.batchId === batchId &&
        (!stepId || route.query.stepId === stepId)
      ) {
        const query = { ...route.query };
        delete query.batchId;
        delete query.stepId;
        await router.replace({ query });
      }
    } finally {
      locating = false;
      if (
        route.name === 'production-execution-records' &&
        typeof route.query.batchId === 'string' &&
        (route.query.batchId !== batchId ||
          (typeof route.query.stepId === 'string' ? route.query.stepId : null) !== stepId)
      )
        void locate().catch((error: unknown) => EMessage.error(error, '生产任务定位失败'));
    }
  };
  watch(
    () => [route.name, route.query.batchId, route.query.stepId, options.loading.value],
    () => {
      void locate().catch((error: unknown) => EMessage.error(error, '生产任务定位失败'));
    },
  );
  return locate;
}
