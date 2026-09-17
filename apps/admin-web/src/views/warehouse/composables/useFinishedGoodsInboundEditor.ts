import { computed, onActivated, reactive, ref, watch } from 'vue';
import type {
  FinishedGoodsInboundCandidate,
  FinishedGoodsInboundCommandResult,
  FinishedGoodsInboundOrderDetail,
  FinishedGoodsInboundSource,
} from '@company/contracts';
import { productionApi } from '../../../api/production';
import { useLatestRequest } from '../../../composables/requests/useLatestRequest';
import {
  useIdempotentIntent,
  stableClientSignature,
} from '../../../composables/idempotency/useIdempotentIntent';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
const signature = (body: object) =>
  stableClientSignature({ intentType: 'finished-inbound.draft', params: {}, query: {}, body });
export function useFinishedGoodsInboundEditor(
  props: { visible: boolean; inboundId: string | null; sourceType: FinishedGoodsInboundSource },
  changed: () => void,
  closed: () => void,
) {
  const detail = ref<FinishedGoodsInboundOrderDetail | null>(null),
    targetId = ref<string | null>(null);
  const form = reactive({ outputRevisionId: '', batchCode: '', remark: '' });
  const savedForm = ref(signature(form)),
    loadedVersion = ref<number | null>(null);
  const candidate = ref<FinishedGoodsInboundCandidate | null>(null),
    candidates = ref<FinishedGoodsInboundCandidate[]>([]);
  const keyword = ref(''),
    candidatePage = ref(1),
    candidateTotal = ref(0),
    candidateLoading = ref(false),
    candidateError = ref('');
  const loading = ref(false),
    submitting = ref(false),
    unresolved = ref(false),
    error = ref(''),
    lastSuccess = ref('');
  const detailRequest = useLatestRequest(),
    candidateRequest = useLatestRequest(),
    intent = useIdempotentIntent();
  let pending: {
    name: string;
    body: object;
    send: (key: string) => Promise<FinishedGoodsInboundCommandResult>;
    message: string;
    id: string | null;
  } | null = null;
  const dirty = computed(() => signature(form) !== savedForm.value);
  const busy = computed(() => loading.value || submitting.value);
  const sourceType = computed(() => detail.value?.sourceType ?? props.sourceType);
  const stale = computed(
    () => !!detail.value && loadedVersion.value !== detail.value.version && dirty.value,
  );
  const locked = computed(
    () =>
      busy.value ||
      unresolved.value ||
      !!error.value ||
      stale.value ||
      (!!detail.value && !detail.value.canEdit),
  );
  const canSave = computed(
    () =>
      !locked.value &&
      (!!targetId.value || (!candidateLoading.value && !candidateError.value)) &&
      !!form.batchCode.trim() &&
      form.batchCode.trim().length <= 100 &&
      !!form.outputRevisionId &&
      (detail.value
        ? dirty.value && form.outputRevisionId === detail.value.currentOutputRevisionId
        : !!candidate.value?.canCreate),
  );
  const adoptedLatest = computed(
    () =>
      !!detail.value &&
      form.outputRevisionId === detail.value.currentOutputRevisionId &&
      form.outputRevisionId !== detail.value.outputRevisionId,
  );
  const expectedQuantity = computed(() => {
    if (!detail.value) return candidate.value?.approvedQuantity ?? '0';
    const revision = adoptedLatest.value
      ? detail.value.currentApprovedOutput
      : detail.value.approvedOutput;
    return sourceType.value === 'self_made' ? revision.availableQuantity : revision.extraQuantity;
  });
  const currentApprovedQuantity = computed(() =>
    !detail.value
      ? '0'
      : sourceType.value === 'self_made'
        ? detail.value.currentApprovedOutput.availableQuantity
        : detail.value.currentApprovedOutput.extraQuantity,
  );
  const canConfirm = computed(
    () =>
      !!detail.value?.canConfirm &&
      !busy.value &&
      !dirty.value &&
      !error.value &&
      !unresolved.value,
  );

  async function loadCandidates() {
    if (!props.visible || targetId.value) return;
    const selectedSource = props.sourceType,
      current = candidateRequest.begin(
        () => props.visible && !targetId.value && props.sourceType === selectedSource,
      );
    candidateLoading.value = true;
    candidateError.value = '';
    try {
      const result = await productionApi.finishedGoodsInboundCandidates({
        sourceType: selectedSource,
        keyword: keyword.value.trim() || undefined,
        page: candidatePage.value,
        pageSize: 10,
      });
      if (current()) {
        if (!result || !Array.isArray(result.items)) throw new Error('任务候选响应异常');
        candidates.value = result.items;
        candidateTotal.value = result.total;
        const refreshed = result.items.find(
          (row) => row.productionBatchId === candidate.value?.productionBatchId,
        );
        if (
          refreshed &&
          candidate.value &&
          (refreshed.outputRevisionId !== candidate.value.outputRevisionId || !refreshed.canCreate)
        ) {
          candidate.value = null;
          form.outputRevisionId = '';
          EMessage.warning('已选任务的入库依据或资格发生变化，请重新选择');
        }
      }
    } catch (failure) {
      if (current()) {
        candidateError.value = '任务候选加载失败，请刷新后再选择';
        EMessage.error(failure);
      }
    } finally {
      if (current()) candidateLoading.value = false;
    }
  }
  function searchCandidates() {
    candidatePage.value = 1;
    return loadCandidates();
  }
  function changeCandidatePage(page: number) {
    candidatePage.value = page;
    return loadCandidates();
  }
  function selectCandidate(row: FinishedGoodsInboundCandidate) {
    if (
      !row.canCreate ||
      candidateLoading.value ||
      candidateError.value ||
      submitting.value ||
      unresolved.value
    )
      return;
    candidate.value = row;
    form.outputRevisionId = row.outputRevisionId;
  }
  async function loadDetail(resetDraft = false) {
    if (!props.visible || !targetId.value) return;
    const id = targetId.value,
      current = detailRequest.begin(() => props.visible && targetId.value === id),
      preserve = !resetDraft && dirty.value;
    loading.value = true;
    error.value = '';
    try {
      const result = await productionApi.getFinishedGoodsInbound(id);
      if (!current()) return;
      if (
        !result ||
        result.inboundId !== id ||
        !result.approvedOutput?.snapshot?.inspection ||
        !result.currentApprovedOutput?.snapshot?.inspection ||
        !Array.isArray(result.approvedOutput.snapshot.actions) ||
        !Array.isArray(result.approvedOutput.snapshot.check?.materials) ||
        !Array.isArray(result.currentApprovedOutput.snapshot.actions) ||
        !Array.isArray(result.currentApprovedOutput.snapshot.check?.materials) ||
        !Array.isArray(result.blockers)
      )
        throw new Error('入库单详情响应异常，请刷新重试');
      detail.value = result;
      if (!preserve) {
        Object.assign(form, {
          outputRevisionId: result.outputRevisionId,
          batchCode: result.batchCode,
          remark: result.remark ?? '',
        });
        savedForm.value = signature(form);
        loadedVersion.value = result.version;
      }
    } catch (failure) {
      if (current()) {
        error.value = failure instanceof Error ? failure.message : '入库单加载失败';
        EMessage.error(failure);
      }
    } finally {
      if (current()) loading.value = false;
    }
  }
  async function refresh() {
    if (targetId.value) await loadDetail();
    else await loadCandidates();
  }
  async function reloadDraft() {
    if (dirty.value) {
      try {
        await RouteMessageBox.confirm(
          '将放弃未保存的草稿内容，重新读取服务端单据。',
          '重新加载草稿',
          { type: 'warning' },
        );
      } catch {
        return;
      }
    }
    await loadDetail(true);
  }
  async function run(
    name: string,
    body: object,
    send: (key: string) => Promise<FinishedGoodsInboundCommandResult>,
    message: string,
  ) {
    if (busy.value || (unresolved.value && !pending)) return;
    pending ??= { name, body, send, message, id: targetId.value };
    const command = pending;
    submitting.value = true;
    try {
      const result = await intent.execute(
        {
          intentType: command.name,
          params: { inboundId: command.id },
          query: {},
          body: command.body,
        },
        command.send,
      );
      pending = null;
      unresolved.value = false;
      if (props.visible && targetId.value === command.id) {
        targetId.value = result.inboundId;
        lastSuccess.value = command.message;
        EMessage.success(command.message);
        changed();
        await loadDetail(true);
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
    if (!canSave.value || Number(expectedQuantity.value) <= 0) return;
    if (!targetId.value) {
      if (!candidate.value || candidateError.value) return;
      const body = {
        productionBatchId: candidate.value.productionBatchId,
        sourceType: props.sourceType,
        outputRevisionId: candidate.value.outputRevisionId,
        batchCode: form.batchCode.trim(),
        remark: form.remark.trim() || null,
      };
      await run(
        'production.finished-inbound.create',
        body,
        (key) => productionApi.createFinishedGoodsInbound(body, key),
        '成品入库草稿已创建，尚未增加库存',
      );
    } else if (detail.value) {
      const id = targetId.value,
        body = {
          version: detail.value.version,
          outputRevisionId: form.outputRevisionId,
          batchCode: form.batchCode.trim(),
          remark: form.remark.trim() || null,
        };
      await run(
        'production.finished-inbound.update',
        body,
        (key) => productionApi.updateFinishedGoodsInbound(id, body, key),
        '入库草稿已保存，请按采用的批准清单重新核对实物',
      );
    }
  }
  async function acceptLatest() {
    if (!detail.value || locked.value || Number(currentApprovedQuantity.value) <= 0) return;
    const id = detail.value.inboundId,
      revisionId = detail.value.currentOutputRevisionId,
      version = detail.value.version;
    try {
      await RouteMessageBox.confirm(
        `将采用第 ${detail.value.currentApprovedOutput.revisionNo} 版批准清单，本类别数量由 ${detail.value.inboundQuantity} 变为 ${currentApprovedQuantity.value} ${detail.value.unit}。确认后仍须保存草稿，仓管按新版收齐再确认。`,
        '核对新版批准依据',
        { confirmButtonText: '采用新版，待保存' },
      );
    } catch {
      return;
    }
    if (props.visible && detail.value?.inboundId === id && detail.value.version === version)
      form.outputRevisionId = revisionId;
  }
  async function confirm() {
    if (!detail.value || !canConfirm.value) return;
    const row = detail.value,
      body = { version: row.version, outputRevisionId: row.outputRevisionId };
    try {
      await RouteMessageBox.confirm(
        `请确认已收齐 ${row.inboundQuantity} ${row.unit}，与 ${row.workOrderNo} / ${row.batchNo} 的第 ${row.revisionNo} 版清单一致。确认后一次生成库存批次 ${row.batchCode} 和库存流水，本类别不能再次入库，也不能修改或取消。`,
        '整批确认成品入库',
        { type: 'warning', confirmButtonText: '已收齐，确认入库' },
      );
    } catch {
      return;
    }
    if (!props.visible || targetId.value !== row.inboundId || detail.value.version !== body.version)
      return;
    await run(
      'production.finished-inbound.confirm',
      body,
      (key) => productionApi.confirmFinishedGoodsInbound(row.inboundId, body, key),
      '成品入库已确认，库存批次与正库存流水已生成',
    );
  }
  async function cancel() {
    if (!detail.value?.canCancel || busy.value || unresolved.value || error.value) return;
    const row = detail.value;
    let reason: string;
    try {
      const result = await RouteMessageBox.prompt(
        '取消后保留本单记录且不生成库存，可按最新批准清单重新创建。请填写原因。',
        '取消成品入库草稿',
        {
          inputType: 'textarea',
          inputValidator: (value) =>
            (!!value?.trim() && value.trim().length <= 5000) || '请填写不超过 5000 字的原因',
          confirmButtonText: '确认取消',
          type: 'warning',
        },
      );
      reason = result.value.trim();
    } catch {
      return;
    }
    if (!props.visible || targetId.value !== row.inboundId || detail.value.version !== row.version)
      return;
    const body = { version: row.version, reason };
    await run(
      'production.finished-inbound.cancel',
      body,
      (key) => productionApi.cancelFinishedGoodsInbound(row.inboundId, body, key),
      '入库草稿已取消，未改变库存',
    );
  }
  async function close(): Promise<boolean> {
    if (submitting.value) return false;
    if (unresolved.value || dirty.value) {
      try {
        await RouteMessageBox.confirm(
          unresolved.value
            ? '提交结果尚未确认，请先核对。关闭将放弃本地重试标识，确认继续？'
            : '存在未保存的草稿，确认放弃并关闭？',
          '关闭成品入库',
          { type: 'warning' },
        );
      } catch {
        return false;
      }
    }
    detailRequest.invalidate();
    candidateRequest.invalidate();
    loading.value = false;
    candidateLoading.value = false;
    intent.reset();
    pending = null;
    unresolved.value = false;
    closed();
    return true;
  }
  async function prepareTargetSwitch(): Promise<boolean> {
    if (submitting.value || unresolved.value) {
      EMessage.warning(
        submitting.value
          ? '当前单据正在提交，请等待完成后再打开其他单据'
          : '当前提交结果尚未确认，请先使用原命令重试并核对，再打开其他单据',
      );
      return false;
    }
    return close();
  }
  async function retry() {
    if (pending) await run(pending.name, pending.body, pending.send, pending.message);
  }
  watch(
    () => [props.visible, props.inboundId, props.sourceType] as const,
    ([visible]) => {
      detailRequest.invalidate();
      candidateRequest.invalidate();
      loading.value = false;
      candidateLoading.value = false;
      if (!visible) return;
      targetId.value = props.inboundId;
      detail.value = null;
      candidate.value = null;
      candidates.value = [];
      keyword.value = '';
      candidatePage.value = 1;
      candidateTotal.value = 0;
      error.value = '';
      candidateError.value = '';
      lastSuccess.value = '';
      Object.assign(form, { outputRevisionId: '', batchCode: '', remark: '' });
      savedForm.value = signature(form);
      loadedVersion.value = null;
      void refresh();
    },
    { immediate: true },
  );
  let activated = false;
  onActivated(() => {
    if (activated && !submitting.value && !unresolved.value) void refresh();
    activated = true;
  });
  return {
    detail,
    targetId,
    form,
    candidate,
    candidates,
    keyword,
    candidatePage,
    candidateTotal,
    candidateLoading,
    candidateError,
    loading,
    submitting,
    unresolved,
    error,
    lastSuccess,
    dirty,
    busy,
    locked,
    stale,
    sourceType,
    canSave,
    canConfirm,
    adoptedLatest,
    expectedQuantity,
    currentApprovedQuantity,
    loadCandidates,
    searchCandidates,
    changeCandidatePage,
    selectCandidate,
    refresh,
    reloadDraft,
    save,
    acceptLatest,
    confirm,
    cancel,
    close,
    prepareTargetSwitch,
    retry,
  };
}
