import { computed, onScopeDispose, reactive, ref, watch } from 'vue';
import { RequestError } from '@company/request';
import { PRODUCTION_OUTPUT_QUANTITY_MAX } from '@company/constants';
import type {
  CreateProcessInspectionPayload,
  CorrectProcessInspectionPayload,
  ReverseProcessInspectionPayload,
  RecordProcessInspectionPayload,
  ProcessInspectionEntry,
  ProcessInspectionRecord,
  ProcessInspectionStepSummary,
} from '@company/contracts';
import { processInspectionsApi } from '../../../api/process-inspections';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { useIdempotentIntent } from '../../../composables/idempotency/useIdempotentIntent';
import { useTabsStore } from '../../../stores/tabs';
import { useAuthStore } from '../../../stores/auth';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { fromBeijingDateTimeInputValue, toBeijingDateTimeInputValue } from '../../../utils/date';

type EditorMode = 'view' | 'create' | 'correct' | 'reverse';
type PendingCommand =
  | { mode: 'create'; body: CreateProcessInspectionPayload }
  | { mode: 'correct'; id: string; body: CorrectProcessInspectionPayload }
  | { mode: 'reverse'; id: string; body: ReverseProcessInspectionPayload };
const emptyForm = () => ({
  inspectionMethod: 'sampling' as RecordProcessInspectionPayload['inspectionMethod'],
  qualifiedQuantity: '',
  unqualifiedQuantity: '',
  scopeNote: '',
  inspectedAt: '',
  resultNote: '',
  evidenceReference: '',
  reason: '',
});
const validDate = (value: string): boolean => {
  try {
    return !!fromBeijingDateTimeInputValue(value);
  } catch {
    return false;
  }
};
const parseQuantity = (value: string): number | null =>
  /^\d+$/.test(value.trim()) &&
  Number.isSafeInteger(Number(value)) &&
  Number(value) <= PRODUCTION_OUTPUT_QUANTITY_MAX
    ? Number(value)
    : null;

export function useProcessInspectionEntry(
  changed: (inspectionId: string, created: boolean) => void,
) {
  const visible = ref(false),
    mode = ref<EditorMode>('view'),
    targetId = ref('');
  const detail = ref<ProcessInspectionEntry | null>(null),
    loading = ref(false),
    error = ref('');
  const form = reactive(emptyForm()),
    baselineVersion = ref<number | null>(null);
  const submitting = ref(false),
    unresolved = ref(false),
    intentStatus = ref('idle');
  const records = ref<ProcessInspectionRecord[]>([]),
    historyPage = ref(1),
    historyPageSize = ref(10),
    historyTotal = ref(0);
  const historyLoading = ref(false),
    historyError = ref('');
  const step = ref<ProcessInspectionStepSummary | null>(null);
  const read = useLatestReadRequest(() => {
    loading.value = false;
  });
  const historyRead = useLatestReadRequest(() => {
    historyLoading.value = false;
  });
  let intent = useIdempotentIntent('工序专检记录');
  let sessionEpoch = 0;
  let pending: PendingCommand | null = null;
  const locked = computed(() => submitting.value || unresolved.value);
  const stale = computed(
    () =>
      mode.value !== 'create' &&
      mode.value !== 'view' &&
      baselineVersion.value !== detail.value?.version,
  );
  const qualified = computed(() => parseQuantity(form.qualifiedQuantity));
  const unqualified = computed(() => parseQuantity(form.unqualifiedQuantity));
  const inspected = computed(() =>
    qualified.value !== null && unqualified.value !== null
      ? qualified.value + unqualified.value
      : null,
  );
  const valid = computed(() => {
    if (locked.value || loading.value || error.value || stale.value || !read.isActive())
      return false;
    if (mode.value === 'reverse')
      return !!form.reason.trim() && detail.value?.acceptedQuantity === 0;
    if (mode.value !== 'create' && mode.value !== 'correct') return false;
    if (mode.value === 'create' && !step.value?.canCreate) return false;
    if (
      mode.value === 'correct' &&
      (!form.reason.trim() ||
        unqualified.value === null ||
        unqualified.value < (detail.value?.acceptedQuantity ?? 0))
    )
      return false;
    return (
      inspected.value !== null &&
      inspected.value > 0 &&
      inspected.value <= PRODUCTION_OUTPUT_QUANTITY_MAX &&
      !!form.scopeNote.trim() &&
      !!form.resultNote.trim() &&
      !!form.evidenceReference.trim() &&
      validDate(form.inspectedAt)
    );
  });
  async function loadStep(): Promise<void> {
    if (!visible.value || mode.value !== 'create' || !step.value || !read.isActive()) return;
    const stepId = step.value.stepId;
    const current = read.begin(
      () => visible.value && mode.value === 'create' && step.value?.stepId === stepId,
    );
    loading.value = true;
    error.value = '';
    try {
      const result = await processInspectionsApi.step(stepId, current.signal);
      if (!current.isCurrent()) return;
      if (result.stepId !== stepId) throw new Error('工序与当前登记对象不一致');
      step.value = result;
    } catch (failure) {
      if (current.isCurrent())
        error.value = failure instanceof Error ? failure.message : '工序加载失败';
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  }
  async function loadHistory(): Promise<void> {
    if (!visible.value || !targetId.value || !historyRead.isActive()) return;
    const id = targetId.value,
      current = historyRead.begin(() => visible.value && targetId.value === id);
    historyLoading.value = true;
    historyError.value = '';
    try {
      const result = await processInspectionsApi.records(
        id,
        { page: historyPage.value, pageSize: historyPageSize.value },
        current.signal,
      );
      if (!current.isCurrent()) return;
      if (result.items.some((row) => row.inspectionId !== id))
        throw new Error('检验历史与当前专检单不一致');
      records.value = result.items;
      historyTotal.value = result.total;
    } catch (failure) {
      if (current.isCurrent())
        historyError.value = failure instanceof Error ? failure.message : '检验历史加载失败';
    } finally {
      if (current.isCurrent()) historyLoading.value = false;
    }
  }
  async function loadDetail(): Promise<void> {
    if (!visible.value || !targetId.value || !read.isActive()) return;
    const id = targetId.value,
      current = read.begin(() => visible.value && targetId.value === id);
    loading.value = true;
    error.value = '';
    try {
      const result = await processInspectionsApi.detail(id, current.signal);
      if (!current.isCurrent()) return;
      if (result.id !== id) throw new Error('专检详情与当前对象不一致');
      detail.value = result;
    } catch (failure) {
      if (current.isCurrent())
        error.value = failure instanceof Error ? failure.message : '专检详情加载失败';
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  }
  async function refresh(): Promise<void> {
    if (mode.value === 'create') await loadStep();
    else await Promise.all([loadDetail(), loadHistory()]);
  }
  async function confirmDiscard(): Promise<boolean> {
    if (submitting.value) return false;
    if (mode.value === 'view' && !unresolved.value) return true;
    try {
      await RouteMessageBox.confirm(
        unresolved.value
          ? '提交结果尚未确认，请先核对专检历史。放弃后无法复用本次提交标识，重新提交可能重复登记。确认放弃？'
          : '存在未保存的填写，确认放弃本地输入？',
        '放弃本次填写',
        { type: 'warning' },
      );
      return true;
    } catch {
      return false;
    }
  }
  function resetIntent(): void {
    intent.reset();
    pending = null;
    unresolved.value = false;
    intentStatus.value = 'idle';
  }
  async function close(): Promise<boolean> {
    if (!visible.value) return true;
    if (!(await confirmDiscard())) return false;
    read.invalidate();
    historyRead.invalidate();
    resetIntent();
    visible.value = false;
    mode.value = 'view';
    return true;
  }
  function resetEditor(): void {
    detail.value = null;
    step.value = null;
    records.value = [];
    historyTotal.value = 0;
    historyPage.value = 1;
    error.value = '';
    historyError.value = '';
    Object.assign(form, emptyForm());
    baselineVersion.value = null;
    visible.value = true;
  }
  async function open(id: string, action?: 'correct' | 'reverse'): Promise<boolean> {
    if (visible.value && !(await close())) return false;
    resetEditor();
    targetId.value = id;
    mode.value = 'view';
    await refresh();
    if (!visible.value || targetId.value !== id || !read.isActive()) return false;
    if (action) edit(action);
    return true;
  }
  async function openCreate(context: ProcessInspectionStepSummary): Promise<boolean> {
    if (visible.value && !(await close())) return false;
    resetEditor();
    targetId.value = '';
    step.value = context;
    mode.value = 'create';
    await loadStep();
    return (
      visible.value &&
      mode.value === 'create' &&
      step.value?.stepId === context.stepId &&
      read.isActive()
    );
  }
  function edit(nextMode: 'correct' | 'reverse'): void {
    if (!detail.value || locked.value || loading.value || error.value || !read.isActive()) return;
    const record = detail.value.currentRecord;
    if (!record || (nextMode === 'reverse' && detail.value.acceptedQuantity > 0)) return;
    mode.value = nextMode;
    baselineVersion.value = detail.value.version;
    Object.assign(form, emptyForm(), {
      inspectionMethod: record.inspectionMethod,
      qualifiedQuantity: String(record.qualifiedQuantity),
      unqualifiedQuantity: String(record.unqualifiedQuantity),
      scopeNote: record.scopeNote,
      inspectedAt: toBeijingDateTimeInputValue(record.inspectedAt),
      resultNote: record.resultNote ?? '',
      evidenceReference: record.evidenceReference ?? '',
    });
  }
  async function cancelEdit(): Promise<void> {
    if (!(await confirmDiscard())) return;
    resetIntent();
    mode.value = 'view';
    await refresh();
  }
  function recordBody(): RecordProcessInspectionPayload {
    return {
      inspectionMethod: form.inspectionMethod,
      qualifiedQuantity: qualified.value ?? 0,
      unqualifiedQuantity: unqualified.value ?? 0,
      scopeNote: form.scopeNote.trim(),
      inspectedAt: fromBeijingDateTimeInputValue(form.inspectedAt),
      resultNote: form.resultNote.trim(),
      evidenceReference: form.evidenceReference.trim(),
    };
  }
  async function run(): Promise<void> {
    if (submitting.value || !pending || !read.isActive()) return;
    const command = pending,
      expectedSessionEpoch = sessionEpoch;
    submitting.value = true;
    try {
      const result = await intent.execute(
        {
          intentType: `quality.process-inspection.${command.mode}`,
          params: command.mode === 'create' ? {} : { id: command.id },
          query: {},
          body: command.body,
        },
        async (key) => {
          const response =
            command.mode === 'create'
              ? await processInspectionsApi.create(command.body, key)
              : command.mode === 'correct'
                ? await processInspectionsApi.correct(command.id, command.body, key)
                : await processInspectionsApi.reverse(command.id, command.body, key);
          if (
            !response?.inspectionId ||
            !response.recordId ||
            (command.mode === 'create'
              ? response.version !== 0
              : response.inspectionId !== command.id ||
                response.version !== command.body.version + 1)
          )
            throw new RequestError('专检提交结果不完整，请核对历史后原样重试', 502);
          return response;
        },
      );
      if (sessionEpoch !== expectedSessionEpoch) return;
      resetIntent();
      mode.value = 'view';
      visible.value = false;
      read.invalidate();
      historyRead.invalidate();
      EMessage.success('专检记录已保存');
      changed(result.inspectionId, command.mode === 'create');
    } catch (failure) {
      if (sessionEpoch !== expectedSessionEpoch) return;
      intentStatus.value = intent.getStatus();
      unresolved.value = intentStatus.value !== 'idle';
      if (!unresolved.value) pending = null;
      EMessage.error(failure);
      if (failure instanceof RequestError && failure.code === 'CONCURRENT_MODIFICATION')
        await loadDetail();
    } finally {
      if (sessionEpoch === expectedSessionEpoch) submitting.value = false;
    }
  }
  async function submit(): Promise<void> {
    if (!valid.value) return;
    const current = detail.value;
    let command: PendingCommand;
    if (mode.value === 'create' && step.value)
      command = {
        mode: 'create',
        body: {
          ...recordBody(),
          batchId: step.value.batchId,
          stepId: step.value.stepId,
        },
      };
    else if (mode.value === 'correct' && current)
      command = {
        mode: 'correct',
        id: current.id,
        body: { ...recordBody(), version: current.version, reason: form.reason.trim() },
      };
    else if (mode.value === 'reverse' && current)
      command = {
        mode: 'reverse',
        id: current.id,
        body: { version: current.version, reason: form.reason.trim() },
      };
    else return;
    const message =
      command.mode === 'reverse'
        ? '确认冲销本次检查的当前结果？历史保留，本次未处理量归零，工序仍可继续登记新的检查。'
        : `本次检查合格 ${command.body.qualifiedQuantity}，不合格 ${command.body.unqualifiedQuantity}。${command.mode === 'correct' ? '原结果将冲销并追加替代结果。' : '请确认不合格实物未在其他检查中重复登记。'}检查结果不自动修改报工。`;
    try {
      await RouteMessageBox.confirm(message, '确认提交', { type: 'warning' });
    } catch {
      return;
    }
    if (
      !valid.value ||
      mode.value !== command.mode ||
      (current && (current.id !== detail.value?.id || current.version !== detail.value?.version)) ||
      (command.mode === 'create' && command.body.stepId !== step.value?.stepId)
    )
      return;
    pending = command;
    await run();
  }
  async function changeHistoryPage(page: number): Promise<void> {
    historyPage.value = page;
    await loadHistory();
  }
  async function changeHistoryPageSize(size: number): Promise<void> {
    historyPageSize.value = size;
    historyPage.value = 1;
    await loadHistory();
  }
  onScopeDispose(useTabsStore().registerCloseGuard('quality-process-inspections', close));
  const auth = useAuthStore();
  watch(
    () => auth.session?.user.id,
    () => {
      sessionEpoch += 1;
      resetIntent();
      intent = useIdempotentIntent('工序专检记录');
      submitting.value = false;
      visible.value = false;
      read.invalidate();
      historyRead.invalidate();
    },
    { flush: 'sync' },
  );
  return {
    visible,
    mode,
    detail,
    loading,
    error,
    form,
    locked,
    stale,
    valid,
    inspected,
    submitting,
    unresolved,
    intentStatus,
    records,
    historyPage,
    historyPageSize,
    historyTotal,
    historyLoading,
    historyError,
    step,
    open,
    openCreate,
    close,
    cancelEdit,
    submit,
    retry: run,
    refresh,
    changeHistoryPage,
    changeHistoryPageSize,
  };
}
