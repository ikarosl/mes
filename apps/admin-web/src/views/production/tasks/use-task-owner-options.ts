import { ref, type Ref } from 'vue';
import type { UserOption } from '@company/contracts';
import { productionTasksApi } from '../../../api/production/tasks';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';

interface TaskOwnerOptions {
  owners: Ref<UserOption[]>;
  loading: Ref<boolean>;
  verified: Ref<boolean>;
  error: Ref<boolean>;
  refreshOwners: () => Promise<void>;
  invalidateOwners: () => void;
}

/** 任务表单独享完整候选；历史负责人姓名由任务自身提供。 */
export function useTaskOwnerOptions(isVisible: () => boolean): TaskOwnerOptions {
  const owners = ref<UserOption[]>([]);
  const loading = ref(false);
  const verified = ref(false);
  const error = ref(false);
  const reader = useLatestReadRequest(() => {
    loading.value = false;
  });

  const refreshOwners = async (): Promise<void> => {
    if (!isVisible() || !reader.isActive()) return;
    const request = reader.begin(isVisible);
    loading.value = true;
    verified.value = false;
    error.value = false;
    try {
      const result = await productionTasksApi.taskOwnerOptions(request.signal);
      if (!request.isCurrent()) return;
      owners.value = result;
      verified.value = true;
    } catch (cause) {
      if (!request.isCurrent()) return;
      error.value = true;
      EMessage.error(cause, '任务负责人候选读取失败，请刷新重试');
    } finally {
      if (request.isCurrent()) loading.value = false;
    }
  };

  const invalidateOwners = (): void => {
    reader.invalidate();
    verified.value = false;
  };

  return { owners, loading, verified, error, refreshOwners, invalidateOwners };
}
