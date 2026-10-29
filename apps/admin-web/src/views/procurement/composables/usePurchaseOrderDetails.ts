import { computed, ref } from 'vue';
import type {
  CorrectPurchaseOrderAmountsPayload,
  PurchaseOrderDetail,
  PurchaseOrderLine,
} from '@company/contracts';
import { CONCURRENCY_ERROR_CODES, PURCHASE_ORDER_MAX_LINES } from '@company/constants';
import { RequestError } from '@company/request';
import { procurementApi } from '../../../api/procurement';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';
import { previewPurchaseLineAmount } from '../purchase-line-amount';
import { useProcurementCommand } from './useProcurementCommand';

interface PurchaseOrderAmountRow {
  line: PurchaseOrderLine;
  taxExclusiveAmount: string;
  taxInclusiveAmount: string;
  taxRatePercent: string;
  manualTotalAmount: string;
  initialTaxExclusiveAmount: string | null;
  initialTaxInclusiveAmount: string | null;
  initialTaxRatePercent: string;
  initialManualTotalAmount: string | null;
}

// 物流和需求剩余量只供展示，不参与金额更正的冻结依据。
const orderSignature = (order: PurchaseOrderDetail): string =>
  JSON.stringify({
    id: order.id,
    version: order.version,
    purchaseNo: order.purchaseNo,
    status: order.status,
    supplierId: order.supplierId,
    supplierName: order.supplierName,
    sourceType: order.sourceType,
    supplementReason: order.supplementReason,
    workOrderId: order.workOrderId,
    remark: order.remark,
    orderedAt: order.orderedAt,
    items: order.items.map((line) => ({
      id: line.id,
      version: line.version,
      status: line.status,
      itemId: line.itemId,
      materialVariantId: line.materialVariantId,
      plannedQuantity: line.plannedQuantity,
      unit: line.unit,
      fulfillmentMode: line.fulfillmentMode,
      taxExclusiveAmount: line.taxExclusiveAmount,
      taxInclusiveAmount: line.taxInclusiveAmount,
      taxRatePercent: line.taxRatePercent,
      totalAmount: line.totalAmount,
      totalAmountSource: line.totalAmountSource,
      originOrderLineId: line.originOrderLineId,
      originReceiptLineId: line.originReceiptLineId,
      demandIds: line.sources.map((source) => source.demandId),
    })),
  });

export function usePurchaseOrderDetails(onChanged: (id: string) => void | Promise<void>) {
  const visible = ref(false),
    loading = ref(false),
    readError = ref(false),
    stale = ref(false),
    orderId = ref(''),
    order = ref<PurchaseOrderDetail | null>(null),
    rows = ref<PurchaseOrderAmountRow[]>([]),
    reason = ref('');
  const read = useLatestReadRequest(() => {
    loading.value = false;
  });
  const command = useProcurementCommand(async (result) => {
    visible.value = false;
    read.invalidate();
    await onChanged(result.purchaseOrderId);
  });
  const eligible = computed(
    () => order.value?.status === 'ordered' || order.value?.status === 'completed',
  );
  const canEditRow = (row: PurchaseOrderAmountRow): boolean =>
    eligible.value && (row.line.status === 'open' || row.line.status === 'closed');
  const preview = (row: PurchaseOrderAmountRow) =>
    previewPurchaseLineAmount({
      plannedQuantity: row.line.plannedQuantity,
      taxExclusiveAmount: row.taxExclusiveAmount,
      taxInclusiveAmount: row.taxInclusiveAmount,
      taxRatePercent: row.taxRatePercent,
      manualTotalAmount: row.manualTotalAmount,
    });
  const rowChanged = (row: PurchaseOrderAmountRow): boolean => {
    const amount = preview(row).amount;
    if (!amount)
      return (
        (row.taxExclusiveAmount.trim() || null) !== row.initialTaxExclusiveAmount ||
        (row.taxInclusiveAmount.trim() || null) !== row.initialTaxInclusiveAmount ||
        row.taxRatePercent.trim() !== row.initialTaxRatePercent ||
        row.manualTotalAmount.trim() !== (row.initialManualTotalAmount ?? '')
      );
    return (
      amount.taxExclusiveAmount !== row.initialTaxExclusiveAmount ||
      amount.taxInclusiveAmount !== row.initialTaxInclusiveAmount ||
      amount.taxRatePercent !== row.initialTaxRatePercent ||
      amount.manualTotalAmount !== row.initialManualTotalAmount
    );
  };
  const changedRows = computed(() => rows.value.filter(rowChanged));
  const dirty = computed(() => changedRows.value.length > 0 || Boolean(reason.value.trim()));
  const canSave = computed(
    () =>
      visible.value &&
      read.isActive() &&
      !loading.value &&
      !readError.value &&
      !stale.value &&
      !command.locked.value &&
      eligible.value &&
      changedRows.value.length > 0 &&
      changedRows.value.length <= PURCHASE_ORDER_MAX_LINES &&
      changedRows.value.every((row) => canEditRow(row) && preview(row).amount !== null) &&
      Boolean(reason.value.trim()) &&
      reason.value.trim().length <= 2000,
  );
  const load = async (): Promise<boolean> => {
    if (!visible.value || !orderId.value || !read.isActive() || command.locked.value) return false;
    const targetId = orderId.value;
    const current = read.begin(() => visible.value && orderId.value === targetId);
    loading.value = true;
    try {
      const latest = await procurementApi.getOrder(targetId, current.signal);
      if (!current.isCurrent()) return false;
      readError.value = false;
      if (order.value) {
        if (orderSignature(latest) !== orderSignature(order.value)) stale.value = true;
      } else {
        order.value = latest;
        rows.value = latest.items.map((line) => {
          const amountDraft: PurchaseOrderAmountRow = {
            line,
            taxExclusiveAmount: line.taxExclusiveAmount ?? '',
            taxInclusiveAmount: line.taxInclusiveAmount ?? '',
            taxRatePercent: line.taxRatePercent,
            manualTotalAmount: line.totalAmountSource === 'manual' ? (line.totalAmount ?? '') : '',
            initialTaxExclusiveAmount: null,
            initialTaxInclusiveAmount: null,
            initialTaxRatePercent: line.taxRatePercent,
            initialManualTotalAmount: null,
          };
          const amount = preview(amountDraft).amount;
          amountDraft.taxRatePercent = amount?.taxRatePercent ?? line.taxRatePercent;
          amountDraft.initialTaxExclusiveAmount = amount?.taxExclusiveAmount ?? null;
          amountDraft.initialTaxInclusiveAmount = amount?.taxInclusiveAmount ?? null;
          amountDraft.initialTaxRatePercent = amountDraft.taxRatePercent;
          amountDraft.initialManualTotalAmount = amount?.manualTotalAmount ?? null;
          return amountDraft;
        });
      }
      return !stale.value;
    } catch (error) {
      if (current.isCurrent()) {
        readError.value = true;
        EMessage.error(error, '采购单读取失败，请重试');
      }
      return false;
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  };
  const close = async (): Promise<boolean> => {
    if (!visible.value) return true;
    if (!(await command.canClose(dirty.value))) return false;
    visible.value = false;
    read.invalidate();
    return true;
  };
  // 草稿交回已有完整编辑器；正式单的详情和金额草稿由此处独立持有。
  const open = async (targetId: string): Promise<PurchaseOrderDetail | null> => {
    if (!read.isActive() || command.locked.value || (visible.value && !(await close())))
      return null;
    read.invalidate();
    orderId.value = targetId;
    order.value = null;
    rows.value = [];
    reason.value = '';
    readError.value = false;
    stale.value = false;
    visible.value = true;
    if (!(await load()) || !visible.value || orderId.value !== targetId || !read.isActive())
      return null;
    const latest = order.value as PurchaseOrderDetail | null;
    if (latest?.status === 'draft') {
      visible.value = false;
      read.invalidate();
    }
    return latest;
  };
  const save = async (): Promise<void> => {
    if (!canSave.value || !(await load()) || !canSave.value || !order.value) return;
    const targetId = order.value.id;
    const items: CorrectPurchaseOrderAmountsPayload['items'] = [];
    for (const row of changedRows.value) {
      const amount = preview(row).amount;
      if (!amount) return;
      items.push({
        id: row.line.id,
        version: row.line.version,
        taxExclusiveAmount: amount.taxExclusiveAmount,
        taxInclusiveAmount: amount.taxInclusiveAmount,
        taxRatePercent: amount.taxRatePercent,
        manualTotalAmount: amount.manualTotalAmount,
      });
    }
    const body: CorrectPurchaseOrderAmountsPayload = {
      version: order.value.version,
      items,
      reason: reason.value.trim(),
    };
    await command.run(
      {
        intentType: 'procurement.order.correct-amounts',
        params: { id: targetId },
        query: {},
        body,
      },
      async (key) => {
        try {
          return await procurementApi.correctOrderAmounts(targetId, body, key);
        } catch (error) {
          if (
            error instanceof RequestError &&
            error.code === CONCURRENCY_ERROR_CODES.concurrentModification
          )
            stale.value = true;
          throw error;
        }
      },
      '采购单金额已保存',
    );
  };
  return {
    visible,
    loading,
    readError,
    stale,
    order,
    rows,
    reason,
    command,
    eligible,
    changedRows,
    canEditRow,
    canSave,
    open,
    close,
    load,
    save,
  };
}
