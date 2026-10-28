import { computed, ref } from 'vue';
import type { PurchaseOrderDetail, PurchaseOrderLine } from '@company/contracts';
import { procurementApi } from '../../../api/procurement';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';
import { useProcurementCommand } from './useProcurementCommand';

export type PurchaseOrderAction = 'place' | 'cancel' | 'close-order' | 'close' | 'reopen';

export function usePurchaseOrderActions(
  onChanged: (id: string, detail: PurchaseOrderDetail | null) => void,
) {
  const visible = ref(false),
    id = ref(''),
    loading = ref(false),
    readError = ref(false);
  const detail = ref<PurchaseOrderDetail | null>(null);
  const action = ref<PurchaseOrderAction | null>(null);
  const actionLine = ref<PurchaseOrderLine | null>(null),
    actionOrder = ref<PurchaseOrderDetail | null>(null),
    actionStale = ref(false);
  const reason = ref('');
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
      const basis = actionOrder.value;
      if (action.value && basis) {
        const expectedLines = basis.items;
        if (
          latest.id !== basis.id ||
          latest.purchaseNo !== basis.purchaseNo ||
          latest.version !== basis.version ||
          latest.status !== basis.status ||
          (action.value === 'cancel' && latest.canCancel !== basis.canCancel) ||
          latest.items.length !== basis.items.length ||
          expectedLines.some((line) => {
            const next = latest.items.find((item) => item.id === line.id);
            return (
              !next ||
              next.version !== line.version ||
              next.status !== line.status ||
              next.plannedQuantity !== line.plannedQuantity ||
              next.supplierId !== line.supplierId ||
              next.itemId !== line.itemId ||
              next.materialVariantId !== line.materialVariantId ||
              next.fulfillmentMode !== line.fulfillmentMode
            );
          })
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
    actionOrder.value = null;
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
  const startAction = (type: PurchaseOrderAction, line?: PurchaseOrderLine): void => {
    if (!detail.value || command.locked.value || readError.value || loading.value) return;
    action.value = type;
    actionLine.value = line ?? null;
    actionOrder.value = detail.value;
    actionStale.value = false;
    reason.value = '';
  };
  const eligible = computed(() => {
    const target = detail.value;
    if (!target) return false;
    if (action.value === 'place') return target.status === 'draft';
    if (action.value === 'cancel')
      return (target.status === 'draft' || target.status === 'ordered') && target.canCancel;
    if (action.value === 'close-order')
      return target.status === 'ordered' && target.items.some((line) => line.status === 'open');
    const currentLine = target.items.find((line) => line.id === actionLine.value?.id);
    if (action.value === 'close')
      return target.status === 'ordered' && currentLine?.status === 'open';
    if (action.value === 'reopen')
      return (
        (target.status === 'ordered' || target.status === 'completed') &&
        currentLine?.status === 'closed'
      );
    return false;
  });
  const actionValid = computed(() =>
    Boolean(
      action.value &&
      eligible.value &&
      (action.value === 'place' || (reason.value.trim() && reason.value.trim().length <= 2000)) &&
      !actionStale.value &&
      !readError.value &&
      !command.locked.value &&
      !loading.value,
    ),
  );
  const confirmAction = async (): Promise<void> => {
    if (!actionValid.value || !detail.value || !actionOrder.value) return;
    if (!(await load()) || !read.isActive()) return;
    if (!actionValid.value || !detail.value || !actionOrder.value) return;
    const target = actionOrder.value;
    const line = actionLine.value;
    if (action.value === 'place') {
      const body = { version: target.version };
      await command.run(
        { intentType: 'procurement.order.place', params: { id: target.id }, query: {}, body },
        (key) => procurementApi.placeOrder(target.id, body, key),
        '采购已正式下单',
      );
    } else if (action.value === 'cancel') {
      const body = { version: target.version, reason: reason.value.trim() };
      await command.run(
        { intentType: 'procurement.order.cancel', params: { id: target.id }, query: {}, body },
        (key) => procurementApi.cancelOrder(target.id, body, key),
        '采购单已取消',
      );
    } else if (action.value === 'close-order') {
      const body = { version: target.version, reason: reason.value.trim() };
      await command.run(
        { intentType: 'procurement.order.close', params: { id: target.id }, query: {}, body },
        (key) => procurementApi.closeOrder(target.id, body, key),
        '采购单已结束',
      );
    } else if ((action.value === 'close' || action.value === 'reopen') && line) {
      const body = {
        version: line.version,
        reason: reason.value.trim(),
      };
      const reopening = action.value === 'reopen';
      await command.run(
        {
          intentType: reopening ? 'procurement.order.line.reopen' : 'procurement.order.line.close',
          params: { id: line.id },
          query: {},
          body,
        },
        (key) =>
          reopening
            ? procurementApi.reopenOrderLine(line.id, body, key)
            : procurementApi.closeOrderLine(line.id, body, key),
        reopening ? '采购行已恢复' : '采购行已结束',
      );
    }
  };
  return {
    visible,
    detail,
    loading,
    readError,
    command,
    action,
    actionLine,
    actionOrder,
    actionStale,
    reason,
    actionValid,
    open,
    close,
    load,
    eligible,
    startAction,
    confirmAction,
  };
}
