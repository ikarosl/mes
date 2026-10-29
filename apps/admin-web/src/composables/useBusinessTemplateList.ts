import { nextTick, onActivated, reactive, ref, watch } from 'vue';
import type { BusinessTemplateItem, BusinessTemplateStatus } from '@company/contracts';
import { businessTemplatesApi } from '../api/templates';
import { useLatestReadRequest } from './requests/useLatestReadRequest';

export function useBusinessTemplateList(active: () => boolean) {
  const items = ref<BusinessTemplateItem[]>([]);
  const loading = ref(false);
  const errorMessage = ref('');
  const total = ref(0);
  const page = ref(1);
  const pageSize = ref(10);
  const query = reactive<{ keyword: string; status: BusinessTemplateStatus | '' }>({
    keyword: '',
    status: '',
  });
  let refreshPending = false;
  const reads = useLatestReadRequest(() => (loading.value = false));
  watch(
    active,
    () => {
      if (!active()) reads.invalidate();
    },
    { flush: 'sync' },
  );
  const load = async (): Promise<void> => {
    refreshPending = true;
    if (!active() || !reads.isActive()) return;
    const { isCurrent, signal } = reads.begin(active);
    loading.value = true;
    errorMessage.value = '';
    try {
      const result = await businessTemplatesApi.list(
        {
          page: page.value,
          pageSize: pageSize.value,
          keyword: query.keyword.trim() || undefined,
          status: query.status || undefined,
        },
        signal,
      );
      if (!isCurrent()) return;
      items.value = result.items;
      total.value = result.total;
      refreshPending = false;
    } catch (error) {
      if (isCurrent()) {
        errorMessage.value = error instanceof Error ? error.message : '模板加载失败，请重试';
        refreshPending = false;
      }
    } finally {
      if (isCurrent()) loading.value = false;
    }
  };
  onActivated(async () => {
    // 等宿主恢复读取资格，只补做失活期间取消或跳过的刷新。
    await nextTick();
    if (refreshPending && active() && !loading.value) await load();
  });
  const search = async (): Promise<void> => {
    page.value = 1;
    await load();
  };
  const changePage = async (value: number): Promise<void> => {
    page.value = value;
    await load();
  };
  const changePageSize = async (value: number): Promise<void> => {
    pageSize.value = value;
    await search();
  };
  return {
    items,
    loading,
    errorMessage,
    total,
    page,
    pageSize,
    query,
    load,
    search,
    changePage,
    changePageSize,
  };
}
