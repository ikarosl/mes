import { computed, onActivated, ref } from 'vue';
import type {
  ConfirmProcurementReceiptPayload,
  ProcurementReceiptCommandResult,
  PurchaseOrderDetail,
  PurchaseOrderItem,
  PurchaseOrderLine,
} from '@company/contracts';
import { PURCHASE_ORDER_MAX_QUANTITY } from '@company/constants';
import { procurementApi } from '../../../api/procurement';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { useProcurementCommand } from './useProcurementCommand';

interface ReceiptDraftRow {
  key: number;
  line: PurchaseOrderLine;
  receivedQuantity: number | undefined;
  supplierBatchCode: string;
  overReceiptNote: string;
}
export function useReceiptEditor(onSaved: (id: string) => void | Promise<void>) {
  const visible = ref(false),
    loading = ref(false),
    stale = ref(false);
  const keyword = ref(''),
    page = ref(1),
    pageSize = ref(10),
    total = ref(0),
    orders = ref<PurchaseOrderItem[]>([]);
  const order = ref<PurchaseOrderDetail | null>(null),
    rows = ref<ReceiptDraftRow[]>([]);
  const receivedAt = ref(''),
    handoverEvidence = ref(''),
    remark = ref('');
  const read = useLatestReadRequest(() => {
    loading.value = false;
  });
  const command = useProcurementCommand<ProcurementReceiptCommandResult>(async (result) => {
    visible.value = false;
    await onSaved(result.receiptId);
  }, '到货记录');
  let sequence = 0;
  const loadOrders = async (): Promise<void> => {
    if (!visible.value || order.value || !read.isActive()) return;
    const current = read.begin(() => visible.value && !order.value);
    loading.value = true;
    try {
      const result = await procurementApi.receiptOrderOptions(
        { keyword: keyword.value.trim() || undefined, page: page.value, pageSize: pageSize.value },
        current.signal,
      );
      if (current.isCurrent()) {
        orders.value = result.items;
        total.value = result.total;
      }
    } catch (error) {
      if (current.isCurrent()) EMessage.error(error, '可收货采购列表加载失败');
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  };
  const selectOrder = async (id: string): Promise<void> => {
    if (command.locked.value) return;
    const current = read.begin(() => visible.value);
    loading.value = true;
    try {
      const result = await procurementApi.receiptOrderDetail(id, current.signal);
      if (!current.isCurrent()) return;
      order.value = result;
      rows.value = result.items
        .filter((line) => line.status === 'open' && line.fulfillmentMode === 'new_arrival')
        .map((line) => ({
          key: ++sequence,
          line,
          receivedQuantity: undefined,
          supplierBatchCode: '',
          overReceiptNote: '',
        }));
      stale.value = false;
    } catch (error) {
      if (current.isCurrent()) EMessage.error(error, '采购收货依据加载失败');
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  };
  const checkOrder = async (beforeSubmit = false): Promise<boolean> => {
    const currentOrder = order.value;
    if (!currentOrder || !visible.value) return false;
    const current = read.begin(() => visible.value && order.value?.id === currentOrder.id);
    loading.value = true;
    try {
      const latest = await procurementApi.receiptOrderDetail(currentOrder.id, current.signal);
      if (!current.isCurrent()) return false;
      const latestLines = new Map(latest.items.map((line) => [line.id, line]));
      stale.value =
        latest.version !== currentOrder.version ||
        latest.status !== 'ordered' ||
        rows.value.some((row) => {
          const line = latestLines.get(row.line.id);
          return (
            !line ||
            line.version !== row.line.version ||
            line.status !== 'open' ||
            line.fulfillmentMode !== 'new_arrival'
          );
        });
      if (stale.value) return false;
      let quantitiesChanged = false;
      for (const row of rows.value) {
        const line = latestLines.get(row.line.id);
        if (!line) continue;
        quantitiesChanged ||=
          Number(line.quantities.receivedQuantity) !==
            Number(row.line.quantities.receivedQuantity) ||
          Number(line.quantities.inboundQuantity) !== Number(row.line.quantities.inboundQuantity);
        row.line = line;
      }
      order.value = latest;
      if (beforeSubmit && quantitiesChanged) {
        EMessage.warning('累计已到货或已入库数量已更新，本次输入已保留。请核对后再次确认。');
        return false;
      }
      return true;
    } catch (error) {
      if (current.isCurrent()) {
        stale.value = true;
        EMessage.error(error, '收货依据核对失败');
      }
      return false;
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  };
  const refreshQuantities = async (): Promise<void> => {
    if (!command.locked.value) await checkOrder();
  };
  const dirty = computed(() =>
    Boolean(
      handoverEvidence.value ||
      remark.value ||
      rows.value.some(
        (row) => row.receivedQuantity !== undefined || row.supplierBatchCode || row.overReceiptNote,
      ),
    ),
  );
  const activeRows = computed(() => rows.value.filter((row) => row.receivedQuantity !== undefined));
  const canConfirm = computed(() =>
    Boolean(
      order.value &&
      !stale.value &&
      !loading.value &&
      !command.locked.value &&
      receivedAt.value &&
      handoverEvidence.value.trim() &&
      activeRows.value.length &&
      activeRows.value.length <= 100 &&
      activeRows.value.every(
        (row) =>
          Number.isInteger(row.receivedQuantity) &&
          Number(row.receivedQuantity) > 0 &&
          Number(row.receivedQuantity) <= PURCHASE_ORDER_MAX_QUANTITY,
      ),
    ),
  );
  const open = async (orderId?: string): Promise<void> => {
    if (visible.value || command.locked.value) return;
    order.value = null;
    rows.value = [];
    keyword.value = '';
    page.value = 1;
    stale.value = false;
    receivedAt.value = new Date().toISOString();
    handoverEvidence.value = '';
    remark.value = '';
    visible.value = true;
    if (orderId) await selectOrder(orderId);
    else await loadOrders();
  };
  const close = async (): Promise<boolean> => {
    if (!(await command.canClose(dirty.value))) return false;
    visible.value = false;
    read.invalidate();
    return true;
  };
  const reselect = async (): Promise<void> => {
    if (command.locked.value) return;
    if (dirty.value) {
      try {
        await RouteMessageBox.confirm(
          '更换采购单将清空本次未确认的到货输入，确定继续吗？',
          '重新选择采购',
          { type: 'warning' },
        );
      } catch {
        return;
      }
    }
    order.value = null;
    rows.value = [];
    handoverEvidence.value = '';
    remark.value = '';
    stale.value = false;
    await loadOrders();
  };
  const split = (row: ReceiptDraftRow): void => {
    if (rows.value.length < 100)
      rows.value.push({
        key: ++sequence,
        line: row.line,
        receivedQuantity: undefined,
        supplierBatchCode: '',
        overReceiptNote: '',
      });
    else EMessage.warning('一次到货最多100条明细，请分次登记');
  };
  const confirm = async (): Promise<void> => {
    if (!canConfirm.value || !(await checkOrder(true)) || !order.value) return;
    const target = order.value;
    const body: ConfirmProcurementReceiptPayload = {
      purchaseOrderId: target.id,
      purchaseOrderVersion: target.version,
      receivedAt: receivedAt.value,
      handoverEvidence: handoverEvidence.value.trim(),
      remark: remark.value.trim() || null,
      details: activeRows.value.map((row) => ({
        purchaseOrderLineId: row.line.id,
        version: row.line.version,
        receivedQuantity: Number(row.receivedQuantity),
        supplierBatchCode: row.supplierBatchCode.trim() || null,
        overReceiptNote: row.overReceiptNote.trim() || null,
      })),
    };
    await command.run(
      { intentType: 'procurement.receipt.confirm', params: {}, query: {}, body },
      (key) => procurementApi.confirmReceipt(body, key),
      '实际到货已登记，质检后由库管核对正式清单，再办理入库',
    );
  };
  const search = async (): Promise<void> => {
    page.value = 1;
    await loadOrders();
  };
  const changePage = async (value: number): Promise<void> => {
    page.value = value;
    await loadOrders();
  };
  const changePageSize = async (value: number): Promise<void> => {
    pageSize.value = value;
    await search();
  };
  onActivated(() => {
    if (visible.value && !command.locked.value) {
      if (order.value) void checkOrder();
      else void loadOrders();
    }
  });
  return {
    visible,
    loading,
    stale,
    keyword,
    page,
    pageSize,
    total,
    orders,
    order,
    rows,
    receivedAt,
    handoverEvidence,
    remark,
    command,
    canConfirm,
    open,
    close,
    selectOrder,
    refreshQuantities,
    reselect,
    split,
    confirm,
    search,
    changePage,
    changePageSize,
  };
}
