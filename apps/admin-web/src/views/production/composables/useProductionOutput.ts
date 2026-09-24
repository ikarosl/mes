import { computed, onActivated, reactive, ref, watch } from 'vue';
import type {
  ProductionOutputDetail,
  ProductionOutputDraft,
  ProductionOutputQuantities,
  ProductionOutputInspection,
} from '@company/contracts';
import { PRODUCTION_OUTPUT_QUANTITY_MAX } from '@company/constants';
import { productionApi } from '../../../api/production';
import { useLatestRequest } from '../../../composables/requests/useLatestRequest';
import {
  stableClientSignature,
  useIdempotentIntent,
} from '../../../composables/idempotency/useIdempotentIntent';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { inspectionQuantities } from '../../quality/finished-inspection';

const emptyDraft = (): ProductionOutputDraft => ({
  availableQuantity: 0,
  extraQuantity: 0,
  additionalScrapQuantity: 0,
  reason: '',
  materialReviewNote: '',
  inspectionRecordId: null,
});
const signature = (body: unknown) =>
  stableClientSignature({ intentType: 'production.output', params: {}, query: {}, body });
const quantitiesValid = (value: ProductionOutputQuantities | null | undefined, plan: number) =>
  !!value &&
  [value.availableQuantity, value.extraQuantity, value.additionalScrapQuantity].every(
    (number) =>
      Number.isSafeInteger(number) && number >= 0 && number <= PRODUCTION_OUTPUT_QUANTITY_MAX,
  ) &&
  value.availableQuantity <= plan;

function validateDetail(value: ProductionOutputDetail, batchId: string) {
  const fail = () => {
    throw new Error('产出清单响应格式异常，请刷新重试');
  };
  if (
    !value ||
    typeof value !== 'object' ||
    value.batchId !== batchId ||
    !value.check ||
    value.check.batchId !== batchId ||
    !Number.isInteger(value.version) ||
    !Array.isArray(value.inspections) ||
    !Array.isArray(value.revisions) ||
    !Array.isArray(value.blockers) ||
    !value.receipts ||
    typeof value.submissionToken !== 'string' ||
    typeof value.canEdit !== 'boolean' ||
    !Array.isArray(value.check.materials) ||
    !Array.isArray(value.check.lossRecords)
  )
    fail();
  const plan = Number(value.check.plannedQuantity);
  const validInspection = (record: ProductionOutputInspection) => {
    const quantities = record && inspectionQuantities(record);
    return (
      record &&
      quantities &&
      typeof record.id === 'string' &&
      quantitiesValid(record.declared, plan) &&
      quantities.qualifiedQuantity === record.qualifiedQuantity &&
      quantities.releasedQuantity === record.releasedQuantity &&
      typeof record.resultNote === 'string'
    );
  };
  if (
    (value.draft !== null &&
      (!value.draft ||
        !quantitiesValid(value.draft, plan) ||
        typeof value.draft.reason !== 'string' ||
        typeof value.draft.materialReviewNote !== 'string')) ||
    !value.inspections.every(validInspection) ||
    !value.revisions.every(
      (revision) =>
        revision &&
        revision.snapshot?.kind === 'batch_closeout' &&
        quantitiesValid(
          revision.snapshot.output,
          Number(revision.snapshot.check?.plannedQuantity),
        ) &&
        validInspection(revision.snapshot.inspection) &&
        Array.isArray(revision.snapshot.check?.materials) &&
        Array.isArray(revision.snapshot.check.lossRecords) &&
        Array.isArray(revision.snapshot.actions),
    )
  )
    fail();
}

export function useProductionOutput(
  props: { visible: boolean; batchId: string | null },
  changed: () => void,
  closed: () => void,
) {
  const detail = ref<ProductionOutputDetail | null>(null);
  const draft = reactive(emptyDraft());
  const loading = ref(false),
    submitting = ref(false),
    error = ref(''),
    unresolved = ref(false);
  const lastSuccess = ref(''),
    loadedVersion = ref<number | null>(null);
  const request = useLatestRequest(),
    intent = useIdempotentIntent();
  let pending: {
    batchId: string;
    name: string;
    body: object;
    send: (key: string) => Promise<unknown>;
    message: string;
  } | null = null;
  const dirty = computed(() => signature(draft) !== signature(detail.value?.draft ?? emptyDraft()));
  const busy = computed(() => loading.value || submitting.value);
  const stale = computed(() => dirty.value && loadedVersion.value !== detail.value?.version);
  const locked = computed(
    () =>
      busy.value ||
      unresolved.value ||
      Boolean(error.value) ||
      !detail.value?.canEdit ||
      stale.value,
  );
  const valid = computed(
    () =>
      !!detail.value &&
      quantitiesValid(draft, Number(detail.value.check.plannedQuantity)) &&
      !!draft.reason.trim() &&
      !!draft.materialReviewNote.trim(),
  );
  const canSubmit = computed(() => detail.value?.canSubmit && !locked.value && !dirty.value);
  const selectedInspection = computed(
    () => detail.value?.inspections.find((row) => row.id === draft.inspectionRecordId) ?? null,
  );
  const latestInspection = computed(
    () =>
      detail.value?.inspections.find((row) => row.id === detail.value?.latestInspectionId) ?? null,
  );
  const inspectionReleased = computed(
    () => selectedInspection.value?.releaseDecision === 'released',
  );
  const quantityAdvice = computed(() => {
    const inspection = selectedInspection.value;
    if (!inspection || !inspectionReleased.value) return '';
    const total = draft.availableQuantity + draft.extraQuantity;
    const received =
      Number(detail.value?.receipts.productionReceivedQuantity ?? 0) +
      Number(detail.value?.receipts.extraReceivedQuantity ?? 0);
    if (received > 0)
      return `本次检验建议量 ${inspection.releasedQuantity} 件；清单累计可入库量 ${total} 件，历史已入库 ${received} 件。请按本次送检范围核对剩余产出，勿将本次建议直接当作累计数量。数量差异不阻断送审。`;
    if (total === inspection.releasedQuantity) return '';
    return `清单可入库量 ${total} 件，本次检验建议量 ${inspection.releasedQuantity} 件，相差 ${total - inspection.releasedQuantity} 件。请核对实际产出与报废；数量差异不阻断送审，由负责人审批确认。`;
  });

  async function load(resetDraft = false) {
    if (!props.visible || !props.batchId) return;
    const batchId = props.batchId,
      current = request.begin(() => props.visible && props.batchId === batchId);
    const preserve = !resetDraft && dirty.value;
    loading.value = true;
    error.value = '';
    try {
      const result = await productionApi.getProductionOutput(batchId);
      if (!current()) return;
      validateDetail(result, batchId);
      detail.value = result;
      if (!preserve) {
        Object.assign(draft, result.draft ?? emptyDraft());
        loadedVersion.value = result.version;
      }
    } catch (failure) {
      if (current()) error.value = failure instanceof Error ? failure.message : '产出清单加载失败';
    } finally {
      if (current()) loading.value = false;
    }
  }
  async function reloadDraft() {
    if (dirty.value) {
      try {
        await RouteMessageBox.confirm(
          '重新加载会放弃当前未保存的产出填写，确认继续？',
          '重新加载清单',
          { type: 'warning' },
        );
      } catch {
        return;
      }
    }
    await load(true);
  }
  async function run(
    name: string,
    body: object,
    send: (key: string) => Promise<unknown>,
    message: string,
  ) {
    if (busy.value || !props.batchId || (unresolved.value && !pending)) return;
    pending ??= { batchId: props.batchId, name, body, send, message };
    const command = pending;
    submitting.value = true;
    try {
      await intent.execute(
        {
          intentType: command.name,
          params: { batchId: command.batchId },
          query: {},
          body: command.body,
        },
        command.send,
      );
      pending = null;
      unresolved.value = false;
      if (props.batchId === command.batchId && props.visible) {
        lastSuccess.value = command.message;
        EMessage.success(command.message);
        changed();
        await load(true);
      }
    } catch (failure) {
      unresolved.value = intent.getStatus() !== 'idle';
      if (!unresolved.value) pending = null;
      EMessage.error(failure);
    } finally {
      submitting.value = false;
    }
  }
  async function save() {
    if (!detail.value || !props.batchId || locked.value || !valid.value || !dirty.value) return;
    const batchId = props.batchId,
      body = {
        ...draft,
        reason: draft.reason.trim(),
        materialReviewNote: draft.materialReviewNote.trim(),
        version: detail.value.version,
      };
    await run(
      'production.output.save',
      body,
      (key) => productionApi.saveProductionOutput(batchId, body, key),
      '产出草稿已保存；质检记录与库存均未改写',
    );
  }
  async function submit() {
    if (!canSubmit.value || !detail.value || !props.batchId) return;
    const batchId = props.batchId,
      body = { version: detail.value.version, submissionToken: detail.value.submissionToken };
    try {
      await RouteMessageBox.confirm(
        '将按当前草稿和引用的质检记录提交工单负责人审批。提交后数量锁定，审批通过后形成入库依据。',
        '提交结案审批',
        { confirmButtonText: '提交审批' },
      );
    } catch {
      return;
    }
    if (props.batchId !== batchId || !props.visible || detail.value.version !== body.version)
      return;
    await run(
      'production.output.submit',
      body,
      (key) => productionApi.submitProductionOutput(batchId, body, key),
      '结案审批已提交，尚未确认成品入库',
    );
  }
  async function beginCorrection() {
    if (
      !detail.value?.canBeginCorrection ||
      !detail.value.currentRevisionId ||
      !props.batchId ||
      busy.value ||
      unresolved.value ||
      error.value
    )
      return;
    const batchId = props.batchId,
      version = detail.value.version,
      currentRevisionId = detail.value.currentRevisionId;
    let reason: string;
    try {
      const answer = await RouteMessageBox.prompt(
        '原批准清单保留；更正送审后，数量变化的类别暂停入库。请说明更正原因。',
        '发起清单更正',
        {
          inputType: 'textarea',
          inputValidator: (value) =>
            (!!value?.trim() && value.trim().length <= 5000) || '请填写不超过 5000 字的更正原因',
          confirmButtonText: '开始更正',
        },
      );
      reason = answer.value.trim();
    } catch {
      return;
    }
    if (props.batchId !== batchId || !props.visible || detail.value.version !== version) return;
    const body = { version, currentRevisionId, reason };
    await run(
      'production.output.correct',
      body,
      (key) => productionApi.beginProductionOutputCorrection(batchId, body, key),
      '已建立更正草稿；原批准记录继续保留',
    );
  }
  async function cancelCorrection() {
    if (
      !detail.value?.canCancelCorrection ||
      !props.batchId ||
      busy.value ||
      unresolved.value ||
      error.value
    )
      return;
    const batchId = props.batchId,
      version = detail.value.version;
    try {
      await RouteMessageBox.confirm(
        '取消本次更正后，继续使用原批准清单；已经留存的质检记录不会删除。',
        '取消清单更正',
        { type: 'warning', confirmButtonText: '取消更正' },
      );
    } catch {
      return;
    }
    if (props.batchId !== batchId || !props.visible || detail.value.version !== version) return;
    await run(
      'production.output.cancel-correction',
      { version },
      (key) => productionApi.cancelProductionOutputCorrection(batchId, version, key),
      '清单更正已取消，继续使用原批准清单',
    );
  }
  async function close() {
    if (submitting.value) return;
    if (unresolved.value || dirty.value) {
      try {
        await RouteMessageBox.confirm(
          unresolved.value
            ? '提交结果尚未确认，请先核对。关闭将放弃本地重试标识，确认关闭？'
            : '存在未保存输入，确认放弃并关闭？',
          '关闭产出清单',
          { type: 'warning' },
        );
      } catch {
        return;
      }
    }
    request.invalidate();
    loading.value = false;
    intent.reset();
    pending = null;
    unresolved.value = false;
    closed();
  }
  async function retry() {
    if (pending) await run(pending.name, pending.body, pending.send, pending.message);
  }
  watch(
    () => [props.visible, props.batchId] as const,
    ([visible]) => {
      request.invalidate();
      loading.value = false;
      if (!visible) return;
      detail.value = null;
      loadedVersion.value = null;
      error.value = '';
      lastSuccess.value = '';
      Object.assign(draft, emptyDraft());
      void load(true);
    },
    { immediate: true },
  );
  let activated = false;
  onActivated(() => {
    if (activated && !submitting.value && !unresolved.value) void load();
    activated = true;
  });
  return {
    detail,
    draft,
    loading,
    submitting,
    error,
    unresolved,
    lastSuccess,
    dirty,
    busy,
    stale,
    locked,
    valid,
    canSubmit,
    selectedInspection,
    latestInspection,
    inspectionReleased,
    quantityAdvice,
    load,
    reloadDraft,
    save,
    submit,
    beginCorrection,
    cancelCorrection,
    close,
    retry,
  };
}
