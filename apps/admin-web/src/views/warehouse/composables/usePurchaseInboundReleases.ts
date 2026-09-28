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
import { RouteMessageBox } from '../../../utils/route-message-box';
import { parseInboundQuantity } from '../inbound-quantity';

interface SelectedRelease {
  detailKey: string;
  target: InventoryInboundTarget;
  source: ProcurementInboundReleaseItem;
  quantity: string;
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
    loading = ref(false),
    loadError = ref(''),
    hasLoaded = ref(false);
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
  const groupSummaries = computed(() => {
    const groups = new Map<
      string,
      { source: ProcurementInboundReleaseItem; total: number; valid: boolean; count: number }
    >();
    for (const row of selected.value) {
      const id = row.source.allocationId;
      const group = groups.get(id) ?? { source: row.source, total: 0, valid: true, count: 0 };
      const quantity = parseInboundQuantity(row.quantity);
      group.source = row.source;
      group.count++;
      if (quantity === null) group.valid = false;
      else group.total += quantity;
      groups.set(id, group);
    }
    return [...groups.values()].map((group) => ({
      ...group,
      allowance: Number(group.source.approvedRemainingQuantity),
      after: Number(group.source.approvedRemainingQuantity) - group.total,
    }));
  });
  const quantityErrors = computed(() => {
    const errors = new Map<string, string>();
    const newBatchCodes = new Map<string, string>();
    for (const row of selected.value) {
      if (parseInboundQuantity(row.quantity) === null)
        errors.set(row.detailKey, '请输入 1～99999999 的正整数');
      else if (row.target.mode === 'existing' && !row.target.batchId)
        errors.set(row.detailKey, '请选择已有批次');
      else if (row.target.mode === 'new' && !row.target.clientKey)
        errors.set(row.detailKey, '请选择本次复用的新批次');
      if (row.target.mode === 'new' && row.target.batchCode?.trim()) {
        const codeKey = `${row.source.materialVariantId}:${row.target.batchCode.trim().toLocaleLowerCase()}`;
        const existingKey = newBatchCodes.get(codeKey);
        if (existingKey && existingKey !== row.target.clientKey)
          errors.set(row.detailKey, '新批号重复；如需共建，请明确选择“复用本次新批次”');
        newBatchCodes.set(codeKey, row.target.clientKey);
      }
    }
    for (const group of groupSummaries.value) {
      if (group.total > group.allowance) {
        for (const row of selected.value.filter(
          (item) => item.source.allocationId === group.source.allocationId,
        ))
          errors.set(row.detailKey, '本次合计超过该授权剩余额度');
      }
    }
    return errors;
  });
  const canSubmit = computed(
    () =>
      selected.value.length > 0 &&
      !quantityErrors.value.size &&
      !selected.value.some((row) => row.error),
  );

  async function load(): Promise<void> {
    if (!listRead.isActive()) return;
    const current = listRead.begin();
    loading.value = true;
    loadError.value = '';
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
      hasLoaded.value = true;
    } catch (error) {
      if (current.isCurrent()) {
        loadError.value = '放行范围读取失败，请重试';
        EMessage.error(error, '放行范围加载失败');
      }
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
  const toggle = async (source: ProcurementInboundReleaseItem): Promise<void> => {
    if (locked.value) return;
    if (isSelected(source.allocationId)) {
      const targetCount = selected.value.filter(
        (row) => row.source.allocationId === source.allocationId,
      ).length;
      if (targetCount > 1) {
        try {
          await RouteMessageBox.confirm(
            `取消整份授权将移除 ${targetCount} 条目标明细，确定继续吗？`,
            '取消已选授权',
            { type: 'warning', confirmButtonText: '移除整份授权' },
          );
        } catch {
          return;
        }
      }
      if (locked.value) return;
      // Candidate deselection removes its whole authorization; row removal below removes one target.
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
      quantity: source.approvedRemainingQuantity,
      error: '',
    });
  };
  const remove = (detailKey: string): void => {
    if (!locked.value) selected.value = selected.value.filter((row) => row.detailKey !== detailKey);
  };
  const split = (detailKey: string, splitQuantity: number): void => {
    if (locked.value || selected.value.length >= 100) return;
    const source = selected.value.find((row) => row.detailKey === detailKey);
    const originalQuantity = source ? parseInboundQuantity(source.quantity) : null;
    if (
      !source ||
      originalQuantity === null ||
      splitQuantity < 1 ||
      splitQuantity >= originalQuantity
    )
      return;
    source.quantity = String(originalQuantity - splitQuantity);
    selected.value.push({
      detailKey: crypto.randomUUID(),
      source: { ...source.source },
      quantity: String(splitQuantity),
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
              label: `${row.source.receiptNo} · ${row.source.itemCode} · 第 ${index + 1} 条目标`,
            },
          ]
        : [],
    );
  };
  const isNewBatchOwnerFor = (detailKey: string): boolean => {
    const row = selected.value.find((item) => item.detailKey === detailKey);
    if (!row || row.target.mode !== 'new') return false;
    const clientKey = row.target.clientKey;
    return (
      selected.value.find(
        (item) => item.target.mode === 'new' && item.target.clientKey === clientKey,
      )?.detailKey === detailKey
    );
  };
  const validQuantities = (): boolean => canSubmit.value;
  const recheck = async (adopt = true): Promise<boolean> => {
    if (command.locked.value || !selected.value.length || checking.value) return false;
    const ids = [...new Set(selected.value.map((row) => row.source.allocationId))];
    const current = selectedRead.begin(
      () =>
        ids.join(',') ===
        [...new Set(selected.value.map((row) => row.source.allocationId))].join(','),
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
      const refreshed = new Map<string, ProcurementInboundReleaseItem>();
      for (const row of selected.value) {
        const source = sources.get(row.source.allocationId);
        row.error = '';
        if (!source) {
          row.error = '该范围当前不可入库，请移除后从最新放行清单重新选择';
          valid = false;
        } else if (!sameBasis(row.source, source) && !adopt) {
          row.error = '放行依据或剩余量已变化，请点击“重新核对已选”';
          valid = false;
        } else if (adopt) refreshed.set(row.source.allocationId, source);
      }
      if (valid && adopt)
        for (const row of selected.value) {
          const source = refreshed.get(row.source.allocationId);
          if (source) row.source = { ...source };
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
    if (locked.value || !validQuantities() || !(await recheck(false))) return;
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
    loadError,
    hasLoaded,
    selected,
    remark,
    visible,
    checking,
    checkError,
    command,
    locked,
    supplierId,
    groupSummaries,
    quantityErrors,
    canSubmit,
    load,
    search,
    reset,
    isSelected,
    toggle,
    remove,
    split,
    relatedNewTargetsFor,
    isNewBatchOwnerFor,
    recheck,
    open,
    submit,
    clear,
    close,
  };
}
