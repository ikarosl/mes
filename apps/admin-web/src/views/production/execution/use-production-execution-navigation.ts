import { onActivated, onDeactivated, onScopeDispose, ref, watch, type Ref } from 'vue';

interface ProductionExecutionNavigationOptions {
  selectedBatchId: Ref<string | null>;
  loadBatches: (
    keyword: string,
    page: number,
    options?: { preserveSelection?: boolean },
  ) => Promise<number | null>;
  pageSize: number;
  selectBatch: (batchId: string) => Promise<void>;
  canChangeTarget: () => Promise<boolean>;
  onReadComplete: () => void;
}

/** 输入草稿与已应用筛选分别持有；改变上下文须先完成草稿保护。 */
export const useProductionExecutionNavigation = (options: ProductionExecutionNavigationOptions) => {
  const keywordDraft = ref('');
  const appliedKeyword = ref('');
  const currentPage = ref(1);
  const navigationPending = ref(false);
  let active = true,
    serial = 0,
    contextVersion = 0;
  watch(
    options.selectedBatchId,
    () => {
      contextVersion += 1;
    },
    { flush: 'sync' },
  );
  const invalidate = (): void => {
    active = false;
    serial += 1;
    navigationPending.value = false;
  };
  onActivated(() => {
    active = true;
  });
  onDeactivated(invalidate);
  onScopeDispose(invalidate);

  const transition = async (
    action: (isCurrent: () => boolean) => Promise<void>,
    requireGuard = true,
  ): Promise<void> => {
    if (!active || navigationPending.value) return;
    const currentSerial = ++serial,
      targetVersion = contextVersion;
    navigationPending.value = true;
    try {
      if (requireGuard && !(await options.canChangeTarget())) return;
      // 确认期间失活或换目标，不得把旧确认应用到新的筛选、页码或任务。
      if (!active || currentSerial !== serial || targetVersion !== contextVersion) return;
      await action(() => active && currentSerial === serial);
      if (active && currentSerial === serial) options.onReadComplete();
    } finally {
      if (currentSerial === serial) navigationPending.value = false;
    }
  };
  const loadWindow = async (
    keyword: string,
    page: number,
    preserveSelection: boolean,
    isCurrent: () => boolean,
  ): Promise<void> => {
    while (isCurrent()) {
      const total = await options.loadBatches(keyword, page, { preserveSelection });
      if (!isCurrent()) return;
      if (total === null) {
        currentPage.value = 1;
        return;
      }
      const lastPage = Math.max(1, Math.ceil(total / options.pageSize));
      if (page <= lastPage) return;
      currentPage.value = lastPage;
      if (total === 0) return;
      // 仅总数缩小且当前页越界时递减纠偏，不扫描其他历史分页。
      page = lastPage;
    }
  };
  const search = (): Promise<void> => {
    const keyword = keywordDraft.value.trim();
    return transition(async (isCurrent) => {
      appliedKeyword.value = keyword;
      currentPage.value = 1;
      await loadWindow(keyword, 1, false, isCurrent);
    });
  };
  const resetSearch = (): Promise<void> =>
    transition(async (isCurrent) => {
      keywordDraft.value = '';
      appliedKeyword.value = '';
      currentPage.value = 1;
      await loadWindow('', 1, false, isCurrent);
    });
  const changePage = (page: number): Promise<void> => {
    if (page === currentPage.value) return Promise.resolve();
    return transition(async (isCurrent) => {
      currentPage.value = page;
      await loadWindow(appliedKeyword.value, page, false, isCurrent);
    });
  };
  const selectBatch = (batchId: string): Promise<void> =>
    transition(() => options.selectBatch(batchId), batchId !== options.selectedBatchId.value);
  const refresh = (): Promise<void> =>
    transition(
      (isCurrent) => loadWindow(appliedKeyword.value, currentPage.value, true, isCurrent),
      false,
    );
  return {
    keywordDraft,
    appliedKeyword,
    currentPage,
    navigationPending,
    search,
    resetSearch,
    changePage,
    selectBatch,
    refresh,
  };
};
