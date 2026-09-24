import { computed, onActivated, ref } from 'vue';
import type {
  ClosePurchaseOrderLinePayload,
  PurchaseOrderDetail,
  PurchaseOrderLine,
} from '@company/contracts';
import { procurementApi } from '../../../api/procurement';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';
import { useProcurementCommand } from './useProcurementCommand';

export function usePurchaseOrderActions(
  onChanged: (id: string, detail: PurchaseOrderDetail | null) => void,
) {
  const visible = ref(false),
    id = ref(''),
    loading = ref(false),
    readError = ref(false);
  const detail = ref<PurchaseOrderDetail | null>(null);
  const action = ref<'place' | 'cancel' | 'close' | null>(null);
  const actionLine = ref<PurchaseOrderLine | null>(null),
    actionOrderVersion = ref(0),
    actionStale = ref(false);
  const reason = ref('');
  const closeReason = ref<ClosePurchaseOrderLinePayload['reasonType']>('manual_end');
  const read = useLatestReadRequest(() => {
    loading.value = false;
  });
  const command = useProcurementCommand(async (result) => {
    action.value = null;
    id.value = result.purchaseOrderId;
    const refreshed = await load();
    visible.value = false;
    onChanged(result.purchaseOrderId, refreshed ? detail.value : null);
  });
  const load = async (): Promise<boolean> => {
    if (!visible.value || !id.value || !read.isActive()) return false;
    const target = id.value;
    const current = read.begin(() => visible.value && id.value === target);
    loading.value = true;
    try {
      const latest = await procurementApi.getOrder(target, current.signal);
      if (!current.isCurrent()) return false;
      if (action.value && latest.version !== actionOrderVersion.value) actionStale.value = true;
      if (action.value === 'close' && actionLine.value) {
        const next = latest.items.find((line) => line.id === actionLine.value?.id);
        if (
          !next ||
          next.version !== actionLine.value.version ||
          JSON.stringify(next.quantities) !== JSON.stringify(actionLine.value.quantities) ||
          JSON.stringify(next.allowedCloseReasons) !==
            JSON.stringify(actionLine.value.allowedCloseReasons)
        )
          actionStale.value = true;
      }
      detail.value = latest;
      readError.value = false;
      return true;
    } catch (error) {
      if (current.isCurrent()) {
        readError.value = true;
        EMessage.error(error, '采购详情加载失败');
      }
      return false;
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  };
  const open = async (target: string): Promise<void> => {
    if (command.locked.value) return;
    if (visible.value && !(await close())) return;
    id.value = target;
    detail.value = null;
    action.value = null;
    actionLine.value = null;
    readError.value = false;
    visible.value = true;
    await load();
  };
  const close = async (): Promise<boolean> => {
    if (!(await command.canClose(Boolean(action.value && reason.value)))) return false;
    visible.value = false;
    action.value = null;
    read.invalidate();
    return true;
  };
  const startAction = (type: 'place' | 'cancel' | 'close', line?: PurchaseOrderLine): void => {
    if (!detail.value || command.locked.value || readError.value || loading.value) return;
    action.value = type;
    actionLine.value = line ?? null;
    actionOrderVersion.value = detail.value.version;
    actionStale.value = false;
    reason.value = '';
    closeReason.value = line?.allowedCloseReasons.includes('quality_target')
      ? 'quality_target'
      : line?.allowedCloseReasons.includes('quality_return_completed')
        ? 'quality_return_completed'
        : 'manual_end';
  };
  const eligible = computed(() => {
    const target = detail.value;
    if (!target) return false;
    if (action.value === 'place') return target.status === 'draft';
    if (action.value === 'cancel')
      return (
        (target.status === 'draft' || target.status === 'ordered') &&
        target.items.every(
          (line) =>
            line.status === 'cancelled' ||
            (line.status !== 'closed' && line.allowedCloseReasons.includes('cancelled')),
        )
      );
    if (action.value === 'close')
      return (
        target.status === 'ordered' &&
        actionLine.value?.status === 'open' &&
        actionLine.value.allowedCloseReasons.includes(closeReason.value)
      );
    return false;
  });
  const actionValid = computed(() =>
    Boolean(
      action.value &&
      eligible.value &&
      (action.value === 'place' || reason.value.trim()) &&
      !actionStale.value &&
      !readError.value &&
      !command.locked.value &&
      !loading.value,
    ),
  );
  const confirmAction = async (): Promise<void> => {
    if (!actionValid.value || !detail.value) return;
    if (!(await load()) || !read.isActive()) return;
    if (!actionValid.value || !detail.value) return;
    const target = detail.value;
    const line = actionLine.value;
    if (action.value === 'place') {
      const body = { version: actionOrderVersion.value };
      await command.run(
        { intentType: 'procurement.order.place', params: { id: target.id }, query: {}, body },
        (key) => procurementApi.placeOrder(target.id, body, key),
        '采购已正式下单',
      );
    } else if (action.value === 'cancel') {
      const body = { version: actionOrderVersion.value, reason: reason.value.trim() };
      await command.run(
        { intentType: 'procurement.order.cancel', params: { id: target.id }, query: {}, body },
        (key) => procurementApi.cancelOrder(target.id, body, key),
        '采购单已取消',
      );
    } else if (action.value === 'close' && line) {
      const body = {
        version: line.version,
        reasonType: closeReason.value,
        reason: reason.value.trim(),
      };
      await command.run(
        { intentType: 'procurement.order.line.close', params: { id: line.id }, query: {}, body },
        (key) => procurementApi.closeOrderLine(line.id, body, key),
        closeReason.value === 'cancelled' ? '采购行已取消' : '采购行已结束',
      );
    }
  };
  onActivated(() => {
    if (visible.value && !command.locked.value) void load();
  });
  return {
    visible,
    detail,
    loading,
    readError,
    command,
    action,
    actionLine,
    actionStale,
    reason,
    closeReason,
    actionValid,
    open,
    close,
    load,
    eligible,
    startAction,
    confirmAction,
  };
}
