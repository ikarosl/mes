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
    for (const row of selected.value) {
      if (parseInboundQuantity(row.quantity) === null)
        errors.set(row.detailKey, '请输入 1～99999999 的正整数');
      else if (row.target.mode === 'existing' && !row.target.batchId)
        errors.set(row.detailKey, '请选择已有批次');
      else if (row.target.mode === 'new' && !row.target.clientKey)
        errors.set(row.detailKey, '新建批次目标无效，请重新选择');
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
  const pageGroupIds = (sources: ProcurementInboundReleaseItem[]): Set<string> =>
    new Set(sources.map((source) => source.allocationId));
  const isPageGroupSelected = (sources: ProcurementInboundReleaseItem[]): boolean =>
    sources.length > 0 && sources.every((source) => isSelected(source.allocationId));
  const isPageGroupPartSelected = (sources: ProcurementInboundReleaseItem[]): boolean =>
    sources.some((source) => isSelected(source.allocationId));
  const hasSelectionOutsidePageGroup = (sources: ProcurementInboundReleaseItem[]): boolean => {
    const ids = pageGroupIds(sources);
    return selected.value.some((row) => !ids.has(row.source.allocationId));
  };
  const addPageGroup = (sources: ProcurementInboundReleaseItem[]): boolean => {
    if (locked.value || !sources.length) return false;
    const missing = [
      ...new Map(
        sources
          .filter((source) => !isSelected(source.allocationId))
          .map((source) => [source.allocationId, source]),
      ).values(),
    ];
    if (selected.value.length + missing.length > 100) {
      EMessage.warning('一次最多包含 100 条目标明细，请减少已选范围或另单办理');
      return false;
    }
    selected.value = [
      ...selected.value,
      ...missing.map((source) => ({
        detailKey: crypto.randomUUID(),
        target: { mode: 'new' as const, clientKey: crypto.randomUUID() },
        source: { ...source },
        quantity: source.approvedRemainingQuantity,
        error: '',
      })),
    ];
    return true;
  };
  const togglePageGroup = async (sources: ProcurementInboundReleaseItem[]): Promise<void> => {
    if (locked.value || !sources.length) return;
    if (!isPageGroupSelected(sources)) {
      addPageGroup(sources);
      return;
    }
    const ids = pageGroupIds(sources);
    const affected = selected.value.filter((row) => ids.has(row.source.allocationId));
    const selectedCounts = new Map<string, number>();
    for (const row of affected)
      selectedCounts.set(
        row.source.allocationId,
        (selectedCounts.get(row.source.allocationId) ?? 0) + 1,
      );
    if ([...selectedCounts.values()].some((count) => count > 1)) {
      try {
        await RouteMessageBox.confirm(
          `取消本页该组选择将移除 ${affected.length} 条目标明细（含拆分草稿），确定继续吗？`,
          '取消本组选中',
          { type: 'warning', confirmButtonText: '移除本组目标' },
        );
      } catch {
        return;
      }
    }
    if (locked.value) return;
    selected.value = selected.value.filter((row) => !ids.has(row.source.allocationId));
  };
  const reviewPageGroup = (sources: ProcurementInboundReleaseItem[]): void => {
    if (addPageGroup(sources)) open();
  };
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
    groupSummaries,
    quantityErrors,
    canSubmit,
    load,
    search,
    reset,
    isSelected,
    isPageGroupSelected,
    isPageGroupPartSelected,
    hasSelectionOutsidePageGroup,
    togglePageGroup,
    reviewPageGroup,
    toggle,
    remove,
    split,
    recheck,
    open,
    submit,
    clear,
    close,
  };
}
