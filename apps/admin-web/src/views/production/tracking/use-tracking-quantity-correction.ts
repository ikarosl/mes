import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ProductionTrackingCardDetail, ProductionTrackingCardItem } from '@company/contracts';
import { productionTrackingApi } from '../../../api/production/tracking';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';

export type TrackingQuantityTarget = Pick<
  ProductionTrackingCardItem,
  'id' | 'productionBatchId' | 'cardNo'
>;

export function useTrackingQuantityCorrection(
  canOpen: () => boolean,
  onCardLoaded: (card: ProductionTrackingCardDetail) => void,
) {
  const route = useRoute(),
    router = useRouter();
  const target = ref<TrackingQuantityTarget | null>(null),
    loading = ref(false),
    error = ref('');
  const reads = useLatestReadRequest(() => {
    if (loading.value) error.value = '盘量更正依据加载已中断，请重试';
    loading.value = false;
  });
  function cancel(): void {
    reads.invalidate();
    target.value = null;
    error.value = '';
  }
  async function load(): Promise<void> {
    const requested = target.value;
    if (!requested || !canOpen() || !reads.isActive()) return;
    const path = route.fullPath;
    const read = reads.begin(() => target.value === requested);
    const canApply = () => read.isCurrent() && route.fullPath === path && canOpen();
    loading.value = true;
    error.value = '';
    try {
      const card = await productionTrackingApi.detail(requested.id, {
        signal: read.signal,
        skipErrorHandling: true,
      });
      if (!canApply()) return;
      if (
        card.id !== requested.id ||
        card.productionBatchId !== requested.productionBatchId ||
        card.cardNo !== requested.cardNo
      )
        throw new Error('更正依据与所选追踪卡不一致，请重新加载');
      onCardLoaded(card);
    } catch (failure) {
      if (canApply())
        error.value = `${requested.cardNo}：${failure instanceof Error ? failure.message : '盘量更正依据加载失败，请重试'}`;
    } finally {
      if (read.isCurrent()) loading.value = false;
    }
  }
  async function open({ id, productionBatchId, cardNo }: TrackingQuantityTarget): Promise<void> {
    if (!canOpen() || !reads.isActive()) return;
    target.value = { id, productionBatchId, cardNo };
    await load();
  }
  let consumingPath = '';
  async function consumeLocation(): Promise<boolean> {
    const path = route.fullPath;
    if (consumingPath === path) return false;
    consumingPath = path;
    cancel();
    // 清除当次操作标记，保留定位地址，供标签恢复和下一次快捷跳转使用。
    const destination = {
      name: 'production-tracking',
      query: { ...route.query, quantityCorrection: undefined },
      hash: route.hash,
    };
    try {
      const failure = await router.replace(destination);
      return (
        !failure && route.fullPath === router.resolve(destination).fullPath && reads.isActive()
      );
    } catch (failure) {
      if (route.fullPath === path) EMessage.error(failure, '无法打开盘量更正');
      return false;
    } finally {
      if (consumingPath === path) consumingPath = '';
    }
  }
  return { target, loading, error, cancel, load, open, consumeLocation };
}
