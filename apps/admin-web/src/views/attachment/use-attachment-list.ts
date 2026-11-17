import { nextTick, onActivated, reactive, ref } from 'vue';
import type { AttachmentListItem, AttachmentQuery } from '@company/contracts';
import { attachmentsApi } from '../../api/attachments';
import { useLatestReadRequest } from '../../composables/requests/useLatestReadRequest';

export function useAttachmentList(active: () => boolean) {
  const items = ref<AttachmentListItem[]>([]);
  const loading = ref(false);
  const errorMessage = ref('');
  const total = ref(0);
  const page = ref(1);
  const pageSize = ref(20);
  const query = reactive<
    Pick<AttachmentQuery, 'keyword' | 'fileType' | 'referenceState' | 'lifecycle'>
  >({});
  let refreshAfterWritePending = false;
  const reads = useLatestReadRequest(() => {
    loading.value = false;
  });
  const load = async (): Promise<void> => {
    if (!active() || !reads.isActive()) return;
    refreshAfterWritePending = false;
    const { isCurrent, signal } = reads.begin(active);
    loading.value = true;
    errorMessage.value = '';
    try {
      const result = await attachmentsApi.list(
        {
          page: page.value,
          pageSize: pageSize.value,
          keyword: query.keyword?.trim() || undefined,
          fileType: query.fileType || undefined,
          referenceState: query.referenceState || undefined,
          lifecycle: query.lifecycle || undefined,
        },
        signal,
      );
      if (!isCurrent()) return;
      items.value = result.items;
      total.value = result.total;
    } catch (error) {
      if (isCurrent()) {
        errorMessage.value = error instanceof Error ? error.message : '附件读取失败，请刷新后重试';
      }
    } finally {
      if (isCurrent()) loading.value = false;
    }
  };
  const refreshAfterWrite = async (): Promise<void> => {
    refreshAfterWritePending = true;
    await load();
  };
  onActivated(async () => {
    await nextTick();
    if (refreshAfterWritePending && active() && !loading.value) await load();
  });
  const search = async (): Promise<void> => {
    page.value = 1;
    await load();
  };
  const reset = async (): Promise<void> => {
    query.keyword = undefined;
    query.fileType = undefined;
    query.referenceState = undefined;
    query.lifecycle = undefined;
    await search();
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
    refreshAfterWrite,
    search,
    reset,
    changePage,
    changePageSize,
  };
}
