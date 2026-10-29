import { computed, onActivated, onDeactivated, ref, watch, type ComputedRef, type Ref } from 'vue';
import type {
  DemandCorrectionCheck,
  DemandCorrectionHistoryItem,
  ProductionBatchItem,
  ProductionMaterialDemandItem,
} from '@company/contracts';
import { productionMaterialDemandsApi } from '../../../api/production/material-demands';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import {
  buildProductionDemandTraceChain,
  productionDemandTraceTotals,
} from './production-demand-trace-presentation';

interface ProductionDemandTraceProps {
  visible: boolean;
  batch: ProductionBatchItem | null;
  demandId: string | null;
  demands: ProductionMaterialDemandItem[];
}

interface ProductionDemandTrace {
  rows: ComputedRef<ProductionMaterialDemandItem[]>;
  selected: ComputedRef<ProductionMaterialDemandItem | null>;
  original: ComputedRef<ProductionMaterialDemandItem | null>;
  latest: ComputedRef<ProductionMaterialDemandItem | null>;
  history: ComputedRef<DemandCorrectionHistoryItem[]>;
  latestCheck: ComputedRef<DemandCorrectionCheck | null>;
  loading: Ref<boolean>;
  error: Ref<string>;
  eligibilityError: Ref<string>;
  needsRefresh: Ref<boolean>;
  canCorrectLatest: ComputedRef<boolean>;
  refresh(): Promise<void>;
  cancel(): void;
}

/** 独立只读追溯；详情快照与最新需求的办理资格均由当前弹窗持有。 */
export function useProductionDemandTrace(props: ProductionDemandTraceProps): ProductionDemandTrace {
  const storedDemands = ref<ProductionMaterialDemandItem[]>([]);
  const storedHistory = ref<DemandCorrectionHistoryItem[]>([]);
  const storedCheck = ref<DemandCorrectionCheck | null>(null);
  const storedTarget = ref<{ batchId: string; demandId: string } | null>(null);
  const loading = ref(false);
  const error = ref('');
  const eligibilityError = ref('');
  const ready = ref(false);
  const active = ref(true);
  const needsRefresh = ref(true);
  const read = useLatestReadRequest(() => {
    loading.value = false;
    storedCheck.value = null;
  });

  const matchesTarget = computed(
    () =>
      storedTarget.value?.batchId === props.batch?.id &&
      storedTarget.value?.demandId === props.demandId,
  );
  const chain = computed(() =>
    matchesTarget.value && props.demandId
      ? buildProductionDemandTraceChain(storedDemands.value, props.demandId)
      : { rows: [], error: '' },
  );
  const rows = computed(() => chain.value.rows);
  const selected = computed(
    () => rows.value.find((row) => row.demandId === props.demandId) ?? null,
  );
  const original = computed(() => rows.value[0] ?? null);
  const latest = computed(() => rows.value[rows.value.length - 1] ?? null);
  const history = computed(() => (matchesTarget.value ? storedHistory.value : []));
  const latestCheck = computed(() => {
    const check = storedCheck.value;
    return matchesTarget.value &&
      check?.demandId === latest.value?.demandId &&
      check?.batchId === props.batch?.id &&
      check?.version === latest.value?.version
      ? check
      : null;
  });
  const canCorrectLatest = computed(() =>
    Boolean(
      props.visible &&
      active.value &&
      ready.value &&
      !loading.value &&
      !needsRefresh.value &&
      !error.value &&
      !eligibilityError.value &&
      latestCheck.value?.canCorrect,
    ),
  );

  async function refresh(): Promise<void> {
    const batchId = props.batch?.id;
    const demandId = props.demandId;
    if (!props.visible || !batchId || !demandId || !read.isActive()) return;
    const current = read.begin(
      () => props.visible && props.batch?.id === batchId && props.demandId === demandId,
    );
    loading.value = true;
    ready.value = false;
    needsRefresh.value = true;
    error.value = '';
    eligibilityError.value = '';
    try {
      const options = { signal: current.signal, skipErrorHandling: true };
      const [demands, corrections] = await Promise.all([
        productionMaterialDemandsApi.listMaterialDemands(batchId, options),
        productionMaterialDemandsApi.getDemandCorrectionHistory(demandId, options),
      ]);
      if (!current.isCurrent()) return;
      if (demands.some((row) => row.productionBatchId !== batchId))
        throw new Error('需求列表与当前任务不一致，请刷新后重新查看。');
      const nextChain = buildProductionDemandTraceChain(demands, demandId);
      if (nextChain.error) throw new Error(nextChain.error);
      const nextLatest = nextChain.rows[nextChain.rows.length - 1];
      if (!nextLatest || !productionDemandTraceTotals(nextChain.rows))
        throw new Error('需求链或数量未读取完整，请刷新后重新查看。');
      const chainIds = new Set(nextChain.rows.map((row) => row.demandId));
      if (
        corrections.some(
          (row) =>
            row.snapshot.check.batchId !== batchId ||
            row.snapshot.check.demandId !== row.oldDemandId ||
            !chainIds.has(row.oldDemandId) ||
            (row.newDemandId !== null && !chainIds.has(row.newDemandId)),
        )
      )
        throw new Error('需求链与审批历史已发生变化，请刷新后重新查看。');

      storedTarget.value = { batchId, demandId };
      storedDemands.value = demands;
      storedHistory.value = corrections;
      ready.value = true;

      // 历史需求的 check 只含祖先；更正资格只读取真实链末端，避免误用历史记录的核对结果。
      try {
        const check = await productionMaterialDemandsApi.getDemandCorrectionCheck(
          nextLatest.demandId,
          options,
        );
        if (!current.isCurrent()) return;
        if (check.batchId !== batchId || check.demandId !== nextLatest.demandId)
          throw new Error('更正核对与最新需求不一致，请刷新后重新查看。');
        if (check.version !== nextLatest.version)
          throw new Error('最新需求已发生变化，请刷新后再办理更正。');
        storedCheck.value = check;
        needsRefresh.value = false;
      } catch (failure) {
        if (!current.isCurrent() || current.signal.aborted) return;
        storedCheck.value = null;
        eligibilityError.value =
          failure instanceof Error ? failure.message : '最新需求的更正资格加载失败，请刷新。';
      }
    } catch (failure) {
      if (!current.isCurrent() || current.signal.aborted) return;
      storedCheck.value = null;
      error.value = failure instanceof Error ? failure.message : '需求变更追溯加载失败，请刷新。';
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  }

  const cancel = (): void => {
    read.invalidate();
    needsRefresh.value = true;
  };
  watch(
    () => [props.visible, props.batch?.id ?? null, props.demandId] as const,
    ([visible, batchId, demandId]) => {
      cancel();
      ready.value = false;
      error.value = '';
      eligibilityError.value = '';
      storedHistory.value = [];
      storedDemands.value = [];
      storedTarget.value = null;
      if (!visible || !batchId || !demandId) return;
      storedTarget.value = { batchId, demandId };
      storedDemands.value = props.demands.filter((row) => row.productionBatchId === batchId);
      void refresh();
    },
    { immediate: true },
  );
  onDeactivated(() => {
    active.value = false;
    needsRefresh.value = true;
  });
  onActivated(() => {
    active.value = true;
  });

  return {
    rows,
    selected,
    original,
    latest,
    history,
    latestCheck,
    loading,
    error,
    eligibilityError,
    needsRefresh,
    canCorrectLatest,
    refresh,
    cancel,
  };
}
