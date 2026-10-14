import { computed, onActivated, onDeactivated, onScopeDispose, reactive, ref } from 'vue';
import { CONCURRENCY_ERROR_CODES, OTHER_INVENTORY_DIRECTION_LABELS } from '@company/constants';
import type {
  OtherInventoryDirection,
  OtherInventoryDraftPayload,
  OtherInventoryOrder,
  SaveOtherInventoryDraftPayload,
} from '@company/contracts';
import { RequestError } from '@company/request';
import { otherInventoryApi } from '../../../api/other-inventory';
import {
  useIdempotentIntent,
  type IdempotentIntentStatus,
} from '../../../composables/idempotency/useIdempotentIntent';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { useTabsStore } from '../../../stores/tabs';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import {
  newOtherInventoryDraftLine,
  otherInventoryDraftLineFromDetail,
  type OtherInventoryDraftLine,
} from '../other-inventory-draft';
import {
  activeOtherInventoryLines,
  otherInventoryPendingStatus,
  otherInventoryQuantitySummary,
} from '../other-inventory-presentation';

export type OtherInventoryEditorMode = 'create' | 'edit' | 'detail' | 'confirm' | 'cancel';
type WriteCommand =
  | { kind: 'create'; body: OtherInventoryDraftPayload }
  | { kind: 'save'; id: string; body: SaveOtherInventoryDraftPayload }
  | { kind: 'confirm'; id: string; body: { version: number } }
  | { kind: 'cancel'; id: string; body: { version: number; reason: string } };

export function useOtherInventoryOrderEditor(
  direction: OtherInventoryDirection,
  routeName: string,
  afterWrite: () => Promise<void>,
) {
  const visible = ref(false);
  const mode = ref<OtherInventoryEditorMode>('detail');
  const currentId = ref<string | null>(null);
  const order = ref<OtherInventoryOrder | null>(null);
  const latestOrder = ref<OtherInventoryOrder | null>(null);
  const form = reactive({ reason: '', remark: '' });
  const lines = ref<OtherInventoryDraftLine[]>([]);
  const cancelReason = ref('');
  const loading = ref(false);
  const loaded = ref(false);
  const readError = ref(false);
  const conflict = ref(false);
  const submitting = ref(false);
  const intentStatus = ref<IdempotentIntentStatus>('idle');
  const intent = useIdempotentIntent('其他出入库单');
  const reader = useLatestReadRequest(() => (loading.value = false));
  const active = ref(true);
  onActivated(() => (active.value = true));
  onDeactivated(() => (active.value = false));
  const baseline = ref('');
  const title = OTHER_INVENTORY_DIRECTION_LABELS[direction];
  let retainedCommand: WriteCommand | null = null;
  let editorEpoch = 0;

  const inputSnapshot = (): string =>
    JSON.stringify({
      reason: form.reason,
      remark: form.remark,
      details: lines.value.map((line) => ({
        id: line.id,
        itemKind: line.itemKind,
        objectId: line.object?.id ?? null,
        quantity: line.quantity,
        target: line.target,
        remark: line.remark,
      })),
    });
  const dirty = computed(() => inputSnapshot() !== baseline.value);
  const controlsLocked = computed(() => submitting.value || intentStatus.value !== 'idle');
  const isPending = computed(() => order.value?.status === otherInventoryPendingStatus(direction));
  const isEditing = computed(() => mode.value === 'create' || mode.value === 'edit');
  const readReady = computed(
    () => active.value && loaded.value && !loading.value && !readError.value,
  );
  const validationMessage = computed((): string => {
    if (!form.reason.trim()) return '请填写办理原因';
    if (form.reason.length > 5000 || form.remark.length > 5000)
      return '原因及备注不能超过 5000 个字符';
    if (!lines.value.length || lines.value.length > 50) return '每单须保留 1–50 条有效明细';
    for (const line of lines.value) {
      if (!line.object?.id) return '请为每行选择精确物料版本或成品';
      if (
        !Number.isInteger(line.quantity) ||
        !line.quantity ||
        line.quantity < 1 ||
        line.quantity > 99_999_999
      )
        return '每行数量须为 1–99,999,999 的整数';
      if (line.remark.length > 5000) return '行备注不能超过 5000 个字符';
      if (line.target.mode === 'existing' && (!line.target.batchId || !line.batch))
        return '请为每行选择已有库存批次';
      if (line.target.mode === 'new' && (!line.target.clientKey.trim() || !line.objectVerified))
        return '请重新核验新批次的库存对象；停用或读取失败的对象不能新建批次';
    }
    return '';
  });
  const canSave = computed(
    () =>
      isEditing.value &&
      readReady.value &&
      !controlsLocked.value &&
      !conflict.value &&
      !validationMessage.value,
  );
  const canConfirm = computed(
    () =>
      isPending.value &&
      readReady.value &&
      !controlsLocked.value &&
      !conflict.value &&
      !dirty.value,
  );
  const canCancel = computed(
    () =>
      canConfirm.value &&
      Boolean(cancelReason.value.trim()) &&
      cancelReason.value.trim().length <= 5000,
  );

  function applyOrder(value: OtherInventoryOrder): void {
    order.value = value;
    currentId.value = value.id;
    form.reason = value.reason;
    form.remark = value.remark ?? '';
    lines.value = activeOtherInventoryLines(value).map(otherInventoryDraftLineFromDetail);
    baseline.value = inputSnapshot();
    latestOrder.value = null;
    conflict.value = false;
    loaded.value = true;
    readError.value = false;
    if (value.status !== otherInventoryPendingStatus(direction)) mode.value = 'detail';
  }
  function reset(): void {
    editorEpoch += 1;
    reader.invalidate();
    currentId.value = null;
    order.value = null;
    latestOrder.value = null;
    lines.value = [];
    form.reason = '';
    form.remark = '';
    cancelReason.value = '';
    loaded.value = false;
    readError.value = false;
    conflict.value = false;
    intent.reset();
    intentStatus.value = 'idle';
    retainedCommand = null;
    baseline.value = inputSnapshot();
  }
  async function canDiscard(): Promise<boolean> {
    if (submitting.value) return false;
    const hasIntent = intent.getStatus() !== 'idle';
    if (!hasIntent && !dirty.value && !cancelReason.value.trim()) return true;
    try {
      await RouteMessageBox.confirm(
        hasIntent
          ? '上次写入结果尚未确认，原请求和安全重试标识仍保留。请先核对单据列表；放弃后重新提交可能重复建单或改变库存。'
          : '当前输入尚未保存，关闭或切换单据将放弃这些修改。',
        hasIntent ? '放弃未确认提交' : '放弃未保存修改',
        {
          type: 'warning',
          confirmButtonText: hasIntent ? '核对后仍要放弃' : '放弃修改',
          cancelButtonText: '继续保留',
        },
      );
      return true;
    } catch {
      return false;
    }
  }
  async function open(targetMode: OtherInventoryEditorMode, id?: string): Promise<void> {
    if (visible.value && !(await canDiscard())) return;
    reset();
    mode.value = targetMode;
    visible.value = true;
    if (targetMode === 'create') {
      lines.value = [newOtherInventoryDraftLine(direction === 'inbound')];
      loaded.value = true;
      baseline.value = inputSnapshot();
      return;
    }
    if (!id) return;
    currentId.value = id;
    await refresh();
  }
  async function refresh(): Promise<void> {
    const id = currentId.value;
    if (!id || !visible.value || !reader.isActive()) return;
    const request = reader.begin(() => visible.value && currentId.value === id);
    loading.value = true;
    readError.value = false;
    try {
      const result = await otherInventoryApi.get(direction, id, request.signal);
      if (!request.isCurrent()) return;
      if (!order.value || (!dirty.value && intent.getStatus() === 'idle')) {
        applyOrder(result);
      } else {
        latestOrder.value = result;
        conflict.value = result.version !== order.value.version;
        loaded.value = true;
      }
    } catch (cause) {
      if (!request.isCurrent()) return;
      readError.value = true;
      EMessage.error(cause, '单据详情加载失败，原输入已保留');
    } finally {
      if (request.isCurrent()) loading.value = false;
    }
  }
  async function adoptLatest(): Promise<void> {
    if (!latestOrder.value || !(await canDiscard())) return;
    intent.reset();
    intentStatus.value = 'idle';
    retainedCommand = null;
    applyOrder(latestOrder.value);
    cancelReason.value = '';
    if (!isPending.value) mode.value = 'detail';
  }
  async function close(): Promise<void> {
    if (!(await canDiscard())) return;
    visible.value = false;
    reset();
  }
  async function beforeClose(done: () => void): Promise<void> {
    if (!(await canDiscard())) return;
    visible.value = false;
    reset();
    done();
  }
  function addLine(): void {
    if (controlsLocked.value || lines.value.length >= 50) return;
    lines.value = [...lines.value, newOtherInventoryDraftLine(direction === 'inbound')];
  }
  function removeLine(key: string): void {
    if (controlsLocked.value) return;
    lines.value = lines.value.filter((line) => line.key !== key);
  }
  function draftPayload(): OtherInventoryDraftPayload {
    return {
      reason: form.reason.trim(),
      remark: form.remark.trim() || null,
      details: lines.value.map((line) => ({
        id: line.id,
        itemKind: line.itemKind,
        materialVariantId: line.object?.materialVariantId ?? undefined,
        productId: line.object?.productId ?? undefined,
        quantity: line.quantity ?? 0,
        target: { ...line.target },
        remark: line.remark.trim() || null,
      })),
    };
  }
  async function run(command: WriteCommand): Promise<void> {
    if (submitting.value) return;
    const epoch = editorEpoch;
    retainedCommand = command;
    submitting.value = true;
    try {
      const result = await intent.execute(
        {
          intentType: `inventory.other.${direction}.${command.kind}`,
          params: { direction, id: command.kind === 'create' ? null : command.id },
          query: {},
          body: command.body,
        },
        (key) => {
          if (command.kind === 'create')
            return otherInventoryApi.create(direction, command.body, key);
          if (command.kind === 'save')
            return otherInventoryApi.save(direction, command.id, command.body, key);
          if (command.kind === 'confirm')
            return otherInventoryApi.confirm(direction, command.id, command.body.version, key);
          return otherInventoryApi.cancel(direction, command.id, command.body, key);
        },
      );
      if (epoch !== editorEpoch) return;
      applyOrder(result);
      mode.value = command.kind === 'create' || command.kind === 'save' ? 'edit' : 'detail';
      cancelReason.value = '';
      EMessage.success(
        command.kind === 'confirm'
          ? `${result.orderNo} 已整单确认，库存流水已生成`
          : command.kind === 'cancel'
            ? `${result.orderNo} 已取消，未生成库存流水`
            : `${result.orderNo} 草稿已保存，库存尚未变化`,
      );
      await afterWrite();
    } catch (cause) {
      if (epoch !== editorEpoch) return;
      if (
        cause instanceof RequestError &&
        cause.code === CONCURRENCY_ERROR_CODES.concurrentModification
      )
        conflict.value = true;
      EMessage.error(cause, `${title}操作失败，原输入已保留`);
    } finally {
      if (epoch === editorEpoch) {
        submitting.value = false;
        intentStatus.value = intent.getStatus();
        if (intentStatus.value === 'idle') retainedCommand = null;
      }
    }
  }
  async function save(): Promise<void> {
    if (!canSave.value) return;
    const body = draftPayload();
    const basis = order.value;
    await run(
      basis
        ? { kind: 'save', id: basis.id, body: { ...body, version: basis.version } }
        : { kind: 'create', body },
    );
  }
  async function confirm(): Promise<void> {
    const basis = order.value;
    if (!basis || !canConfirm.value) return;
    try {
      await RouteMessageBox.confirm(
        `确认整单 ${basis.orderNo}，共 ${activeOtherInventoryLines(basis).length} 条明细、${otherInventoryQuantitySummary(basis)}。${direction === 'inbound' ? '新批次在本次确认时生成，整单增加可用库存。' : '整单扣减可用库存，并重新核对生产预留；余额或预留不足时整单失败。'}确认后单据与明细不可修改或取消。`,
        `确认${title}`,
        {
          type: 'warning',
          confirmButtonText: `确认整单${direction === 'inbound' ? '入库' : '出库'}`,
          cancelButtonText: '返回核对',
        },
      );
      if (!canConfirm.value || order.value?.id !== basis.id) return;
      await run({ kind: 'confirm', id: basis.id, body: { version: basis.version } });
    } catch (cause) {
      if (cause !== 'cancel' && cause !== 'close') EMessage.error(cause);
    }
  }
  async function cancel(): Promise<void> {
    const basis = order.value;
    if (!basis || !canCancel.value) return;
    try {
      await RouteMessageBox.confirm(
        `取消 ${basis.orderNo} 后保留单据与全部历史行，不生成库存流水或新库存批次。取消后不能恢复或编辑。`,
        `取消${title}单`,
        { type: 'warning', confirmButtonText: '取消单据', cancelButtonText: '返回核对' },
      );
      if (!canCancel.value || order.value?.id !== basis.id) return;
      await run({
        kind: 'cancel',
        id: basis.id,
        body: { version: basis.version, reason: cancelReason.value.trim() },
      });
    } catch (cause) {
      if (cause !== 'cancel' && cause !== 'close') EMessage.error(cause);
    }
  }
  async function retry(): Promise<void> {
    const status = intent.getStatus();
    intentStatus.value = status;
    if (!retainedCommand || submitting.value || status !== 'pending' || !reader.isActive()) return;
    await run(retainedCommand);
  }
  const unregister = useTabsStore().registerCloseGuard(
    routeName,
    async () => !visible.value || (await canDiscard()),
  );
  onScopeDispose(unregister);

  return {
    visible,
    mode,
    order,
    latestOrder,
    form,
    lines,
    cancelReason,
    loading,
    loaded,
    readError,
    conflict,
    submitting,
    intentStatus,
    dirty,
    controlsLocked,
    isPending,
    isEditing,
    readReady,
    validationMessage,
    canSave,
    canConfirm,
    canCancel,
    open,
    refresh,
    adoptLatest,
    close,
    beforeClose,
    addLine,
    removeLine,
    save,
    confirm,
    cancel,
    retry,
  };
}
