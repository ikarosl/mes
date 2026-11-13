import { onScopeDispose, ref, type Ref } from 'vue';
import type { CreateWorkOrderPayload } from '@company/contracts';
import { productionWorkOrdersApi } from '../../../api/production/work-orders';
import {
  useIdempotentIntent,
  type IdempotentIntentStatus,
} from '../../../composables/idempotency/useIdempotentIntent';
import { confirmSubmissionClose } from '../../../composables/idempotency/submission-recovery';
import { useTabsStore } from '../../../stores/tabs';
import { toDateInputValue } from '../../../utils/date';
import { EMessage } from '../../../utils/message';
import { useWorkOrderDialogs } from './use-work-order-dialogs';
import type { WorkOrderFormHandle, WorkOrderFormValue } from './work-order-form';

type WorkOrderDialogs = ReturnType<typeof useWorkOrderDialogs>;

export interface WorkOrderEditor {
  orderDialogVisible: Ref<boolean>;
  editingOrderId: Ref<string | null>;
  submitting: Ref<boolean>;
  orderIntentStatus: Ref<IdempotentIntentStatus>;
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
  retryOrder: () => Promise<void>;
  restartOrder: () => void;
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
  const orderIntentStatus = ref<IdempotentIntentStatus>('idle');
  let submittedCreatePayload: CreateWorkOrderPayload | null = null;
  const orderDialogVisible = ref(false);
  const editingOrderId = ref<string | null>(null);
  const editingOrderVersion = ref(0);
  const submitting = ref(false);
  const workOrderFormDialogRef = ref<WorkOrderFormHandle>();
  const resetCreationIntent = (): void => {
    if (submitting.value) return;
    createOrderIntent.reset();
    orderIntentStatus.value = 'idle';
    submittedCreatePayload = null;
  };

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
    resetCreationIntent,
    beginRow,
    endRow,
  });

  const openCreate = (): void => {
    if (orderDialogVisible.value || submitting.value) return;
    invalidateWorkOrderDialogRequest();
    editingOrderId.value = null;
    workOrderFormDialogRef.value?.resetForm();
    resetCreationIntent();
    orderDialogVisible.value = true;
  };

  const saveOrder = async (data?: WorkOrderFormValue): Promise<void> => {
    if (submitting.value) return;
    submitting.value = true;
    let saved = false;
    try {
      const editId = editingOrderId.value;
      if (editId) {
        if (!data) return;
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
        if (createOrderIntent.getStatus() === 'idle' && data)
          submittedCreatePayload = {
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
        const payload = submittedCreatePayload;
        if (!payload) throw new Error('原工单提交内容缺失，请先核对工单列表');
        const created = await createOrderIntent.execute(
          { intentType: 'production.work-order.create', params: {}, query: {}, body: payload },
          (key) => productionWorkOrdersApi.createOrder(payload, key),
        );
        submittedCreatePayload = null;
        EMessage.success(`工单 ${created.workOrderNo} 已新增`);
      }
      orderDialogVisible.value = false;
      saved = true;
    } catch (error) {
      if (createOrderIntent.getStatus() === 'idle') submittedCreatePayload = null;
      EMessage.error(error, '工单保存失败');
    } finally {
      orderIntentStatus.value = createOrderIntent.getStatus();
      submitting.value = false;
    }
    if (saved) {
      try {
        await loadOrders();
      } catch (error) {
        EMessage.error(error, '工单已保存，列表刷新失败，请刷新列表核对');
      }
    }
  };
  const submitOrder = (data: WorkOrderFormValue): Promise<void> => saveOrder(data);
  const retryOrder = (): Promise<void> => saveOrder();

  const handleOrderFormDialogClose = async (visible: boolean): Promise<void> => {
    if (visible) {
      orderDialogVisible.value = true;
      return;
    }
    if (submitting.value) return;
    if (!orderDialogVisible.value) return;
    if (
      !(await confirmSubmissionClose(createOrderIntent.getStatus(), {
        entityLabel: '工单',
        dirty: workOrderFormDialogRef.value?.isDirty(),
      }))
    )
      return;
    if (submitting.value) return;
    invalidateWorkOrderDialogRequest();
    orderDialogVisible.value = false;
    resetCreationIntent();
  };

  const unregister = useTabsStore().registerCloseGuard('production-orders', async () => {
    if (submitting.value) return false;
    await handleOrderFormDialogClose(false);
    return !orderDialogVisible.value;
  });
  onScopeDispose(unregister);

  return {
    orderDialogVisible,
    editingOrderId,
    submitting,
    orderIntentStatus,
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
    retryOrder,
    restartOrder: resetCreationIntent,
    handleOrderFormDialogClose,
  };
}
