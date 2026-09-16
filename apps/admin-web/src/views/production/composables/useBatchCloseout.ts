import { computed, onActivated, reactive, ref, watch } from 'vue';
import type {
  BatchCloseoutDetail,
  BatchCloseoutItemKind,
  BatchCloseoutOutput,
  BatchCloseoutPendingItem,
  BatchTerminationCheck,
} from '@company/contracts';
import { productionApi } from '../../../api/production';
import { useLatestRequest } from '../../../composables/requests/useLatestRequest';
import {
  stableClientSignature,
  useIdempotentIntent,
} from '../../../composables/idempotency/useIdempotentIntent';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { validateCloseoutResponse } from './batch-closeout-response';
export interface CloseoutItemDraft {
  kind: BatchCloseoutItemKind;
  id: string;
  version: number;
  label: string;
  reason: string;
}
export function useBatchCloseout(
  props: { visible: boolean; batchId: string | null },
  changed: () => void,
  closed: () => void,
) {
  const check = ref<BatchTerminationCheck | null>(null),
    detail = ref<BatchCloseoutDetail | null>(null);
  const loading = ref(false),
    submitting = ref(false),
    unresolved = ref(false),
    error = ref(''),
    lastSuccess = ref(''),
    itemDraftDirty = ref(false),
    batchHandling = ref(false);
  const output = reactive<BatchCloseoutOutput>({
    availableQuantity: 0,
    additionalScrapQuantity: 0,
    reason: '',
    materialReviewNote: '',
  });
  const selected = ref<{
      kind: BatchCloseoutItemKind;
      id: string;
      version: number;
      label: string;
      checkToken: string;
      closeoutVersion: number;
    } | null>(null),
    itemReason = ref('');
  const request = useLatestRequest(),
    intent = useIdempotentIntent();
  let pending: {
    batchId: string;
    name: string;
    body: object;
    send: (key: string) => Promise<unknown>;
    successMessage: string;
  } | null = null;
  const readonly = computed(() =>
    Boolean(check.value?.termination || detail.value?.pendingApprovalId),
  );
  const signature = (value: unknown) =>
    stableClientSignature({ intentType: 'output', params: {}, query: {}, body: value });
  const outputDirty = computed(() => signature(output) !== signature(detail.value?.output));
  const canSubmit = computed(
    () =>
      detail.value?.canSubmit &&
      !outputDirty.value &&
      !readonly.value &&
      !loading.value &&
      !submitting.value &&
      !batchHandling.value &&
      !unresolved.value &&
      !error.value,
  );
  async function load(initialize = false) {
    const batchId = props.batchId;
    if (!batchId || !props.visible) return;
    const current = request.begin(() => props.visible && props.batchId === batchId);
    loading.value = true;
    error.value = '';
    try {
      const [preview, closeout] = await Promise.all([
        productionApi.getBatchTerminationCheck(batchId),
        productionApi.getBatchCloseout(batchId),
      ]);
      if (!current()) return;
      validateCloseoutResponse(preview, closeout, batchId);
      check.value = closeout?.check ?? preview;
      detail.value = closeout;
      if (initialize) {
        const saved =
          closeout?.output ??
          (preview.termination
            ? {
                availableQuantity: Number(preview.termination.availableQuantity),
                additionalScrapQuantity: Number(preview.termination.additionalScrapQuantity),
                reason: preview.termination.reason,
                materialReviewNote: preview.termination.materialReviewNote,
              }
            : null);
        if (saved) Object.assign(output, saved);
        else if (closeout) output.reason = closeout.reason;
      }
    } catch (failure) {
      if (current()) {
        error.value = failure instanceof Error ? failure.message : '加载失败';
        // 保留上次核对结果和逐项备注；error 会阻止继续写入，避免刷新失败丢草稿。
      }
    } finally {
      if (current()) loading.value = false;
    }
  }
  async function run(
    name: string,
    body: object,
    send: (key: string) => Promise<unknown>,
    successMessage: string,
    quiet = false,
  ): Promise<boolean> {
    if (submitting.value || loading.value || !props.batchId) return false;
    if (unresolved.value && !pending) return false;
    pending ??= { batchId: props.batchId, name, body, send, successMessage };
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
      if (props.batchId === command.batchId) {
        lastSuccess.value = command.successMessage;
        if (!quiet) EMessage.success(command.successMessage);
        selected.value = null;
        itemReason.value = '';
        changed();
        await load();
      }
      return !error.value;
    } catch (failure) {
      unresolved.value = intent.getStatus() !== 'idle';
      if (!unresolved.value) pending = null;
      EMessage.error(failure);
      return false;
    } finally {
      submitting.value = false;
    }
  }
  async function begin() {
    if (
      !props.batchId ||
      !check.value ||
      !output.reason.trim() ||
      unresolved.value ||
      submitting.value ||
      batchHandling.value ||
      loading.value ||
      error.value
    )
      return;
    const batchId = props.batchId;
    const body = { version: check.value.version, reason: output.reason.trim() };
    batchHandling.value = true;
    try {
      try {
        await RouteMessageBox.confirm(
          '开始收尾后停止本批次的生产执行。逐项处理结果将保留，结案审批驳回也不会自动恢复。确认开始？',
          '开始批次收尾',
          { type: 'warning', confirmButtonText: '开始收尾' },
        );
      } catch {
        return;
      }
      if (props.batchId !== batchId || !props.visible || check.value?.version !== body.version)
        return;
      await run(
        'production.closeout.begin',
        body,
        (key) => productionApi.beginBatchCloseout(batchId, body, key),
        '已开始收尾，请按模块处理待办事项',
      );
    } finally {
      batchHandling.value = false;
    }
  }
  async function handle() {
    if (
      !props.batchId ||
      !detail.value ||
      !selected.value ||
      !itemReason.value.trim() ||
      unresolved.value
    )
      return;
    const batchId = props.batchId,
      body = {
        version: selected.value.closeoutVersion,
        checkToken: selected.value.checkToken,
        kind: selected.value.kind,
        targetId: selected.value.id,
        targetVersion: selected.value.version,
        reason: itemReason.value.trim(),
      };
    await run(
      'production.closeout.handle',
      body,
      (key) => productionApi.handleBatchCloseoutItem(batchId, body, key),
      '物料核对已保存，可在本行查看安排和核对时间',
    );
  }
  async function handleItems(items: CloseoutItemDraft[]): Promise<void> {
    if (
      !items.length ||
      readonly.value ||
      unresolved.value ||
      submitting.value ||
      batchHandling.value ||
      loading.value ||
      error.value
    )
      return;
    if (items.some((item) => !item.reason.trim())) {
      EMessage.warning('请补全本组处理说明');
      return;
    }
    const batchId = props.batchId;
    const reviewedToken = detail.value?.check.checkToken;
    const approved = items.map((item) => ({ ...item, reason: item.reason.trim() }));
    batchHandling.value = true;
    try {
      try {
        await RouteMessageBox.confirm(
          `确认处理以下 ${approved.length} 项？每项保留独立处理记录，已完成项不会因结案审批驳回自动恢复。\n` +
            approved
              .slice(0, 3)
              .map(
                (item) =>
                  `${item.label}：${item.reason.slice(0, 120)}${item.reason.length > 120 ? '…' : ''}`,
              )
              .join('\n') +
            (approved.length > 3
              ? `\n其余 ${approved.length - 3} 项按页面中已核对的备注处理。`
              : ''),
          '确认收尾处理',
          { type: 'warning', confirmButtonText: '按说明处理' },
        );
      } catch {
        return;
      }
      if (
        props.batchId !== batchId ||
        !props.visible ||
        detail.value?.check.checkToken !== reviewedToken
      ) {
        EMessage.warning('核对内容已变化，请重新确认');
        return;
      }
      let completed = 0;
      for (const item of approved) {
        if (
          props.batchId !== batchId ||
          !props.visible ||
          !detail.value ||
          readonly.value ||
          unresolved.value ||
          error.value
        )
          break;
        const current: BatchCloseoutPendingItem | undefined = detail.value.pendingItems.find(
          (row) => row.kind === item.kind && row.id === item.id,
        );
        if (!current || current.version !== item.version || current.blockedReason) {
          EMessage.warning('事项或依赖已变化，已停止后续处理，请刷新核对');
          break;
        }
        const body = {
          version: detail.value.version,
          checkToken: detail.value.check.checkToken,
          kind: item.kind,
          targetId: item.id,
          targetVersion: item.version,
          reason: item.reason,
        };
        const succeeded = await run(
          'production.closeout.handle',
          body,
          (key) => productionApi.handleBatchCloseoutItem(batchId!, body, key),
          `${item.label}已处理`,
          true,
        );
        if (!succeeded) break;
        completed += 1;
      }
      if (completed) {
        lastSuccess.value = `已完成 ${completed} / ${approved.length} 项；处理记录已更新`;
        EMessage.success(lastSuccess.value);
      }
    } finally {
      batchHandling.value = false;
    }
  }
  async function saveOutput() {
    if (!props.batchId || !detail.value || unresolved.value) return;
    const batchId = props.batchId,
      body = { ...output, version: detail.value.version };
    await run(
      'production.closeout.output',
      body,
      (key) => productionApi.saveBatchCloseoutOutput(batchId, body, key),
      '实际产出与物料安排已保存',
    );
  }
  async function submit() {
    if (!props.batchId || !detail.value || !canSubmit.value || unresolved.value) return;
    const batchId = props.batchId,
      body = { version: detail.value.version, checkToken: detail.value.check.checkToken };
    await run(
      'production.closeout.submit',
      body,
      (key) => productionApi.submitBatchCloseout(batchId, body, key),
      '已提交短产 / 提前结束审批',
    );
  }
  async function retry() {
    if (pending) await run(pending.name, pending.body, pending.send, pending.successMessage);
  }
  async function close() {
    if (submitting.value || batchHandling.value) return;
    if (unresolved.value) {
      try {
        await RouteMessageBox.confirm(
          '提交结果未确认，关闭将放弃本地重试标识，请先核对收尾记录。',
          '提交结果未确认',
          { type: 'warning' },
        );
      } catch {
        return;
      }
    }
    if (
      !unresolved.value &&
      ((detail.value && outputDirty.value && !readonly.value) ||
        selected.value ||
        itemDraftDirty.value ||
        (!detail.value && !readonly.value && output.reason.trim()))
    ) {
      try {
        await RouteMessageBox.confirm(
          '尚有未保存的产出或本项说明，确认放弃这些输入？',
          '关闭收尾窗口',
          { type: 'warning' },
        );
      } catch {
        return;
      }
    }
    intent.reset();
    pending = null;
    unresolved.value = false;
    request.invalidate();
    loading.value = false;
    closed();
  }
  watch(
    () => [props.visible, props.batchId] as const,
    ([visible]) => {
      request.invalidate();
      if (!visible) {
        loading.value = false;
        return;
      }
      check.value = null;
      detail.value = null;
      selected.value = null;
      lastSuccess.value = '';
      itemDraftDirty.value = false;
      itemReason.value = '';
      Object.assign(output, {
        availableQuantity: 0,
        additionalScrapQuantity: 0,
        reason: '',
        materialReviewNote: '',
      });
      void load(true);
    },
    { immediate: true },
  );
  let activated = false;
  onActivated(() => {
    if (activated && !submitting.value && !batchHandling.value && !unresolved.value) void load();
    activated = true;
  });
  return {
    check,
    detail,
    loading,
    submitting,
    batchHandling,
    lastSuccess,
    itemDraftDirty,
    unresolved,
    error,
    output,
    selected,
    itemReason,
    readonly,
    outputDirty,
    canSubmit,
    load,
    begin,
    handle,
    handleItems,
    saveOutput,
    submit,
    retry,
    close,
  };
}
