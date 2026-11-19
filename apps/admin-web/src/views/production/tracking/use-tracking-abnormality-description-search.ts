import { computed, ref } from 'vue';
import { productionTrackingApi } from '../../../api/production/tracking';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';

interface DescriptionSearchTarget {
  cardId: string;
  stepRecordId?: string;
}

export function useTrackingAbnormalityDescriptionSearch(
  target: () => DescriptionSearchTarget | null,
) {
  const items = ref<string[]>([]),
    loading = ref(false),
    error = ref(false),
    hasLoaded = ref(false),
    keyword = ref('');
  const total = ref(0);
  const page = ref(0);
  const pageSize = 20;
  const hasMore = computed(() => page.value * pageSize < total.value);
  let failedPage = 1;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const reads = useLatestReadRequest(() => {
    loading.value = false;
    clearTimeout(timer);
    timer = undefined;
  });

  function clearResults(): void {
    items.value = [];
    total.value = 0;
    page.value = 0;
    failedPage = 1;
    error.value = false;
    hasLoaded.value = false;
  }

  async function loadPage(nextPage: number): Promise<void> {
    const current = target();
    if (!current || !reads.isActive()) return;
    const query = keyword.value.trim();
    const read = reads.begin(() => {
      const latest = target();
      return (
        latest?.cardId === current.cardId &&
        latest?.stepRecordId === current.stepRecordId &&
        keyword.value.trim() === query
      );
    });
    if (nextPage === 1) clearResults();
    loading.value = true;
    error.value = false;
    try {
      const result = await productionTrackingApi.abnormalityDescriptionOptions(
        current.cardId,
        {
          stepRecordId: current.stepRecordId,
          keyword: query || undefined,
          page: nextPage,
          pageSize,
        },
        { signal: read.signal, skipErrorHandling: true },
      );
      if (!read.isCurrent()) return;
      items.value = [...new Set([...items.value, ...result.items])];
      total.value = result.total;
      page.value = nextPage;
      hasLoaded.value = true;
    } catch {
      // Candidate failures stay local; independent new descriptions remain editable.
      if (read.isCurrent()) {
        failedPage = nextPage;
        error.value = true;
      }
    } finally {
      if (read.isCurrent()) loading.value = false;
    }
  }

  async function refresh(): Promise<void> {
    await loadPage(1);
  }

  async function retry(): Promise<void> {
    if (!loading.value) await loadPage(error.value ? failedPage : 1);
  }

  async function loadMore(): Promise<void> {
    if (!loading.value && hasMore.value) await loadPage(page.value + 1);
  }

  function search(value: string): void {
    keyword.value = value;
    reads.invalidate();
    clearResults();
    if (!target() || !reads.isActive()) return;
    loading.value = true;
    timer = setTimeout(() => void refresh(), 250);
  }

  function clearCandidates(): void {
    reads.invalidate();
    clearResults();
  }

  function reset(): void {
    clearCandidates();
    keyword.value = '';
  }

  return {
    items,
    loading,
    error,
    hasLoaded,
    hasMore,
    keyword,
    search,
    refresh,
    retry,
    loadMore,
    clearCandidates,
    reset,
  };
}
