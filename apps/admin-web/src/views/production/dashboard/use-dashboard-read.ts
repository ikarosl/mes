import { shallowReactive } from 'vue';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';

/** Each panel owns its request generation and error; one failed chart cannot erase the others. */
export function useDashboardRead<T>({
  keepPreviousData = false,
}: { keepPreviousData?: boolean } = {}): {
  state: { data: T | null; loading: boolean; error: string };
  load: (read: (signal: AbortSignal) => Promise<T>) => Promise<T | undefined>;
  clear: () => void;
} {
  const state = shallowReactive<{ data: T | null; loading: boolean; error: string }>({
    data: null,
    loading: false,
    error: '',
  });
  const request = useLatestReadRequest(() => {
    if (state.loading) state.error = '加载已中断，请重新查询';
    state.loading = false;
  });
  const load = async (read: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> => {
    if (!request.isActive()) return;
    const current = request.begin();
    state.loading = true;
    state.error = '';
    if (!keepPreviousData) state.data = null;
    try {
      const data = await read(current.signal);
      if (current.isCurrent()) {
        state.data = data;
        return data;
      }
    } catch (error) {
      if (current.isCurrent())
        state.error = error instanceof Error ? error.message : '加载失败，请重试';
    } finally {
      if (current.isCurrent()) state.loading = false;
    }
  };
  return {
    state,
    load,
    clear: () => {
      request.invalidate();
      state.data = null;
      state.error = '';
    },
  };
}
