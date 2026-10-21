import { computed, reactive, ref, watch } from 'vue';
import { PRODUCTION_OUTPUT_QUANTITY_MAX } from '@company/constants';
import type { AcceptProcessInspectionPayload, ProcessInspectionEntry } from '@company/contracts';
import { RequestError } from '@company/request';
import { productionProcessInspectionsApi } from '../../../api/production-process-inspections';
import { useIdempotentIntent } from '../../../composables/idempotency/useIdempotentIntent';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { useAuthStore } from '../../../stores/auth';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { useProductionInspectionHistory } from './useProductionInspectionHistory';

interface InspectionAcceptanceContext {
  batchId: string;
  stepId: string;
  label: string;
}
interface InspectionAcceptanceOptions {
  isContextReady: (batchId: string, stepId: string) => boolean;
  changed: (batchId: string) => Promise<void>;
}

/** 生产侧独立持有处理依据和写意图，列表刷新不替换填写开始时的版本。 */
export function useProductionInspectionAcceptance(options: InspectionAcceptanceOptions) {
  const visible = ref(false),
    context = ref<InspectionAcceptanceContext | null>(null);
  const history = useProductionInspectionHistory(() => (visible.value ? context.value : null));
  const entries = ref<ProcessInspectionEntry[]>([]),
    listLoading = ref(false),
    listError = ref(''),
    page = ref(1),
    pageSize = ref(10),
    total = ref(0);
  const selectedId = ref(''),
    detail = ref<ProcessInspectionEntry | null>(null),
    detailLoading = ref(false),
    detailError = ref(''),
    baselineVersion = ref<number | null>(null);
  const form = reactive({ quantity: '', remark: '' });
  const submitting = ref(false),
    intentStatus = ref('idle');
  const listRead = useLatestReadRequest(() => {
    listLoading.value = false;
  });
  const detailRead = useLatestReadRequest(() => {
    detailLoading.value = false;
  });
  let intent = useIdempotentIntent('生产异常处置记录');
  const auth = useAuthStore();
  let sessionEpoch = 0;
  let pending: {
    context: InspectionAcceptanceContext;
    body: AcceptProcessInspectionPayload;
  } | null = null;
  const unresolved = computed(() => intentStatus.value !== 'idle');
  const locked = computed(() => submitting.value || unresolved.value);
  const stale = computed(
    () => detail.value !== null && detail.value.version !== baselineVersion.value,
  );
  const contextReady = computed(
    () => !!context.value && options.isContextReady(context.value.batchId, context.value.stepId),
  );
  const quantity = computed(() => {
    const raw = form.quantity.trim(),
      value = Number(raw);
    return /^\d+$/.test(raw) &&
      Number.isSafeInteger(value) &&
      value > 0 &&
      value <= PRODUCTION_OUTPUT_QUANTITY_MAX
      ? value
      : null;
  });
  const canSubmit = computed(
    () =>
      visible.value &&
      contextReady.value &&
      detailRead.isActive() &&
      !locked.value &&
      !detailLoading.value &&
      !detailError.value &&
      !stale.value &&
      detail.value?.canAccept === true &&
      !!detail.value.currentRecord &&
      quantity.value !== null &&
      quantity.value <= detail.value.pendingQuantity,
  );
  const matches = (target: InspectionAcceptanceContext): boolean =>
    visible.value &&
    context.value?.batchId === target.batchId &&
    context.value.stepId === target.stepId;

  function setQuantity(value: string): void {
    if (!locked.value) form.quantity = value;
  }
  function setRemark(value: string): void {
    if (!locked.value) form.remark = value;
  }

  async function loadEntries(): Promise<void> {
    if (!visible.value || !context.value || !listRead.isActive()) return;
    const target = context.value,
      current = listRead.begin(() => matches(target));
    listLoading.value = true;
    listError.value = '';
    try {
      let result = await productionProcessInspectionsApi.list(
        target.batchId,
        target.stepId,
        { page: page.value, pageSize: pageSize.value },
        current.signal,
      );
      if (!current.isCurrent()) return;
      const lastPage = Math.max(1, Math.ceil(result.total / pageSize.value));
      if (page.value > lastPage) {
        page.value = lastPage;
        result = await productionProcessInspectionsApi.list(
          target.batchId,
          target.stepId,
          { page: lastPage, pageSize: pageSize.value },
          current.signal,
        );
      }
      if (!current.isCurrent()) return;
      if (
        result.items.some(
          (item) => item.batchId !== target.batchId || item.stepId !== target.stepId,
        )
      )
        throw new Error('检查明细与当前任务工序不一致');
      entries.value = result.items;
      total.value = result.total;
    } catch (error) {
      if (current.isCurrent())
        listError.value = error instanceof Error ? error.message : '待处理检查加载失败';
    } finally {
      if (current.isCurrent()) listLoading.value = false;
    }
  }
  async function loadDetail(initialize = false): Promise<void> {
    if (!visible.value || !context.value || !selectedId.value || !detailRead.isActive()) return;
    const target = context.value,
      id = selectedId.value;
    const current = detailRead.begin(() => matches(target) && selectedId.value === id);
    detailLoading.value = true;
    detailError.value = '';
    try {
      const result = await productionProcessInspectionsApi.detail(
        target.batchId,
        target.stepId,
        id,
        current.signal,
      );
      if (!current.isCurrent()) return;
      if (result.id !== id || result.batchId !== target.batchId || result.stepId !== target.stepId)
        throw new Error('检查依据与当前处理对象不一致');
      detail.value = result;
      if (initialize || baselineVersion.value === null) baselineVersion.value = result.version;
    } catch (error) {
      if (current.isCurrent())
        detailError.value = error instanceof Error ? error.message : '处理依据加载失败';
    } finally {
      if (current.isCurrent()) detailLoading.value = false;
    }
  }
  async function refresh(): Promise<void> {
    await Promise.all([loadEntries(), loadDetail(), history.load()]);
  }
  function resetIntent(): void {
    intent.reset();
    pending = null;
    intentStatus.value = 'idle';
  }
  function clearSelection(): void {
    detailRead.invalidate();
    selectedId.value = '';
    detail.value = null;
    baselineVersion.value = null;
    detailError.value = '';
    form.quantity = '';
    form.remark = '';
    resetIntent();
  }
  async function discard(): Promise<boolean> {
    if (submitting.value) return false;
    if (!unresolved.value && !form.quantity && !form.remark) return true;
    try {
      await RouteMessageBox.confirm(
        unresolved.value
          ? '处理结果尚未确认，请先核对生产异常处置记录。放弃后无法复用本次提交标识，重新处理可能重复生成待办。确认放弃？'
          : '存在未保存的处理数量或说明，确认放弃本地填写？',
        '放弃本次处理填写',
        { type: 'warning' },
      );
      return true;
    } catch {
      return false;
    }
  }
  async function close(): Promise<boolean> {
    if (!visible.value) return true;
    if (!(await discard())) return false;
    visible.value = false;
    listRead.invalidate();
    history.reset();
    clearSelection();
    return true;
  }
  async function select(id: string): Promise<void> {
    const target = context.value;
    if (!target || !detailRead.isActive() || !contextReady.value || !(await discard())) return;
    if (!detailRead.isActive() || !matches(target)) return;
    clearSelection();
    selectedId.value = id;
    await loadDetail(true);
  }
  async function open(target: InspectionAcceptanceContext): Promise<boolean> {
    if (!listRead.isActive() || !(await close())) return false;
    context.value = target;
    entries.value = [];
    page.value = 1;
    total.value = 0;
    listError.value = '';
    visible.value = true;
    await Promise.all([loadEntries(), history.load()]);
    return matches(target) && listRead.isActive();
  }
  async function run(): Promise<void> {
    if (submitting.value || !pending || !detailRead.isActive() || !contextReady.value) return;
    const command = pending,
      expectedSessionEpoch = sessionEpoch;
    submitting.value = true;
    try {
      await intent.execute(
        {
          intentType: 'production.process-inspection.accept',
          params: { batchId: command.context.batchId, stepId: command.context.stepId },
          query: {},
          body: command.body,
        },
        async (key) => {
          const response = await productionProcessInspectionsApi.accept(
            command.context.batchId,
            command.context.stepId,
            command.body,
            key,
          );
          if (
            !response?.dispositionId ||
            response.productionBatchId !== command.context.batchId ||
            response.stepRecordId !== command.context.stepId ||
            response.processInspectionId !== command.body.inspectionId ||
            response.processInspectionRecordId !== command.body.recordId ||
            Number(response.sourceAbnormalQuantity) !== command.body.quantity
          )
            throw new RequestError('处理结果不完整，请核对生产异常处置记录后原样重试', 502);
        },
      );
      if (sessionEpoch !== expectedSessionEpoch) return;
      clearSelection();
      EMessage.success('已处理并生成异常处置待办，可在当前工序继续办理返工或报废');
      if (detailRead.isActive() && matches(command.context)) {
        history.page = 1;
        await Promise.all([
          loadEntries(),
          history.load(),
          options.changed(command.context.batchId),
        ]);
      }
    } catch (error) {
      if (sessionEpoch !== expectedSessionEpoch) return;
      intentStatus.value = intent.getStatus();
      if (!unresolved.value) pending = null;
      EMessage.error(error);
      if (error instanceof RequestError && error.code === 'CONCURRENT_MODIFICATION')
        await loadDetail();
    } finally {
      if (sessionEpoch === expectedSessionEpoch) submitting.value = false;
    }
  }
  async function submit(): Promise<void> {
    if (
      !canSubmit.value ||
      !context.value ||
      !detail.value?.currentRecord ||
      quantity.value === null
    )
      return;
    const target = context.value,
      selected = detail.value;
    const body: AcceptProcessInspectionPayload = {
      inspectionId: selected.id,
      recordId: selected.currentRecord!.id,
      version: selected.version,
      quantity: quantity.value,
      remark: form.remark.trim() || undefined,
    };
    try {
      await RouteMessageBox.confirm(
        `${target.label}：确认现场存在 ${body.quantity} ${selected.unit} 不合格，并生成异常处置待办？处理后该次检查的不合格数量不能低于累计已处理量。`,
        '确认处理不合格',
        { type: 'warning' },
      );
    } catch {
      return;
    }
    if (
      !canSubmit.value ||
      !matches(target) ||
      detail.value?.id !== body.inspectionId ||
      detail.value.version !== body.version ||
      quantity.value !== body.quantity ||
      (form.remark.trim() || undefined) !== body.remark
    )
      return;
    pending = { context: { ...target }, body };
    await run();
  }
  async function changePage(value: number): Promise<void> {
    page.value = value;
    await loadEntries();
  }
  async function changePageSize(value: number): Promise<void> {
    pageSize.value = value;
    await changePage(1);
  }
  watch(
    () => auth.session?.user.id,
    () => {
      sessionEpoch += 1;
      visible.value = false;
      context.value = null;
      entries.value = [];
      listRead.invalidate();
      history.reset();
      clearSelection();
      intent = useIdempotentIntent('生产异常处置记录');
      submitting.value = false;
    },
    { flush: 'sync' },
  );
  return reactive({
    visible,
    context,
    history,
    entries,
    listLoading,
    listError,
    page,
    pageSize,
    total,
    selectedId,
    detail,
    detailLoading,
    detailError,
    form,
    submitting,
    unresolved,
    intentStatus,
    locked,
    stale,
    contextReady,
    canSubmit,
    setQuantity,
    setRemark,
    open,
    close,
    select,
    refresh,
    submit,
    retry: run,
    changePage,
    changePageSize,
  });
}
