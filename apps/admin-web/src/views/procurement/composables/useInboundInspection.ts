import { computed, onActivated, ref, watch } from 'vue';
import type {
  ProcurementInboundInspectionDetail,
  QualityInboundCaseItem,
} from '@company/contracts';
import { procurementApi } from '../../../api/procurement';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';
import { currentReceiptCase, isReceiptVoided } from '../receipt-round-presentation';
import { useReceiptLineAction } from './useReceiptLineAction';

/** 质检工作台持有当前依据、历史窗口与编辑器，读取刷新不替换编辑器的冻结版本。 */
export function useInboundInspection(onChanged: () => void) {
  const visible = ref(false);
  const lineId = ref('');
  const line = ref<ProcurementInboundInspectionDetail | null>(null);
  const loading = ref(false);
  const error = ref('');
  const activeTab = ref<'current' | 'history'>('current');
  const records = ref<QualityInboundCaseItem[]>([]);
  const recordsLoading = ref(false);
  const recordsError = ref('');
  const recordsLoaded = ref(false);
  const page = ref(1);
  const pageSize = ref(10);
  const total = ref(0);
  const focusedCaseId = ref('');
  const focusedSourceRoundNo = ref<number>();
  const detailRead = useLatestReadRequest(() => {
    loading.value = false;
  });
  const historyRead = useLatestReadRequest(() => {
    recordsLoading.value = false;
  });

  const actions = useReceiptLineAction(
    async (result) => {
      onChanged();
      if (!visible.value || result.receiptLineId !== lineId.value) return;
      const latest = await loadDetail();
      recordsLoaded.value = false;
      if (activeTab.value === 'history') void loadRecords();
      return latest ?? undefined;
    },
    { refreshOnActivated: false },
  );
  const reviewingCase = computed(() => (line.value ? currentReceiptCase(line.value) : undefined));
  const editingLine = computed(() => {
    const source = actions.line.value;
    return actions.visible.value && source && !('allocations' in source) ? source : null;
  });
  const contextLine = computed(() => editingLine.value ?? line.value);
  const currentCase = computed(
    () =>
      contextLine.value?.cases.find(
        (record) => record.inspection?.id === contextLine.value?.currentRound.inspectionId,
      ) ?? null,
  );
  const currentInspection = computed(() => currentCase.value?.inspection ?? null);
  const roundNoForCase = (record: QualityInboundCaseItem | null): number | undefined => {
    const source = contextLine.value;
    if (!source || !record) return undefined;
    if (source.currentRound.id === record.roundId) return source.currentRound.roundNo;
    return source.rounds.find((round) => round.id === record.roundId)?.roundNo;
  };
  const currentCaseRoundNo = computed(() => roundNoForCase(currentCase.value));
  const busy = computed(() => loading.value || actions.loading.value || actions.command.busy.value);
  const blocked = computed(
    () => busy.value || Boolean(error.value) || actions.command.locked.value,
  );

  async function loadDetail(): Promise<ProcurementInboundInspectionDetail | null> {
    if (!visible.value || !lineId.value || !detailRead.isActive()) return null;
    const target = lineId.value;
    const current = detailRead.begin(() => visible.value && lineId.value === target);
    loading.value = true;
    try {
      const result = await procurementApi.inspectionReceiptLine(target, current.signal);
      if (!current.isCurrent()) return null;
      if (result.id !== target) throw new Error('检验详情与到货明细不匹配');
      line.value = result;
      error.value = '';
      return result;
    } catch (cause) {
      if (current.isCurrent()) {
        error.value = '检验依据加载失败；已显示的内容为上次读取结果，请刷新后重新核对。';
        EMessage.error(cause, '检验依据加载失败');
      }
      return null;
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  }
  async function loadRecords(): Promise<void> {
    if (!visible.value || activeTab.value !== 'history' || !historyRead.isActive()) return;
    const targetLine = lineId.value;
    const targetCase = focusedCaseId.value;
    const requestedPage = page.value;
    const requestedPageSize = pageSize.value;
    if (!targetLine && !targetCase) return;
    const current = historyRead.begin(
      () =>
        visible.value &&
        activeTab.value === 'history' &&
        (!targetLine || lineId.value === targetLine) &&
        focusedCaseId.value === targetCase &&
        page.value === requestedPage &&
        pageSize.value === requestedPageSize,
    );
    recordsLoading.value = true;
    try {
      if (targetCase) {
        const result = await procurementApi.getInspection(targetCase, current.signal);
        if (!current.isCurrent()) return;
        if (
          result.case.id !== targetCase ||
          result.case.receiptLineId !== result.receiptLineId ||
          (targetLine && result.receiptLineId !== targetLine)
        )
          throw new Error('指定检验记录与到货明细不匹配');
        lineId.value = result.receiptLineId;
        records.value = [result.case];
        focusedSourceRoundNo.value = result.sourceRoundNo;
        total.value = 1;
        if (!line.value && !loading.value) void loadDetail();
      } else {
        const result = await procurementApi.receiptCases(
          targetLine,
          { page: requestedPage, pageSize: requestedPageSize },
          current.signal,
        );
        if (!current.isCurrent()) return;
        if (result.items.some((record) => record.receiptLineId !== targetLine))
          throw new Error('检验历史与到货明细不匹配');
        records.value = result.items;
        total.value = result.total;
      }
      recordsError.value = '';
      recordsLoaded.value = true;
    } catch (cause) {
      if (current.isCurrent()) {
        recordsError.value = targetCase
          ? '指定检验记录读取失败或不属于此到货明细；未切换到其他记录，请重试或查看全部历史。'
          : '检验历史加载失败，请重试；已显示的内容为上次读取结果。';
        EMessage.error(cause, '检验历史加载失败');
      }
    } finally {
      if (current.isCurrent()) recordsLoading.value = false;
    }
  }
  async function refresh(): Promise<void> {
    if (actions.command.busy.value) return;
    const latest = await loadDetail();
    if (latest && actions.visible.value && !actions.command.locked.value)
      await actions.check(latest);
    if (activeTab.value === 'history') await loadRecords();
  }
  async function open(id: string, caseId = ''): Promise<boolean> {
    if (visible.value && !(await close())) return false;
    if (!id && !caseId) return false;
    detailRead.invalidate();
    historyRead.invalidate();
    lineId.value = id;
    line.value = null;
    error.value = '';
    focusedCaseId.value = caseId;
    focusedSourceRoundNo.value = undefined;
    records.value = [];
    total.value = 0;
    page.value = 1;
    pageSize.value = 10;
    recordsError.value = '';
    recordsLoaded.value = false;
    activeTab.value = caseId ? 'history' : 'current';
    visible.value = true;
    if (id) void loadDetail();
    if (caseId) void loadRecords();
    return true;
  }
  async function close(): Promise<boolean> {
    if (actions.command.busy.value) return false;
    if ((actions.visible.value || actions.command.locked.value) && !(await actions.close()))
      return false;
    visible.value = false;
    detailRead.invalidate();
    historyRead.invalidate();
    return true;
  }
  async function showAllRecords(): Promise<void> {
    if (!lineId.value) return;
    historyRead.invalidate();
    focusedCaseId.value = '';
    focusedSourceRoundNo.value = undefined;
    records.value = [];
    recordsError.value = '';
    recordsLoaded.value = false;
    page.value = 1;
    await loadRecords();
  }
  async function changePage(value: number): Promise<void> {
    if (value === page.value) return;
    page.value = value;
    records.value = [];
    recordsLoaded.value = false;
    await loadRecords();
  }
  async function changePageSize(value: number): Promise<void> {
    pageSize.value = value;
    page.value = 1;
    records.value = [];
    recordsLoaded.value = false;
    await loadRecords();
  }
  function beginAction(): void {
    if (blocked.value || !line.value || isReceiptVoided(line.value) || actions.visible.value)
      return;
    if (reviewingCase.value) actions.openInspection(line.value, 'inspect', reviewingCase.value);
    else actions.openInspection(line.value, 'review');
  }
  watch(
    activeTab,
    (value) => {
      if (!visible.value) return;
      if (value === 'history' && !recordsLoaded.value) void loadRecords();
      else if (value !== 'history') historyRead.invalidate();
    },
    { flush: 'sync' },
  );
  onActivated(() => {
    if (visible.value) void refresh();
  });
  return {
    visible,
    lineId,
    line,
    loading,
    error,
    activeTab,
    records,
    recordsLoading,
    recordsError,
    page,
    pageSize,
    total,
    focusedCaseId,
    focusedSourceRoundNo,
    actions,
    reviewingCase,
    currentCase,
    currentInspection,
    currentCaseRoundNo,
    contextLine,
    busy,
    blocked,
    open,
    close,
    refresh,
    showAllRecords,
    changePage,
    changePageSize,
    beginAction,
  };
}
