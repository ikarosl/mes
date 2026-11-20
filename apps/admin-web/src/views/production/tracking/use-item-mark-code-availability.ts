import { computed, onActivated, ref, watch, type Ref } from 'vue';
import { isValidTrackingItemMarkCode, normalizeTrackingItemMarkCode } from '@company/utils';
import { productionTrackingApi } from '../../../api/production/tracking';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';

export async function readItemMarkCodeAvailability(code: string, signal: AbortSignal) {
  const result = await productionTrackingApi.itemMarkCodeAvailability(code, {
    signal,
    skipErrorHandling: true,
  });
  if (result.markCode !== code) throw new Error('编码校验结果不匹配');
  return result.available;
}

/** Advisory only: the write transaction remains the uniqueness boundary. */
export function useItemMarkCodeAvailability(code: Ref<string>, enabled: () => boolean) {
  const state = ref<'idle' | 'checking' | 'available' | 'occupied' | 'error'>('idle');
  const canonical = computed(() => normalizeTrackingItemMarkCode(code.value));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const reads = useLatestReadRequest(() => {
    clearTimeout(timer);
    state.value = 'idle';
  });
  async function check(): Promise<void> {
    reads.invalidate();
    const value = canonical.value;
    if (!enabled() || !reads.isActive() || !isValidTrackingItemMarkCode(value)) return;
    const read = reads.begin(() => enabled() && canonical.value === value);
    state.value = 'checking';
    try {
      const available = await readItemMarkCodeAvailability(value, read.signal);
      if (!read.isCurrent()) return;
      state.value = available ? 'available' : 'occupied';
    } catch {
      if (read.isCurrent()) state.value = 'error';
    }
  }
  function schedule(): void {
    reads.invalidate();
    if (!enabled() || !reads.isActive() || !isValidTrackingItemMarkCode(canonical.value)) return;
    state.value = 'checking';
    timer = setTimeout(() => {
      void check();
    }, 300);
  }
  watch([canonical, enabled], schedule, { immediate: true, flush: 'sync' });
  onActivated(schedule);
  const message = computed(() => {
    switch (state.value) {
      case 'checking':
        return '正在查重…';
      case 'available':
        return '编码当前可用，提交时再次校验。';
      case 'occupied':
        return '编码已被占用，请更换。';
      case 'error':
        return '查重失败。';
      default:
        return '';
    }
  });
  const tone = computed(() => {
    if (state.value === 'available') return 'success';
    if (state.value === 'occupied') return 'danger';
    if (state.value === 'error') return 'warning';
    return undefined;
  });
  return {
    message,
    tone,
    check,
    unavailable: computed(() => state.value === 'occupied'),
    failed: computed(() => state.value === 'error'),
  };
}
