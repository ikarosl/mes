import { computed, ref } from 'vue';
import type { Ref } from 'vue';
import { PURCHASE_ORDER_MAX_LINES } from '@company/constants';
import { EMessage } from '../../../utils/message';
import type { PurchaseDraftRow } from './usePurchaseOrderEditor';

interface PurchaseDemandSplitEditor {
  visible: Ref<boolean>;
  open: (row: PurchaseDraftRow) => void;
  apply: (demandIds: string[]) => boolean;
  close: () => void;
}

export function usePurchaseDemandSplit(
  rows: Ref<PurchaseDraftRow[]>,
  disabled: () => boolean,
  nextKey: () => string,
): PurchaseDemandSplitEditor {
  const visible = ref(false);
  const rowKey = ref<string>();
  const row = computed(() => rows.value.find((entry) => entry.key === rowKey.value));
  const close = (): void => {
    visible.value = false;
    rowKey.value = undefined;
  };
  const open = (source: PurchaseDraftRow): void => {
    if (disabled() || source.sources.length < 2) return;
    if (rows.value.length >= PURCHASE_ORDER_MAX_LINES) {
      EMessage.warning('一张采购单最多 100 条物料行');
      return;
    }
    rowKey.value = source.key;
    visible.value = true;
  };
  const apply = (demandIds: string[]): boolean => {
    if (!visible.value || disabled()) return false;
    const source = row.value;
    if (!source) {
      EMessage.warning('当前采购行已移除，请重新选择');
      return false;
    }
    const selected = new Set(demandIds);
    if (
      !selected.size ||
      selected.size !== demandIds.length ||
      demandIds.some((id) => !source.sources.some((entry) => entry.demandId === id))
    ) {
      EMessage.warning('请选择原行中的需求后再分开采购');
      return false;
    }
    const remaining = source.sources.filter((entry) => !selected.has(entry.demandId));
    if (!remaining.length) {
      EMessage.warning('原行须至少保留 1 条需求');
      return false;
    }
    if (rows.value.length >= PURCHASE_ORDER_MAX_LINES) {
      EMessage.warning('一张采购单最多 100 条物料行');
      return false;
    }
    const copy: PurchaseDraftRow = {
      ...source,
      key: nextKey(),
      supplierId: '',
      supplierName: '',
      supplierReady: false,
      plannedQuantity: undefined,
      sources: source.sources
        .filter((entry) => selected.has(entry.demandId))
        .map((entry) => ({ ...entry })),
    };
    rows.value.splice(rows.value.indexOf(source), 1, { ...source, sources: remaining }, copy);
    close();
    return true;
  };
  return { visible, open, apply, close };
}
