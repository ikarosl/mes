import { computed, reactive, ref, watch } from 'vue';
import type { ComputedRef } from 'vue';
import type { InventoryBatchItem } from '@company/contracts';
import {
  MAX_PERSISTED_INTEGER_QUANTITY,
  toBeijingDateString,
  toBeijingISOString,
} from '@company/utils';
import {
  createPreviewOutboundInventory,
  createPreviewOutboundOrders,
  parsePreviewOutboundQuantity,
  previewOutboundAvailableQuantity,
  previewOutboundBatchBlockReason,
  previewOutboundDetailSnapshot,
  previewOutboundQuantityError,
} from '../general-outbound-preview';
import type {
  PreviewOutboundDetail,
  PreviewOutboundDraft,
  PreviewOutboundOrder,
  PreviewOutboundQuery,
} from '../general-outbound-preview';

interface GeneralOutboundPreview {
  query: PreviewOutboundQuery;
  inventory: ComputedRef<InventoryBatchItem[]>;
  rows: ComputedRef<PreviewOutboundOrder[]>;
  total: ComputedRef<number>;
  detail: ComputedRef<PreviewOutboundOrder | null>;
  search: () => void;
  resetQuery: () => void;
  changePage: (page: number) => void;
  changePageSize: (pageSize: number) => void;
  openDetail: (id: string) => void;
  create: (draft: PreviewOutboundDraft) => PreviewOutboundOrder;
  confirm: (id: string) => PreviewOutboundOrder;
  cancel: (id: string, reason: string) => PreviewOutboundOrder;
}

/** Each page instance owns an isolated, in-memory preview. No business API or storage is used. */
export function useGeneralOutboundPreview(): GeneralOutboundPreview {
  const stock = ref(createPreviewOutboundInventory());
  const allOrders = ref(createPreviewOutboundOrders(stock.value));
  const selectedId = ref<string | null>(null);
  let nextSequence = allOrders.value.length + 1;
  const query = reactive<PreviewOutboundQuery>({ keyword: '', page: 1, pageSize: 10 });
  const filters = ref<Pick<PreviewOutboundQuery, 'keyword' | 'itemKind' | 'status'>>({
    keyword: '',
  });
  const matchingRows = computed(() => {
    const keyword = filters.value.keyword.toLocaleLowerCase();
    return allOrders.value
      .filter((order) => {
        if (filters.value.itemKind && order.itemKind !== filters.value.itemKind) return false;
        if (filters.value.status && order.status !== filters.value.status) return false;
        if (!keyword) return true;
        const values = [
          order.outboundNo,
          order.destination,
          order.remark,
          ...order.details.flatMap((line) => [
            line.itemCode,
            line.itemName,
            line.materialVariantCode ?? '',
            line.batchCode,
          ]),
        ];
        return values.some((value) => value.toLocaleLowerCase().includes(keyword));
      })
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
      );
  });
  const total = computed(() => matchingRows.value.length);
  const rows = computed(() => {
    const start = (query.page - 1) * query.pageSize;
    return matchingRows.value.slice(start, start + query.pageSize);
  });
  const detail = computed(
    () => allOrders.value.find((order) => order.id === selectedId.value) ?? null,
  );

  watch(total, (value) => {
    const lastPage = Math.max(1, Math.ceil(value / query.pageSize));
    if (query.page > lastPage) query.page = lastPage;
  });

  const search = (): void => {
    query.page = 1;
    filters.value = {
      keyword: query.keyword.trim(),
      itemKind: query.itemKind || undefined,
      status: query.status || undefined,
    };
  };
  const resetQuery = (): void => {
    query.keyword = '';
    query.itemKind = undefined;
    query.status = undefined;
    search();
  };
  const changePage = (page: number): void => {
    query.page = page;
  };
  const changePageSize = (pageSize: number): void => {
    query.pageSize = pageSize;
    query.page = 1;
  };
  const openDetail = (id: string): void => {
    selectedId.value = id;
  };

  const validateDraft = (draft: PreviewOutboundDraft): PreviewOutboundDetail[] => {
    if (!draft.destination.trim()) throw new Error('请填写出库去向');
    if (draft.destination.trim().length > 200) throw new Error('出库去向不能超过 200 个字符');
    if (draft.remark.length > 5000) throw new Error('备注不能超过 5000 个字符');
    if (!draft.details.length) throw new Error('请至少添加一条出库明细');
    const seen = new Set<string>();
    return draft.details.map((line) => {
      if (seen.has(line.itemBatchId)) throw new Error('同一库存批次不能重复添加');
      seen.add(line.itemBatchId);
      const batch = stock.value.find((item) => item.itemBatchId === line.itemBatchId);
      if (!batch || batch.itemKind !== draft.itemKind) throw new Error('库存批次与出库类型不匹配');
      const blocked = previewOutboundBatchBlockReason(batch);
      if (blocked) throw new Error(`${batch.batchCode}：${blocked}`);
      const error = previewOutboundQuantityError(
        line.quantity,
        previewOutboundAvailableQuantity(batch),
      );
      if (error) throw new Error(`${batch.batchCode}：${error}`);
      const quantity = parsePreviewOutboundQuantity(line.quantity);
      if (quantity === null) throw new Error('出库数量必须为有效的正整数');
      return previewOutboundDetailSnapshot(batch, quantity);
    });
  };

  const create = (draft: PreviewOutboundDraft): PreviewOutboundOrder => {
    const details = validateDraft(draft);
    const now = new Date();
    const sequence = nextSequence++;
    const order: PreviewOutboundOrder = {
      id: `preview-outbound-${sequence}`,
      outboundNo: `示例-CK-${toBeijingDateString(now).replace(/-/g, '')}-${String(sequence).padStart(3, '0')}`,
      itemKind: draft.itemKind,
      destination: draft.destination.trim(),
      status: 'pending_picking',
      remark: draft.remark.trim(),
      createdByName: '示例库管',
      createdAt: toBeijingISOString(now),
      operatorName: null,
      outboundAt: null,
      cancelReason: null,
      cancelledByName: null,
      cancelledAt: null,
      details,
    };
    allOrders.value = [order, ...allOrders.value];
    return order;
  };

  const getPendingOrder = (id: string): PreviewOutboundOrder => {
    const order = allOrders.value.find((item) => item.id === id);
    if (!order) throw new Error('示例出库单不存在');
    if (order.status !== 'pending_picking') throw new Error('只有待出库单可以执行此操作');
    return order;
  };
  const replaceOrder = (order: PreviewOutboundOrder): PreviewOutboundOrder => {
    allOrders.value = allOrders.value.map((item) => (item.id === order.id ? order : item));
    return order;
  };

  const confirm = (id: string): PreviewOutboundOrder => {
    const order = getPendingOrder(id);
    const quantities = new Map<string, number>();
    for (const line of order.details) {
      const batch = stock.value.find((item) => item.itemBatchId === line.itemBatchId);
      if (
        !batch ||
        batch.itemKind !== order.itemKind ||
        batch.productId !== line.productId ||
        batch.itemId !== line.itemId ||
        batch.materialVariantId !== line.materialVariantId ||
        batch.unit !== line.unit
      )
        throw new Error(`${line.batchCode} 的库存身份已变化，请取消后重新制单`);
      if (quantities.has(line.itemBatchId)) throw new Error('示例单包含重复库存批次，不能确认');
      const blocked = previewOutboundBatchBlockReason(batch);
      if (blocked) throw new Error(`${batch.batchCode}：${blocked}；整单未出库`);
      const quantity = Number(line.outboundQuantity);
      if (
        !Number.isSafeInteger(quantity) ||
        quantity < 1 ||
        quantity > MAX_PERSISTED_INTEGER_QUANTITY
      )
        throw new Error('示例单的出库数量无效，整单未出库');
      if (quantity > previewOutboundAvailableQuantity(batch))
        throw new Error(
          `${batch.batchCode} 当前可出库 ${previewOutboundAvailableQuantity(batch)} ${batch.unit}，少于本单 ${quantity} ${batch.unit}；整单未出库，请取消后重新制单`,
        );
      quantities.set(line.itemBatchId, quantity);
    }

    // Recheck every line before changing any balance, so an invalid line cannot partially deduct stock.
    stock.value = stock.value.map((batch) => {
      const quantity = quantities.get(batch.itemBatchId);
      if (quantity === undefined) return batch;
      return {
        ...batch,
        onHandAvailableQuantity: String(Number(batch.onHandAvailableQuantity) - quantity),
        availableToAllocateQuantity:
          batch.itemKind === 'material'
            ? String(Number(batch.availableToAllocateQuantity) - quantity)
            : batch.availableToAllocateQuantity,
      };
    });
    return replaceOrder({
      ...order,
      status: 'completed',
      operatorName: '示例库管',
      outboundAt: toBeijingISOString(new Date()),
    });
  };

  const cancel = (id: string, reason: string): PreviewOutboundOrder => {
    const order = getPendingOrder(id);
    if (!reason.trim()) throw new Error('请填写取消原因');
    if (reason.trim().length > 5000) throw new Error('取消原因不能超过 5000 个字符');
    return replaceOrder({
      ...order,
      status: 'cancelled',
      cancelReason: reason.trim(),
      cancelledByName: '示例库管',
      cancelledAt: toBeijingISOString(new Date()),
    });
  };

  return {
    query,
    inventory: computed(() => stock.value),
    rows,
    total,
    detail,
    search,
    resetQuery,
    changePage,
    changePageSize,
    openDetail,
    create,
    confirm,
    cancel,
  };
}
