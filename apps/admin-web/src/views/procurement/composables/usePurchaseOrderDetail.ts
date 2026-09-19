import { computed, onActivated, ref } from 'vue';
import type {
  ClosePurchaseOrderLinePayload,
  PurchaseOrderDetail,
  PurchaseOrderLine,
} from '@company/contracts';
import { PURCHASE_ORDER_MAX_QUANTITY } from '@company/constants';
import { procurementApi } from '../../../api/procurement';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { useProcurementCommand } from './useProcurementCommand';

export function usePurchaseOrderDetail(onChanged: () => void) {
  const visible = ref(false),
    id = ref(''),
    loading = ref(false),
    readError = ref(false);
  const detail = ref<PurchaseOrderDetail | null>(null);
  const action = ref<'cancel' | 'close' | 'supplement' | null>(null);
  const actionLine = ref<PurchaseOrderLine | null>(null),
    actionOrderVersion = ref(0),
    actionStale = ref(false);
  const reason = ref(''),
    supplementQuantity = ref<number | undefined>(),
    supplementRemark = ref('');
  const closeReason = ref<ClosePurchaseOrderLinePayload['reasonType']>('manual_end');
  const read = useLatestReadRequest(() => {
    loading.value = false;
  });
  const command = useProcurementCommand(async (result) => {
    action.value = null;
    id.value = result.purchaseOrderId;
    onChanged();
    await load();
  });
  const load = async (): Promise<void> => {
    if (!visible.value || !id.value || !read.isActive()) return;
    const target = id.value;
    const current = read.begin(() => visible.value && id.value === target);
    loading.value = true;
    try {
      const latest = await procurementApi.getOrder(target, current.signal);
      if (!current.isCurrent()) return;
      if (action.value && latest.version !== actionOrderVersion.value) actionStale.value = true;
      detail.value = latest;
      readError.value = false;
    } catch (error) {
      if (current.isCurrent()) {
        readError.value = true;
        EMessage.error(error, '采购详情加载失败');
      }
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
    readError.value = false;
    visible.value = true;
    await load();
  };
  const close = async (): Promise<boolean> => {
    if (
      !(await command.canClose(
        Boolean(
          action.value && (reason.value || supplementQuantity.value || supplementRemark.value),
        ),
      ))
    )
      return false;
    visible.value = false;
    action.value = null;
    read.invalidate();
    return true;
  };
  const startAction = (type: 'cancel' | 'close' | 'supplement', line?: PurchaseOrderLine): void => {
    if (!detail.value || command.locked.value || readError.value || loading.value) return;
    action.value = type;
    actionLine.value = line ?? null;
    actionOrderVersion.value = detail.value.version;
    actionStale.value = false;
    reason.value = '';
    supplementQuantity.value = undefined;
    supplementRemark.value = '';
    closeReason.value = line?.allowedCloseReasons.includes('manual_end')
      ? 'manual_end'
      : (line?.allowedCloseReasons[0] ?? 'manual_end');
  };
  const actionValid = computed(() =>
    Boolean(
      action.value &&
      reason.value.trim() &&
      !actionStale.value &&
      !readError.value &&
      !command.locked.value &&
      !loading.value &&
      (action.value !== 'supplement' ||
        (Number.isInteger(supplementQuantity.value) &&
          Number(supplementQuantity.value) > 0 &&
          Number(supplementQuantity.value) <= PURCHASE_ORDER_MAX_QUANTITY)),
    ),
  );
  const place = async (): Promise<void> => {
    const target = detail.value;
    if (!target || target.status !== 'draft' || command.locked.value || readError.value) return;
    try {
      await RouteMessageBox.confirm(
        `确认向“${target.supplierName}”正式下单？下单后供应商、物料、采购数量和来源不可修改。`,
        '正式下单',
        { type: 'warning', confirmButtonText: '确认下单', cancelButtonText: '继续核对' },
      );
    } catch {
      return;
    }
    const body = { version: target.version };
    await command.run(
      { intentType: 'procurement.order.place', params: { id: target.id }, query: {}, body },
      (key) => procurementApi.placeOrder(target.id, body, key),
      '采购已正式下单',
    );
  };
  const confirmAction = async (): Promise<void> => {
    if (!actionValid.value || !detail.value) return;
    await load();
    if (!actionValid.value || !detail.value) return;
    const target = detail.value;
    const line = actionLine.value;
    if (action.value === 'cancel') {
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
        '采购行已结束',
      );
    } else if (action.value === 'supplement' && line) {
      const body = {
        supplementReason: 'excess_purchase' as const,
        plannedQuantity: Number(supplementQuantity.value),
        supplementEvidence: reason.value.trim(),
        remark: supplementRemark.value.trim() || null,
      };
      await command.run(
        { intentType: 'procurement.order.supplement', params: { id: line.id }, query: {}, body },
        (key) => procurementApi.createSupplement(line.id, body, key),
        '超量补单草稿已创建，请核对后正式下单',
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
    supplementQuantity,
    supplementRemark,
    closeReason,
    actionValid,
    open,
    close,
    load,
    place,
    startAction,
    confirmAction,
  };
}
