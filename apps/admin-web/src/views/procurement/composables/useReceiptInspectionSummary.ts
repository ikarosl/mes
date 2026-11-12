import { ref, shallowRef, watch } from 'vue';
import { RequestError } from '@company/request';
import type { QualityIncomingInspectionReportSummary } from '@company/contracts';
import { procurementApi } from '../../../api/procurement';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';

/** 固定读取第一页，当前报告不随下方历史页码变化。 */
export function useReceiptInspectionSummary(
  lineId: () => string,
  active: () => boolean,
  canViewQuality: () => boolean,
) {
  const total = ref<number | null>(null);
  const latest = shallowRef<QualityIncomingInspectionReportSummary | null>(null);
  const loading = ref(false);
  const failed = ref(false);
  const forbidden = ref(false);
  let attempted = false;
  const read = useLatestReadRequest(() => {
    loading.value = false;
  });

  const refresh = async (): Promise<void> => {
    const target = lineId();
    if (!target || !active() || !canViewQuality() || !read.isActive()) return;
    const current = read.begin(() => lineId() === target && active() && canViewQuality());
    attempted = true;
    loading.value = true;
    try {
      const result = await procurementApi.inspectionReports(
        target,
        { page: 1, pageSize: 1 },
        current.signal,
      );
      if (!current.isCurrent()) return;
      if (
        result.items.length > 1 ||
        result.items.some((item) => item.receiptLineId !== target) ||
        result.total > 0 !== result.items.length > 0 ||
        (result.items[0]?.id ?? null) !== result.currentReportId
      )
        throw new Error('检验报告摘要不完整，请刷新重试');
      total.value = result.total;
      latest.value = result.items[0] ?? null;
      failed.value = false;
      forbidden.value = false;
    } catch (error) {
      if (!current.isCurrent()) return;
      failed.value = true;
      forbidden.value = error instanceof RequestError && error.status === 403;
      if (forbidden.value) {
        total.value = null;
        latest.value = null;
      }
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  };

  watch(
    () => ({ id: lineId(), active: active(), allowed: canViewQuality() }),
    (current, previous) => {
      if (current.id !== previous?.id || current.allowed !== previous?.allowed) {
        read.invalidate();
        total.value = null;
        latest.value = null;
        failed.value = false;
        forbidden.value = false;
        attempted = false;
      }
      if (!current.active || !current.allowed) {
        read.invalidate();
        return;
      }
      if (current.id && !attempted) void refresh();
    },
    { immediate: true },
  );

  return { total, latest, loading, failed, forbidden, refresh, invalidate: read.invalidate };
}
