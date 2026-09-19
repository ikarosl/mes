import { ref } from 'vue';
import type { PurchaseInboundOrderItem, PurchaseInboundOrderQuery } from '@company/contracts';
import { productionApi } from '../../../api/production';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';

/** 外购入库历史只读；实际入库仅由采购放行确认入口办理。 */
export const usePurchaseInbounds = () => {
  const rows = ref<PurchaseInboundOrderItem[]>([]),
    total = ref(0),
    loading = ref(false),
    detail = ref<PurchaseInboundOrderItem | null>(null),
    detailLoading = ref(false),
    detailError = ref('');
  const listRequest = useLatestReadRequest(() => {
    loading.value = false;
  });
  const detailRequest = useLatestReadRequest(() => {
    detailLoading.value = false;
  });
  const load = async (query: PurchaseInboundOrderQuery): Promise<void> => {
    if (!listRequest.isActive()) return;
    const current = listRequest.begin();
    loading.value = true;
    try {
      const result = await productionApi.listPurchaseInbounds(query, current.signal);
      if (!current.isCurrent()) return;
      rows.value = result.items;
      total.value = result.total;
    } catch (error) {
      if (current.isCurrent()) EMessage.error(error, '入库历史加载失败');
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  };
  const loadDetail = async (id: string): Promise<void> => {
    if (!detailRequest.isActive()) return;
    const current = detailRequest.begin();
    detail.value = null;
    detailError.value = '';
    detailLoading.value = true;
    try {
      const result = await productionApi.getPurchaseInbound(id, current.signal);
      if (!current.isCurrent()) return;
      if (result.sourceType !== 'purchased') throw new Error('该记录不属于外购物料入库');
      detail.value = result;
    } catch (error) {
      if (current.isCurrent())
        detailError.value = error instanceof Error ? error.message : '入库详情加载失败';
    } finally {
      if (current.isCurrent()) detailLoading.value = false;
    }
  };
  const closeDetail = (): void => {
    detailRequest.invalidate();
    detail.value = null;
    detailError.value = '';
  };
  return {
    rows,
    total,
    loading,
    detail,
    detailLoading,
    detailError,
    load,
    loadDetail,
    closeDetail,
  };
};
