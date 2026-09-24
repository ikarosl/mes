import { computed, onActivated, onDeactivated, onScopeDispose, reactive, ref } from 'vue';
import type { PurchaseOrderDetail, PurchaseOrderItem } from '@company/contracts';
import { procurementApi } from '../../../api/procurement';
import { EMessage } from '../../../utils/message';

interface DetailEntry {
  detail: PurchaseOrderDetail | null;
  loading: boolean;
  failed: boolean;
}

/** 只保留当前页及一个定位单据；列表读取不预取折叠明细。 */
export function usePurchaseOrderExpansion() {
  const entries = reactive<Record<string, DetailEntry>>({});
  const expanded = ref<string[]>([]);
  const focusedId = ref('');
  const focused = computed(() => entries[focusedId.value]?.detail ?? null);
  const requests = new Map<
    string,
    { controller: AbortController; promise: Promise<PurchaseOrderDetail | null> }
  >();
  let active = true;
  let pageIds = new Set<string>();
  const invalidate = (id: string) => {
    requests.get(id)?.controller.abort();
    requests.delete(id);
    if (entries[id]) entries[id].loading = false;
  };
  const read = (id: string, fresh = false): Promise<PurchaseOrderDetail | null> => {
    if (!active) return Promise.resolve(null);
    if (fresh) invalidate(id);
    const pending = requests.get(id);
    if (pending) return pending.promise;
    if (!entries[id]) entries[id] = { detail: null, loading: false, failed: false };
    const entry = entries[id]!;
    const controller = new AbortController();
    entry.loading = true;
    const current = () => active && requests.get(id)?.controller === controller;
    const promise = procurementApi
      .getOrder(id, controller.signal)
      .then((detail) => {
        if (!current()) return null;
        entry.detail = detail;
        entry.failed = false;
        return detail;
      })
      .catch((error: unknown) => {
        if (current()) {
          entry.failed = true;
          EMessage.error(error, '采购物料行加载失败，请重试');
        }
        return null;
      })
      .finally(() => {
        if (current()) {
          entry.loading = false;
          requests.delete(id);
        }
      });
    requests.set(id, { controller, promise });
    return promise;
  };
  const prune = () => {
    for (const id of Object.keys(entries)) {
      if (pageIds.has(id) || id === focusedId.value) continue;
      invalidate(id);
      delete entries[id];
    }
    expanded.value = expanded.value.filter((id) => pageIds.has(id) || id === focusedId.value);
  };
  const sync = (rows: PurchaseOrderItem[], refreshExpanded: boolean) => {
    pageIds = new Set(rows.map((row) => row.id));
    prune();
    for (const row of rows) {
      const entry = entries[row.id];
      const changed = entry?.detail && entry.detail.version !== row.version;
      if (expanded.value.includes(row.id) && (refreshExpanded || changed))
        void read(row.id, Boolean(changed));
      else if (changed) {
        invalidate(row.id);
        delete entries[row.id];
      }
    }
    if (
      refreshExpanded &&
      focusedId.value &&
      !pageIds.has(focusedId.value) &&
      expanded.value.includes(focusedId.value)
    )
      void read(focusedId.value);
  };
  const setExpanded = (id: string, value: boolean) => {
    if (value === expanded.value.includes(id)) return;
    if (value) {
      expanded.value = [...expanded.value, id];
      void read(id);
    } else {
      expanded.value = expanded.value.filter((key) => key !== id);
      invalidate(id);
    }
  };
  const focus = async (id: string): Promise<boolean> => {
    focusedId.value = id;
    const detail = await read(id);
    if (!detail) return false;
    if (!expanded.value.includes(id)) expanded.value = [...expanded.value, id];
    prune();
    return true;
  };
  const clearFocus = () => {
    focusedId.value = '';
    prune();
  };
  const replace = (detail: PurchaseOrderDetail) => {
    invalidate(detail.id);
    entries[detail.id] = { detail, loading: false, failed: false };
  };
  const deactivate = () => {
    active = false;
    for (const id of requests.keys()) invalidate(id);
  };
  onActivated(() => {
    active = true;
  });
  onDeactivated(deactivate);
  onScopeDispose(deactivate);
  return {
    entries,
    expanded,
    focused,
    focusedId,
    read,
    sync,
    setExpanded,
    focus,
    clearFocus,
    replace,
  };
}
