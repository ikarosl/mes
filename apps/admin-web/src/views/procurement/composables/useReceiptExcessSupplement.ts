import { computed, onActivated, ref } from 'vue';
import type {
  PurchaseExcessReceiptCandidate,
  PurchaseOrderDetail,
  PurchaseOrderLine,
} from '@company/contracts';
import { PURCHASE_ORDER_MAX_QUANTITY } from '@company/constants';
import { procurementApi } from '../../../api/procurement';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';
import { useProcurementCommand } from './useProcurementCommand';

export function useReceiptExcessSupplement(onSaved: (id: string) => void) {
  const visible = ref(false),
    order = ref<PurchaseOrderDetail | null>(null),
    line = ref<PurchaseOrderLine | null>(null),
    selected = ref<PurchaseExcessReceiptCandidate | null>(null),
    selectedId = ref(''),
    rows = ref<PurchaseExcessReceiptCandidate[]>([]),
    loading = ref(false),
    readError = ref(false),
    page = ref(1),
    pageSize = ref(10),
    total = ref(0),
    quantity = ref<number | undefined>(),
    evidence = ref(''),
    remark = ref('');
  const read = useLatestReadRequest(() => {
    loading.value = false;
  });
  const command = useProcurementCommand((result) => {
    visible.value = false;
    read.invalidate();
    onSaved(result.purchaseOrderId);
  });
  const canSave = computed(
    () =>
      !command.locked.value &&
      !loading.value &&
      !readError.value &&
      Boolean(selected.value) &&
      Number.isInteger(quantity.value) &&
      Number(quantity.value) > 0 &&
      Number(quantity.value) <= PURCHASE_ORDER_MAX_QUANTITY &&
      Boolean(evidence.value.trim()),
  );
  const load = async (): Promise<boolean> => {
    if (!visible.value || !line.value || !read.isActive() || command.locked.value) return false;
    const target = line.value.id,
      receiptId = selectedId.value;
    const current = read.begin(
      () => visible.value && line.value?.id === target && selectedId.value === receiptId,
    );
    loading.value = true;
    try {
      const result = await procurementApi.excessReceiptCandidates(
        target,
        {
          page: receiptId ? 1 : page.value,
          pageSize: receiptId ? 1 : pageSize.value,
          receiptLineId: receiptId || undefined,
        },
        current.signal,
      );
      if (!current.isCurrent()) return false;
      if (receiptId) {
        const candidate = result.items.find((item) => item.id === receiptId);
        readError.value = !candidate;
        if (!candidate) {
          EMessage.warning('所选到货明细不属于当前采购行或已不可读取，请重新选择到货');
          return false;
        }
        selected.value = candidate;
      } else {
        rows.value = result.items;
        total.value = result.total;
        readError.value = false;
      }
      return true;
    } catch (error) {
      if (current.isCurrent()) {
        readError.value = true;
        EMessage.error(error, '补单到货依据读取失败');
      }
      return false;
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  };
  const clearForm = (): void => {
    quantity.value = undefined;
    evidence.value = '';
    remark.value = '';
  };
  const open = async (
    source: PurchaseOrderDetail,
    lineId: string,
    receiptLineId?: string,
  ): Promise<boolean> => {
    if (visible.value || command.locked.value) return false;
    const sourceLine = source.items.find((item) => item.id === lineId);
    if (!sourceLine || !source.orderedAt || sourceLine.fulfillmentMode !== 'new_arrival') {
      EMessage.warning('请选择已下单且有实际到货的原采购行');
      return false;
    }
    order.value = source;
    line.value = sourceLine;
    selected.value = null;
    selectedId.value = receiptLineId ?? '';
    rows.value = [];
    total.value = 0;
    page.value = 1;
    readError.value = false;
    clearForm();
    visible.value = true;
    await load();
    return true;
  };
  const select = async (candidate: PurchaseExcessReceiptCandidate): Promise<void> => {
    if (loading.value || readError.value || command.locked.value) return;
    selectedId.value = candidate.id;
    selected.value = candidate;
    await load();
  };
  const reselect = async (): Promise<void> => {
    if (
      command.locked.value ||
      !(await command.canClose(Boolean(quantity.value || evidence.value || remark.value)))
    )
      return;
    selectedId.value = '';
    selected.value = null;
    clearForm();
    await load();
  };
  const close = async (): Promise<boolean> => {
    if (!(await command.canClose(Boolean(quantity.value || evidence.value || remark.value))))
      return false;
    visible.value = false;
    read.invalidate();
    return true;
  };
  const save = async (): Promise<void> => {
    if (!canSave.value || !selected.value) return;
    const displayed = {
      receivedQuantity: selected.value.receivedQuantity,
      unprocessedQuantity: selected.value.unprocessedQuantity,
    };
    if (!(await load()) || !canSave.value || !line.value || !selected.value) return;
    if (
      selected.value.receivedQuantity !== displayed.receivedQuantity ||
      selected.value.unprocessedQuantity !== displayed.unprocessedQuantity
    ) {
      EMessage.warning('到货核实总量或未处置量已变化，当前输入已保留。请核对最新数量后再次确认');
      return;
    }
    const id = line.value.id;
    const body = {
      supplementReason: 'excess_purchase' as const,
      originReceiptLineId: selected.value.id,
      plannedQuantity: Number(quantity.value),
      supplementEvidence: evidence.value.trim(),
      remark: remark.value.trim() || null,
    };
    await command.run(
      { intentType: 'procurement.order.excess-supplement', params: { id }, query: {}, body },
      (key) => procurementApi.createSupplement(id, body, key),
      '承接到货的补单草稿已创建，请正式下单后由库管关联到货定稿',
    );
  };
  const changePage = async (value: number): Promise<void> => {
    page.value = value;
    await load();
  };
  const changePageSize = async (value: number): Promise<void> => {
    pageSize.value = value;
    page.value = 1;
    await load();
  };
  onActivated(() => {
    if (visible.value && !command.locked.value) void load();
  });
  return {
    visible,
    order,
    line,
    selected,
    selectedId,
    rows,
    loading,
    readError,
    page,
    pageSize,
    total,
    quantity,
    evidence,
    remark,
    command,
    canSave,
    open,
    close,
    load,
    select,
    reselect,
    save,
    changePage,
    changePageSize,
  };
}
