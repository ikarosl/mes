import { computed, reactive, ref } from 'vue';
import type {
  ConfirmProcurementInboundPayload,
  ConfirmProcurementInboundResult,
  ProcurementInboundReleaseItem,
  InventoryInboundTarget,
} from '@company/contracts';
import { procurementInboundsApi } from '../../../api/procurement-inbounds';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { useProcurementCommand } from '../../procurement/composables/useProcurementCommand';
import { EMessage } from '../../../utils/message';

interface SelectedRelease {
  detailKey: string;
  target: InventoryInboundTarget;
  source: ProcurementInboundReleaseItem;
  quantity: number | undefined;
  error: string;
}

const sameBasis = (left: ProcurementInboundReleaseItem, right: ProcurementInboundReleaseItem) =>
  left.roundId === right.roundId &&
  left.roundVersion === right.roundVersion &&
  left.receiptLineVersion === right.receiptLineVersion &&
  left.receiptRevisionId === right.receiptRevisionId &&
  left.inspectionId === right.inspectionId &&
  left.allocationId === right.allocationId &&
  left.approvedRemainingQuantity === right.approvedRemainingQuantity;

/** 列表窗口与跨页已选独立；显式核对只替换同一范围依据，绝不换成拆分后的子范围。 */
export function usePurchaseInboundReleases(
  onConfirmed: (result: ConfirmProcurementInboundResult) => Promise<void>,
) {
  const query = reactive({ keyword: '', receiptLineId: '' });
  const rows = ref<ProcurementInboundReleaseItem[]>([]);
  const page = ref(1),
    pageSize = ref(10),
    total = ref(0),
    loading = ref(false);
  const selected = ref<SelectedRelease[]>([]),
    remark = ref(''),
    visible = ref(false);
  const checking = ref(false),
    checkError = ref('');
  const listRead = useLatestReadRequest(() => {
    loading.value = false;
  });
  const selectedRead = useLatestReadRequest(() => {
    checking.value = false;
  });
  const command = useProcurementCommand<ConfirmProcurementInboundResult>(async (result) => {
    selected.value = [];
    remark.value = '';
    visible.value = false;
    checkError.value = '';
    await Promise.all([load(), onConfirmed(result)]);
  }, '入库单');
  const locked = computed(() => command.locked.value || checking.value);
  const supplierId = computed(() => selected.value[0]?.source.supplierId);

  async function load(): Promise<void> {
    if (!listRead.isActive()) return;
    const current = listRead.begin();
    loading.value = true;
    try {
      const result = await procurementInboundsApi.releases(
        {
          page: page.value,
          pageSize: pageSize.value,
          keyword: query.keyword.trim() || undefined,
          receiptLineId: query.receiptLineId || undefined,
        },
        current.signal,
      );
      if (!current.isCurrent()) return;
      rows.value = result.items;
      total.value = result.total;
    } catch (error) {
      if (current.isCurrent()) EMessage.error(error, '放行范围加载失败');
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  }
  const search = async (): Promise<void> => {
    page.value = 1;
    await load();
  };
  const reset = async (): Promise<void> => {
    query.keyword = '';
    query.receiptLineId = '';
    await search();
  };
  const isSelected = (id: string): boolean =>
    selected.value.some((row) => row.source.allocationId === id);
  const toggle = (source: ProcurementInboundReleaseItem): void => {
    if (locked.value) return;
    if (isSelected(source.allocationId)) {
      selected.value = selected.value.filter(
        (row) => row.source.allocationId !== source.allocationId,
      );
      return;
    }
    if (supplierId.value && source.supplierId !== supplierId.value) {
      EMessage.warning('一张入库单只能选择同一供应商的放行范围');
      return;
    }
    if (selected.value.length >= 100) {
      EMessage.warning('一次最多选择 100 个范围');
      return;
    }
    selected.value.push({
      detailKey: crypto.randomUUID(),
      target: { mode: 'new', clientKey: crypto.randomUUID() },
      source: { ...source },
      quantity: Number(source.approvedRemainingQuantity),
      error: '',
    });
  };
  const remove = (detailKey: string): void => {
    if (!locked.value) selected.value = selected.value.filter((row) => row.detailKey !== detailKey);
  };
  const split = (detailKey: string): void => {
    if (locked.value || selected.value.length >= 100) return;
    const source = selected.value.find((row) => row.detailKey === detailKey);
    if (!source) return;
    selected.value.push({
      detailKey: crypto.randomUUID(),
      source: { ...source.source },
      quantity: 1,
      target: { mode: 'new', clientKey: crypto.randomUUID() },
      error: '',
    });
  };
  const relatedNewTargetsFor = (detailKey: string) => {
    const current = selected.value.find((row) => row.detailKey === detailKey);
    if (!current) return [];
    return selected.value.flatMap((row, index) =>
      row.detailKey !== detailKey &&
      row.source.materialVariantId === current.source.materialVariantId &&
      row.source.unit === current.source.unit &&
      row.target.mode === 'new'
        ? [
            {
              clientKey: row.target.clientKey,
              batchCode: row.target.batchCode,
              label: `第 ${index + 1} 条明细的新批次`,
            },
          ]
        : [],
    );
  };
  const validQuantities = (): boolean => {
    let valid = true;
    const sums = new Map<string, number>();
    for (const row of selected.value) {
      row.error = '';
      if (!Number.isSafeInteger(row.quantity) || Number(row.quantity) <= 0) {
        row.error = '请填写正整数';
        valid = false;
      } else {
        sums.set(
          row.source.allocationId,
          (sums.get(row.source.allocationId) ?? 0) + Number(row.quantity),
        );
      }
      if (row.target.mode === 'existing' && !row.target.batchId) {
        row.error = '请选择已有批次';
        valid = false;
      }
    }
    for (const row of selected.value) {
      if ((sums.get(row.source.allocationId) ?? 0) > Number(row.source.approvedRemainingQuantity)) {
        row.error = '同一授权的本次合计超过剩余量';
        valid = false;
      }
    }
    return valid;
  };
  const recheck = async (adopt = true): Promise<boolean> => {
    if (command.locked.value || !selected.value.length || checking.value) return false;
    const ids = [...new Set(selected.value.map((row) => row.source.allocationId))];
    const current = selectedRead.begin(
      () => ids.join(',') === selected.value.map((row) => row.source.allocationId).join(','),
    );
    checking.value = true;
    checkError.value = '';
    try {
      const result = await procurementInboundsApi.releases(
        { page: 1, pageSize: 100, allocationIds: ids },
        current.signal,
      );
      if (!current.isCurrent()) return false;
      const sources = new Map(result.items.map((item) => [item.allocationId, item]));
      let valid = true;
      for (const row of selected.value) {
        const source = sources.get(row.source.allocationId);
        row.error = '';
        if (!source) {
          row.error = '该范围当前不可入库，请移除后从最新放行清单重新选择';
          valid = false;
        } else if (!sameBasis(row.source, source) && !adopt) {
          row.error = '放行依据或剩余量已变化，请点击“重新核对已选”';
          valid = false;
        } else if (adopt) {
          row.source = { ...source };
        }
      }
      return validQuantities() && valid;
    } catch (error) {
      if (current.isCurrent())
        checkError.value = error instanceof Error ? error.message : '核对失败，请重试';
      return false;
    } finally {
      if (current.isCurrent()) checking.value = false;
    }
  };
  const open = (): void => {
    if (!selected.value.length) return;
    visible.value = true;
    if (!command.locked.value) void recheck(false);
  };
  const submit = async (): Promise<void> => {
    if (locked.value || !(await recheck(false))) return;
    const body: ConfirmProcurementInboundPayload = {
      remark: remark.value.trim() || null,
      details: selected.value.map(({ detailKey, source, quantity, target }) => ({
        detailKey,
        target,
        receiptLineId: source.receiptLineId,
        roundId: source.roundId,
        roundVersion: source.roundVersion,
        version: source.receiptLineVersion,
        receiptRevisionId: source.receiptRevisionId,
        inspectionId: source.inspectionId,
        allocationId: source.allocationId,
        quantity: Number(quantity),
      })),
    };
    await command.run(
      { intentType: 'procurement.purchase-inbound.confirm', params: {}, query: {}, body },
      (key) => procurementInboundsApi.confirm(body, key),
      '外购物料已确认入库',
    );
  };
  const clear = async (): Promise<boolean> => {
    if (checking.value || !(await command.canClose(selected.value.length > 0 || !!remark.value)))
      return false;
    selectedRead.invalidate();
    selected.value = [];
    remark.value = '';
    checkError.value = '';
    visible.value = false;
    return true;
  };
  const close = async (): Promise<void> => {
    // 普通关闭保留核对草稿；未知结果须显式核对并放弃后才能关闭。
    if (command.locked.value) {
      if (await clear()) visible.value = false;
      return;
    }
    if (!checking.value) visible.value = false;
  };
  return {
    query,
    rows,
    page,
    pageSize,
    total,
    loading,
    selected,
    remark,
    visible,
    checking,
    checkError,
    command,
    locked,
    supplierId,
    load,
    search,
    reset,
    isSelected,
    toggle,
    remove,
    split,
    relatedNewTargetsFor,
    recheck,
    open,
    submit,
    clear,
    close,
  };
}
