import { ref, type Ref } from 'vue';
import type { UserOption } from '@company/contracts';
import { productionApi } from '../../../api/production';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';

interface WorkOrderOwnerOptions {
  owners: Ref<UserOption[]>;
  loading: Ref<boolean>;
  verified: Ref<boolean>;
  error: Ref<boolean>;
  refreshOwners: () => Promise<void>;
  invalidateOwners: () => void;
}

/** 工单表单独享完整候选；历史负责人姓名由工单自身提供。 */
export function useWorkOrderOwnerOptions(isVisible: () => boolean): WorkOrderOwnerOptions {
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
      const result = await productionApi.workOrderOwnerOptions(request.signal);
      if (!request.isCurrent()) return;
      owners.value = result;
      verified.value = true;
    } catch (cause) {
      if (!request.isCurrent()) return;
      error.value = true;
      EMessage.error(cause, '负责人候选读取失败，请刷新重试');
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
