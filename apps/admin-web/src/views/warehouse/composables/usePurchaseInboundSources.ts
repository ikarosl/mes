import { computed, reactive, ref } from 'vue';
import { RequestError } from '@company/request';
import type {
  ConfirmProcurementInboundPayload,
  ConfirmProcurementInboundResult,
  ProcurementInboundSourceItem,
  InventoryInboundTarget,
} from '@company/contracts';
import { procurementInboundsApi } from '../../../api/procurement-inbounds';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { useProcurementCommand } from '../../procurement/composables/useProcurementCommand';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { parseInboundQuantity } from '../inbound-quantity';
import {
  buildInboundNewBatchGroups,
  inboundBatchIdentityKey,
  type InboundNewBatchGroup,
} from '../inbound-new-batch-groups';

interface SelectedSource {
  rowKey: string;
  target: InventoryInboundTarget;
  source: ProcurementInboundSourceItem;
  quantity: string;
  error: string;
}

const sameBasis = (
  left: ProcurementInboundSourceItem,
  right: ProcurementInboundSourceItem,
): boolean =>
  left.receiptLineId === right.receiptLineId &&
  left.receiptLineVersion === right.receiptLineVersion;

/** 列表窗口与跨页已选独立；显式核对只替换同一明细依据，绝不换成拆分后的子明细。 */
export function usePurchaseInboundSources(
  onConfirmed: (result: ConfirmProcurementInboundResult) => Promise<void>,
) {
  const query = reactive({ keyword: '', receiptLineId: '' });
  const rows = ref<ProcurementInboundSourceItem[]>([]);
  const page = ref(1),
    pageSize = ref(10),
    total = ref(0),
    loading = ref(false),
    loadError = ref(''),
    hasLoaded = ref(false);
  const selected = ref<SelectedSource[]>([]),
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
  const batchIdentity = (source: ProcurementInboundSourceItem): string =>
    inboundBatchIdentityKey({
      itemKind: 'material',
      itemId: source.itemId,
      materialVariantId: source.materialVariantId,
      unit: source.unit,
    });
  // TODO(high-priority-warehouse-tests): 用户确认设计并明确授权后，补齐先入后检、独立说明与正量入库、跨来源共批、并发版本与未知结果恢复测试。
  const newBatchGroups = computed(() =>
    buildInboundNewBatchGroups(selected.value, (row) => batchIdentity(row.source)),
  );
  const newBatchChoices = (source: ProcurementInboundSourceItem): InboundNewBatchGroup[] =>
    newBatchGroups.value.filter(
      (group) => !group.hasConflictingIdentity && group.identityKey === batchIdentity(source),
    );
  const groupSummaries = computed(() => {
    const groups = new Map<
      string,
      { source: ProcurementInboundSourceItem; total: number; valid: boolean; count: number }
    >();
    for (const row of selected.value) {
      const id = row.source.receiptLineId;
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
    }));
  });
  const quantityErrors = computed(() => {
    const errors = new Map<string, string>();
    const conflictingKeys = new Set(
      newBatchGroups.value
        .filter((group) => group.hasConflictingIdentity)
        .map((group) => group.value),
    );
    for (const row of selected.value) {
      const quantity = parseInboundQuantity(row.quantity);
      if (quantity === null) errors.set(row.rowKey, '请输入 1～99999999 的正整数');
      else if (row.target.mode === 'existing' && !row.target.batchId)
        errors.set(row.rowKey, '请选择已有批次');
      else if (row.target.mode === 'new' && !row.target.clientKey)
        errors.set(row.rowKey, '新建批次目标无效，请重新选择');
      else if (row.target.mode === 'new' && conflictingKeys.has(row.target.clientKey))
        errors.set(row.rowKey, '共用新批次须为同一物料、精确版本及单位，请重新选择目标');
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
      const result = await procurementInboundsApi.sources(
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
        loadError.value = '到货明细读取失败，请重试';
        EMessage.error(error, '到货明细加载失败');
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
    selected.value.some((row) => row.source.receiptLineId === id);
  const pageGroupIds = (sources: ProcurementInboundSourceItem[]): Set<string> =>
    new Set(sources.map((source) => source.receiptLineId));
  const isPageGroupSelected = (sources: ProcurementInboundSourceItem[]): boolean =>
    sources.length > 0 && sources.every((source) => isSelected(source.receiptLineId));
  const isPageGroupPartSelected = (sources: ProcurementInboundSourceItem[]): boolean =>
    sources.some((source) => isSelected(source.receiptLineId));
  const addPageGroup = (sources: ProcurementInboundSourceItem[]): boolean => {
    if (locked.value || !sources.length) return false;
    const missing = [
      ...new Map(
        sources
          .filter((source) => !isSelected(source.receiptLineId))
          .map((source) => [source.receiptLineId, source]),
      ).values(),
    ];
    if (selected.value.length + missing.length > 100) {
      EMessage.warning('一次最多包含 100 条目标明细，请减少已选明细或另单办理');
      return false;
    }
    selected.value = [
      ...selected.value,
      ...missing.map((source) => ({
        rowKey: crypto.randomUUID(),
        target: { mode: 'new' as const, clientKey: crypto.randomUUID() },
        source: { ...source },
        quantity: '',
        error: '',
      })),
    ];
    return true;
  };
  const togglePageGroup = async (sources: ProcurementInboundSourceItem[]): Promise<void> => {
    if (locked.value || !sources.length) return;
    if (!isPageGroupSelected(sources)) {
      addPageGroup(sources);
      return;
    }
    const ids = pageGroupIds(sources);
    const affected = selected.value.filter((row) => ids.has(row.source.receiptLineId));
    const selectedCounts = new Map<string, number>();
    for (const row of affected)
      selectedCounts.set(
        row.source.receiptLineId,
        (selectedCounts.get(row.source.receiptLineId) ?? 0) + 1,
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
    selected.value = selected.value.filter((row) => !ids.has(row.source.receiptLineId));
  };
  const toggle = async (source: ProcurementInboundSourceItem): Promise<void> => {
    if (locked.value) return;
    if (isSelected(source.receiptLineId)) {
      const targetCount = selected.value.filter(
        (row) => row.source.receiptLineId === source.receiptLineId,
      ).length;
      if (targetCount > 1) {
        try {
          await RouteMessageBox.confirm(
            `取消整份到货明细将移除 ${targetCount} 条目标明细，确定继续吗？`,
            '取消已选到货明细',
            { type: 'warning', confirmButtonText: '移除整份到货明细' },
          );
        } catch {
          return;
        }
      }
      if (locked.value) return;
      // Candidate deselection removes all targets for that source; row removal below removes one target.
      selected.value = selected.value.filter(
        (row) => row.source.receiptLineId !== source.receiptLineId,
      );
      return;
    }
    if (selected.value.length >= 100) {
      EMessage.warning('一次最多选择 100 个明细');
      return;
    }
    selected.value.push({
      rowKey: crypto.randomUUID(),
      target: { mode: 'new', clientKey: crypto.randomUUID() },
      source: { ...source },
      quantity: '',
      error: '',
    });
  };
  const remove = (rowKey: string): void => {
    if (!locked.value) selected.value = selected.value.filter((row) => row.rowKey !== rowKey);
  };
  const split = (rowKey: string, splitQuantity: number): void => {
    if (locked.value || selected.value.length >= 100) return;
    const source = selected.value.find((row) => row.rowKey === rowKey);
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
      rowKey: crypto.randomUUID(),
      source: { ...source.source },
      quantity: String(splitQuantity),
      target: { mode: 'new', clientKey: crypto.randomUUID() },
      error: '',
    });
  };
  const validQuantities = (): boolean => canSubmit.value;
  const recheck = async (adopt = true): Promise<boolean> => {
    if (command.locked.value || !selected.value.length || checking.value) return false;
    const ids = [...new Set(selected.value.map((row) => row.source.receiptLineId))];
    const current = selectedRead.begin(
      () =>
        ids.join(',') ===
        [...new Set(selected.value.map((row) => row.source.receiptLineId))].join(','),
    );
    checking.value = true;
    checkError.value = '';
    try {
      const result = await procurementInboundsApi.sources(
        { page: 1, pageSize: 100, receiptLineIds: ids },
        current.signal,
      );
      if (!current.isCurrent()) return false;
      const sources = new Map(result.items.map((item) => [item.receiptLineId, item]));
      let valid = true;
      const refreshed = new Map<string, ProcurementInboundSourceItem>();
      for (const row of selected.value) {
        const source = sources.get(row.source.receiptLineId);
        row.error = '';
        if (!source) {
          row.error = '该明细当前不可入库，请移除后从最新到货清单重新选择';
          valid = false;
        } else if (!sameBasis(row.source, source) && !adopt) {
          row.error = '到货办理依据已变化，请点击“刷新数据”';
          valid = false;
        } else if (adopt) refreshed.set(row.source.receiptLineId, source);
      }
      if (valid && adopt)
        for (const row of selected.value) {
          const source = refreshed.get(row.source.receiptLineId);
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
      details: selected.value.map(({ source, quantity, target }) => ({
        receiptLineId: source.receiptLineId,
        version: source.receiptLineVersion,
        quantity: Number(quantity),
        target: { ...target },
      })),
    };
    await command.run(
      { intentType: 'procurement.purchase-inbound.confirm', params: {}, query: {}, body },
      async (key) => {
        const result = await procurementInboundsApi.confirm(body, key);
        if (
          !result ||
          !Array.isArray(result.details) ||
          result.details.length !== body.details.length ||
          !result.inboundId ||
          !result.inboundNo ||
          result.details.some(
            (row) =>
              !row.batchId ||
              !row.inboundDetailId ||
              !row.transactionId ||
              !body.details.some((source) => source.receiptLineId === row.receiptLineId),
          )
        )
          throw new RequestError('仓库办理结果不完整，请核对办理记录后重试本次提交', 502);
        return result;
      },
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
    newBatchChoices,
    quantityErrors,
    canSubmit,
    load,
    search,
    reset,
    isSelected,
    isPageGroupSelected,
    isPageGroupPartSelected,
    togglePageGroup,
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
