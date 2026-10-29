import { onBeforeUnmount, onDeactivated, ref, type Ref } from 'vue';
import type { WorkOrderDetail, WorkOrderItem } from '@company/contracts';
import { productionWorkOrdersApi } from '../../../api/production/work-orders';
import { EMessage } from '../../../utils/message';
import { canStartNextResearchRound, requireWorkOrderDetail } from './research-work-order';
import type { WorkOrderFormHandle } from './work-order-form';

export const useWorkOrderDialogs = (options: {
  form: Ref<WorkOrderFormHandle | undefined>;
  editingOrderId: Ref<string | null>;
  editingOrderVersion: Ref<number>;
  orderDialogVisible: Ref<boolean>;
  resetCreationIntent: () => void;
  beginRow: (id: string) => boolean;
  endRow: (id: string) => void;
}) => {
  const activeOrder = ref<WorkOrderDetail | null>(null);
  const detailOrderId = ref<string | null>(null);
  const detailDialogVisible = ref(false);
  const detailLoading = ref(false);
  let generation = 0;
  const invalidate = () => {
    ++generation;
    detailLoading.value = false;
  };
  onDeactivated(invalidate);
  onBeforeUnmount(invalidate);

  const closeDetail = (visible: boolean) => {
    detailDialogVisible.value = visible;
    if (!visible) {
      invalidate();
      activeOrder.value = null;
      detailOrderId.value = null;
    }
  };

  const refreshDetail = async (): Promise<void> => {
    const orderId = detailOrderId.value;
    if (!detailDialogVisible.value || !orderId) return;
    const request = ++generation;
    detailLoading.value = true;
    try {
      const response = await productionWorkOrdersApi.getOrder(orderId);
      if (request !== generation || !detailDialogVisible.value) return;
      activeOrder.value = requireWorkOrderDetail(response, orderId);
    } catch (error) {
      if (request === generation) EMessage.error(error, '工单详情查询失败');
    } finally {
      if (request === generation) detailLoading.value = false;
    }
  };

  const openDetail = async (row: Pick<WorkOrderItem, 'id'>): Promise<void> => {
    detailOrderId.value = row.id;
    detailDialogVisible.value = true;
    activeOrder.value = null;
    await refreshDetail();
  };

  const openForm = async (row: WorkOrderItem, nextRound: boolean) => {
    if (!options.beginRow(row.id)) return;
    const request = ++generation;
    try {
      const response = await productionWorkOrdersApi.getOrder(row.id);
      if (request !== generation) return;
      const detail = requireWorkOrderDetail(response, row.id);
      if (nextRound) {
        if (!canStartNextResearchRound(detail)) {
          EMessage.warning('请先完成或关闭前序研发工单');
          return;
        }
        options.editingOrderId.value = null;
        options.resetCreationIntent();
        options.form.value?.startNextRound(detail);
        closeDetail(false);
      } else {
        if (detail.status !== 'draft') {
          EMessage.warning('只有草稿工单可以编辑，请刷新列表');
          return;
        }
        options.editingOrderId.value = detail.id;
        options.editingOrderVersion.value = detail.version;
        options.form.value?.setForm(detail);
      }
      options.orderDialogVisible.value = true;
    } catch (error) {
      if (request === generation) EMessage.error(error, '工单详情查询失败');
    } finally {
      options.endRow(row.id);
    }
  };

  return {
    activeOrder,
    detailDialogVisible,
    detailLoading,
    openDetail,
    refreshDetail,
    closeDetail,
    invalidate,
    openEdit: (row: WorkOrderItem) => openForm(row, false),
    openNextResearchRound: (row: WorkOrderItem) => openForm(row, true),
  };
};
