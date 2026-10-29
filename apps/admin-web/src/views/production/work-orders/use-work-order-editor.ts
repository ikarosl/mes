import { ref, type Ref } from 'vue';
import type { CreateWorkOrderPayload } from '@company/contracts';
import { productionWorkOrdersApi } from '../../../api/production/work-orders';
import { useIdempotentIntent } from '../../../composables/idempotency/useIdempotentIntent';
import { toDateInputValue } from '../../../utils/date';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox as ElMessageBox } from '../../../utils/route-message-box';
import { useWorkOrderDialogs } from './use-work-order-dialogs';
import type { WorkOrderFormHandle, WorkOrderFormValue } from './work-order-form';

type WorkOrderDialogs = ReturnType<typeof useWorkOrderDialogs>;

export interface WorkOrderEditor {
  orderDialogVisible: Ref<boolean>;
  editingOrderId: Ref<string | null>;
  submitting: Ref<boolean>;
  workOrderFormDialogRef: Ref<WorkOrderFormHandle | undefined>;
  activeOrder: WorkOrderDialogs['activeOrder'];
  detailDialogVisible: WorkOrderDialogs['detailDialogVisible'];
  detailLoading: WorkOrderDialogs['detailLoading'];
  openDetail: WorkOrderDialogs['openDetail'];
  refreshOrderDetail: WorkOrderDialogs['refreshDetail'];
  openEdit: WorkOrderDialogs['openEdit'];
  openNextResearchRound: WorkOrderDialogs['openNextResearchRound'];
  handleDetailDialogClose: WorkOrderDialogs['closeDetail'];
  openCreate: () => void;
  submitOrder: (data: WorkOrderFormValue) => Promise<void>;
  handleOrderFormDialogClose: (visible: boolean) => Promise<void>;
}

interface WorkOrderEditorOptions {
  loadOrders: () => Promise<void>;
  beginRow: (id: string) => boolean;
  endRow: (id: string) => void;
}

/** 工单表单的编辑目标、创建意图与关闭保护随所属页面缓存。 */
export function useWorkOrderEditor(options: WorkOrderEditorOptions): WorkOrderEditor {
  const { loadOrders, beginRow, endRow } = options;
  const createOrderIntent = useIdempotentIntent('工单');
  const orderDialogVisible = ref(false);
  const editingOrderId = ref<string | null>(null);
  const editingOrderVersion = ref(0);
  const submitting = ref(false);
  const workOrderFormDialogRef = ref<WorkOrderFormHandle>();

  const {
    activeOrder,
    detailDialogVisible,
    detailLoading,
    openDetail,
    refreshDetail: refreshOrderDetail,
    openEdit,
    openNextResearchRound,
    closeDetail: handleDetailDialogClose,
    invalidate: invalidateWorkOrderDialogRequest,
  } = useWorkOrderDialogs({
    form: workOrderFormDialogRef,
    editingOrderId,
    editingOrderVersion,
    orderDialogVisible,
    resetCreationIntent: createOrderIntent.reset,
    beginRow,
    endRow,
  });

  const openCreate = (): void => {
    invalidateWorkOrderDialogRequest();
    editingOrderId.value = null;
    workOrderFormDialogRef.value?.resetForm();
    createOrderIntent.reset();
    orderDialogVisible.value = true;
  };

  const submitOrder = async (data: WorkOrderFormValue): Promise<void> => {
    if (submitting.value) return;
    submitting.value = true;
    try {
      const editId = editingOrderId.value;
      if (editId) {
        await productionWorkOrdersApi.updateOrder(editId, {
          orderType: data.orderType,
          productId: data.productId,
          plannedQuantity: data.plannedQuantity,
          workOrderOwnerId: data.workOrderOwnerId || null,
          customerName: data.customerName || null,
          qualityLevel: data.qualityLevel || null,
          planStartDate: toDateInputValue(data.planStartDate),
          planEndDate: toDateInputValue(data.planEndDate),
          externalOrderNo: data.externalOrderNo || null,
          remark: data.remark || null,
          version: editingOrderVersion.value,
        });
        EMessage.success('工单已更新');
      } else {
        const payload: CreateWorkOrderPayload = {
          orderType: data.orderType,
          previousResearchOrderId: data.previousResearchOrderId,
          productId: data.productId,
          plannedQuantity: data.plannedQuantity,
          workOrderOwnerId: data.workOrderOwnerId || null,
          customerName: data.customerName || null,
          qualityLevel: data.qualityLevel || null,
          planStartDate: toDateInputValue(data.planStartDate),
          planEndDate: toDateInputValue(data.planEndDate),
          externalOrderNo: data.externalOrderNo || null,
          remark: data.remark || null,
        };
        const created = await createOrderIntent.execute(
          { intentType: 'production.work-order.create', params: {}, query: {}, body: payload },
          (key) => productionWorkOrdersApi.createOrder(payload, key),
        );
        EMessage.success(`工单 ${created.workOrderNo} 已新增`);
      }
      orderDialogVisible.value = false;
      await loadOrders();
    } catch (error) {
      EMessage.error(error, '工单保存失败');
    } finally {
      submitting.value = false;
    }
  };

  const handleOrderFormDialogClose = async (visible: boolean): Promise<void> => {
    if (!visible) invalidateWorkOrderDialogRequest();
    if (submitting.value) return;
    if (!visible && createOrderIntent.getStatus() !== 'idle') {
      try {
        await ElMessageBox.confirm(
          '上次创建结果尚未确认。请先在工单列表核对，关闭后重新创建可能产生重复工单。是否仍要关闭？',
          '关闭确认',
          { confirmButtonText: '仍要关闭', cancelButtonText: '继续保留', type: 'warning' },
        );
      } catch {
        return;
      }
    }
    orderDialogVisible.value = visible;
    if (!visible) createOrderIntent.reset();
  };

  return {
    orderDialogVisible,
    editingOrderId,
    submitting,
    workOrderFormDialogRef,
    activeOrder,
    detailDialogVisible,
    detailLoading,
    openDetail,
    refreshOrderDetail,
    openEdit,
    openNextResearchRound,
    handleDetailDialogClose,
    openCreate,
    submitOrder,
    handleOrderFormDialogClose,
  };
}
