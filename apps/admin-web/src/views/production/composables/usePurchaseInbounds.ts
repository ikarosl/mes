import { ref } from 'vue';
import type {
  CreatePurchaseInboundPayload,
  PurchaseInboundOrderItem,
  PurchaseInboundOrderQuery,
} from '@company/contracts';
import { normalizePurchaseInboundPayload } from '@company/utils';
import { productionApi } from '../../../api/production';
import { useIdempotentIntent } from '../../../composables/idempotency/useIdempotentIntent';

export const usePurchaseInbounds = () => {
  const rows = ref<PurchaseInboundOrderItem[]>([]),
    total = ref(0),
    loading = ref(false),
    detail = ref<PurchaseInboundOrderItem | null>(null),
    detailLoading = ref(false),
    pendingKeys = ref(new Set<string>());
  const createIntent = useIdempotentIntent();
  const confirmIntents = new Map<string, ReturnType<typeof useIdempotentIntent>>();
  let listToken = 0,
    detailToken = 0;
  const load = async (query: PurchaseInboundOrderQuery) => {
    const token = ++listToken;
    loading.value = true;
    try {
      const r = await productionApi.listPurchaseInbounds(query);
      if (token === listToken) {
        rows.value = r.items;
        total.value = r.total;
      }
    } finally {
      if (token === listToken) loading.value = false;
    }
  };
  const loadDetail = async (id: string) => {
    const token = ++detailToken;
    detailLoading.value = true;
    try {
      const r = await productionApi.getPurchaseInbound(id);
      if (token === detailToken) detail.value = r;
      return r;
    } finally {
      if (token === detailToken) detailLoading.value = false;
    }
  };
  const create = async (payload: CreatePurchaseInboundPayload) => {
    const body = normalizePurchaseInboundPayload(payload);
    return createIntent.execute(
      { intentType: 'production.purchase-inbound.create', params: {}, query: {}, body },
      (key) => productionApi.createPurchaseInbound(body, key),
    );
  };
  const confirm = async (row: PurchaseInboundOrderItem) => {
    const key = `confirm:${row.inboundId}`;
    if (pendingKeys.value.has(key)) return row;
    pendingKeys.value = new Set(pendingKeys.value).add(key);
    const intent = confirmIntents.get(row.inboundId) ?? useIdempotentIntent();
    confirmIntents.set(row.inboundId, intent);
    try {
      const result = await intent.execute(
        {
          intentType: 'production.purchase-inbound.confirm',
          params: { inboundId: row.inboundId },
          query: {},
          body: { version: row.version },
        },
        (idempotencyKey) =>
          productionApi.confirmPurchaseInbound(row.inboundId, row.version, idempotencyKey),
      );
      confirmIntents.delete(row.inboundId);
      return result;
    } finally {
      remove(key);
    }
  };
  const cancel = async (row: PurchaseInboundOrderItem) => {
    const key = `cancel:${row.inboundId}`;
    if (pendingKeys.value.has(key)) return row;
    pendingKeys.value = new Set(pendingKeys.value).add(key);
    try {
      return await productionApi.cancelPurchaseInbound(row.inboundId, row.version);
    } finally {
      remove(key);
    }
  };
  const remove = (key: string) => {
    const next = new Set(pendingKeys.value);
    next.delete(key);
    pendingKeys.value = next;
  };
  return {
    rows,
    total,
    loading,
    detail,
    detailLoading,
    pendingKeys,
    load,
    loadDetail,
    create,
    confirm,
    cancel,
    getCreateIntentStatus: createIntent.getStatus,
    resetCreateIntent: createIntent.reset,
  };
};
