import { ref, watch } from 'vue';
import type { MaterialVariantItem } from '@company/contracts';
import { productApi } from '../../../api/product';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';

/** 每个已展开的物料独立持有明细；折叠时随所属面板销毁。 */
export function useMaterialVariants(materialId: () => string, snapshotRevision: () => number) {
  const variants = ref<MaterialVariantItem[]>([]);
  const loading = ref(false);
  const errorMessage = ref<string | null>(null);
  const reads = useLatestReadRequest(() => (loading.value = false));

  const load = async (): Promise<void> => {
    if (!reads.isActive()) return;
    const targetId = materialId();
    const revision = snapshotRevision();
    const { isCurrent, signal } = reads.begin(
      () => materialId() === targetId && snapshotRevision() === revision,
    );
    loading.value = true;
    variants.value = [];
    errorMessage.value = null;
    try {
      const result = await productApi.materialVariants(targetId, {
        signal,
        skipErrorHandling: true,
      });
      if (isCurrent()) variants.value = result;
    } catch (error) {
      if (!isCurrent()) return;
      errorMessage.value =
        error instanceof Error && error.message ? error.message : '请稍后重新加载物料版本';
    } finally {
      if (isCurrent()) loading.value = false;
    }
  };

  watch([materialId, snapshotRevision], () => void load(), { immediate: true });

  return { variants, loading, errorMessage, load };
}
