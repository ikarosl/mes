import { computed, ref } from 'vue';
import type {
  ConfirmProcurementReceiptPayload,
  ProcurementReceiptCommandResult,
  ProcurementReceiptOrderOption,
  PurchaseOrderDetail,
  PurchaseOrderLine,
} from '@company/contracts';
import { toBeijingISOString } from '@company/utils';
import { procurementApi } from '../../../api/procurement';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { useProcurementCommand } from './useProcurementCommand';

interface ReceiptDraftRow {
  line: PurchaseOrderLine;
  selected: boolean;
}

export function useReceiptEditor(onSaved: (id: string) => void | Promise<void>) {
  const visible = ref(false),
    loading = ref(false),
    stale = ref(false);
  const keyword = ref(''),
    page = ref(1),
    pageSize = ref(10),
    total = ref(0);
  const orders = ref<ProcurementReceiptOrderOption[]>([]);
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
  const activeRows = computed(() => rows.value.filter((row) => row.selected));
  const dirty = computed(() =>
    Boolean(handoverEvidence.value || remark.value || rows.value.some((row) => row.selected)),
  );
  async function loadOrders(): Promise<void> {
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
      if (current.isCurrent()) EMessage.error(error, '可登记到货的采购单加载失败');
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  }
  async function selectOrder(id: string): Promise<void> {
    if (command.locked.value) return;
    const current = read.begin(() => visible.value);
    loading.value = true;
    try {
      const result = await procurementApi.receiptOrderDetail(id, current.signal);
      if (!current.isCurrent()) return;
      order.value = result;
      rows.value = result.items
        .filter((line) => line.status === 'open' && line.fulfillmentMode === 'new_arrival')
        .map((line) => ({ line, selected: false }));
      stale.value = false;
    } catch (error) {
      if (current.isCurrent()) EMessage.error(error, '采购到货依据加载失败');
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  }
  async function checkOrder(): Promise<boolean> {
    const source = order.value;
    if (!source || !visible.value) return false;
    const current = read.begin(() => visible.value && order.value?.id === source.id);
    loading.value = true;
    try {
      const latest = await procurementApi.receiptOrderDetail(source.id, current.signal);
      if (!current.isCurrent()) return false;
      const byId = new Map(latest.items.map((line) => [line.id, line]));
      stale.value =
        latest.version !== source.version ||
        latest.status !== 'ordered' ||
        activeRows.value.some((row) => {
          const line = byId.get(row.line.id);
          return (
            !line ||
            line.version !== row.line.version ||
            line.status !== 'open' ||
            line.fulfillmentMode !== 'new_arrival'
          );
        });
      return !stale.value;
    } catch (error) {
      if (current.isCurrent()) {
        stale.value = true;
        EMessage.error(error, '到货依据核对失败');
      }
      return false;
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  }
  const canConfirm = computed(() =>
    Boolean(
      order.value &&
      receivedAt.value &&
      !stale.value &&
      !loading.value &&
      !command.locked.value &&
      activeRows.value.length > 0 &&
      activeRows.value.length <= 100,
    ),
  );
  async function open(orderId?: string): Promise<void> {
    if (visible.value || command.locked.value) return;
    order.value = null;
    rows.value = [];
    keyword.value = '';
    page.value = 1;
    stale.value = false;
    receivedAt.value = toBeijingISOString(Date.now());
    handoverEvidence.value = '';
    remark.value = '';
    visible.value = true;
    if (orderId) await selectOrder(orderId);
    else await loadOrders();
  }
  async function close(): Promise<boolean> {
    if (!(await command.canClose(dirty.value))) return false;
    visible.value = false;
    read.invalidate();
    return true;
  }
  async function reselect(): Promise<void> {
    if (command.locked.value) return;
    if (dirty.value) {
      try {
        await RouteMessageBox.confirm(
          '更换采购单将清空本次未确认的到货输入，确定继续吗？',
          '更换采购单',
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
  }
  async function confirm(): Promise<void> {
    if (!canConfirm.value || !(await checkOrder()) || !order.value) return;
    const source = order.value;
    const body: ConfirmProcurementReceiptPayload = {
      purchaseOrderId: source.id,
      purchaseOrderVersion: source.version,
      receivedAt: toBeijingISOString(receivedAt.value),
      handoverEvidence: handoverEvidence.value.trim(),
      remark: remark.value.trim() || null,
      details: activeRows.value.map(({ line }) => ({
        purchaseOrderLineId: line.id,
        version: line.version,
      })),
    };
    await command.run(
      { intentType: 'procurement.receipt.confirm', params: {}, query: {}, body },
      (key) => procurementApi.confirmReceipt(body, key),
      '到货已登记，可分别办理实际入库和进料检验报告',
    );
  }
  async function search(): Promise<void> {
    page.value = 1;
    await loadOrders();
  }
  async function changePage(value: number): Promise<void> {
    page.value = value;
    await loadOrders();
  }
  async function changePageSize(value: number): Promise<void> {
    pageSize.value = value;
    await search();
  }
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
    reselect,
    confirm,
    search,
    changePage,
    changePageSize,
    checkOrder,
  };
}
