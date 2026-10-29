import { ref, type Ref } from 'vue';
import type { WorkOrderDetail, WorkOrderItem } from '@company/contracts';
import { productionWorkOrdersApi } from '../../../api/production/work-orders';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox as ElMessageBox } from '../../../utils/route-message-box';
import type { WorkOrderTransitionMode, WorkOrderTransitionValue } from './work-order-transition';

export interface WorkOrderTransitions {
  transitionDialogVisible: Ref<boolean>;
  transitionSubmitting: Ref<boolean>;
  transitionOrder: Ref<WorkOrderDetail | null>;
  transitionMode: Ref<WorkOrderTransitionMode>;
  releaseOrder: (row: WorkOrderItem) => Promise<void>;
  cancelOrder: (row: WorkOrderItem) => Promise<void>;
  openWorkOrderTransition: (row: WorkOrderItem, mode: WorkOrderTransitionMode) => Promise<void>;
  confirmWorkOrderTransition: (value: WorkOrderTransitionValue) => Promise<void>;
}

interface WorkOrderTransitionOptions {
  loadOrders: () => Promise<void>;
  beginRow: (id: string) => boolean;
  endRow: (id: string) => void;
}

/** 工单下达、取消与结束办理共享页面的行级写入守卫。 */
export function useWorkOrderTransitions(options: WorkOrderTransitionOptions): WorkOrderTransitions {
  const { loadOrders, beginRow, endRow } = options;
  const transitionDialogVisible = ref(false);
  const transitionSubmitting = ref(false);
  const transitionOrder = ref<WorkOrderDetail | null>(null);
  const transitionMode = ref<WorkOrderTransitionMode>('complete');

  const releaseOrder = (row: WorkOrderItem) =>
    runSimpleOrderAction(row, '下达', () =>
      productionWorkOrdersApi.releaseOrder(row.id, row.version),
    );
  const cancelOrder = async (row: WorkOrderItem): Promise<void> => {
    if (!beginRow(row.id)) return;
    try {
      const { value } = await ElMessageBox.prompt('请输入草稿工单的取消原因', '取消工单', {
        confirmButtonText: '确认取消',
        cancelButtonText: '返回',
        inputType: 'textarea',
        inputPlaceholder: '请填写取消原因',
        inputValidator: (input) => {
          const reason = input.trim();
          if (!reason) return '请填写取消原因';
          return reason.length <= 5000 || '取消原因不能超过 5000 个字符';
        },
        type: 'warning',
      });
      await productionWorkOrdersApi.cancelOrder(row.id, {
        version: row.version,
        reason: value.trim(),
      });
      EMessage.success('工单已取消');
      await loadOrders();
    } catch (error) {
      if (error !== 'cancel' && error !== 'close') EMessage.error(error, '工单取消失败');
    } finally {
      endRow(row.id);
    }
  };

  const runSimpleOrderAction = async (
    row: WorkOrderItem,
    label: string,
    command: () => Promise<unknown>,
  ): Promise<void> => {
    if (!beginRow(row.id)) return;
    try {
      await ElMessageBox.confirm(`确认${label}该工单？`, `${label}工单`, {
        confirmButtonText: `确认${label}`,
        cancelButtonText: '取消',
        type: label === '取消' ? 'warning' : 'info',
      });
      await command();
      EMessage.success(`工单已${label}`);
      await loadOrders();
    } catch (error) {
      if (error !== 'cancel' && error !== 'close') EMessage.error(error, `工单${label}失败`);
    } finally {
      endRow(row.id);
    }
  };

  const openWorkOrderTransition = async (
    row: WorkOrderItem,
    mode: WorkOrderTransitionMode,
  ): Promise<void> => {
    if (!beginRow(row.id)) return;
    try {
      transitionOrder.value = await productionWorkOrdersApi.getOrder(row.id);
      transitionMode.value = mode;
      transitionDialogVisible.value = true;
    } catch (error) {
      EMessage.error(error, '工单状态核对失败');
    } finally {
      endRow(row.id);
    }
  };

  const confirmWorkOrderTransition = async (value: WorkOrderTransitionValue): Promise<void> => {
    const order = transitionOrder.value;
    if (!order || !beginRow(order.id)) return;
    transitionSubmitting.value = true;
    try {
      if (value.mode === 'complete') {
        await productionWorkOrdersApi.completeOrder(order.id, order.version);
        EMessage.success('工单已确认完工');
      } else {
        await productionWorkOrdersApi.closeOrder(order.id, {
          version: order.version,
          reason: value.reason,
        });
        EMessage.success(value.mode === 'archive' ? '工单已归档关闭' : '工单已提前关闭');
      }
      transitionDialogVisible.value = false;
      transitionOrder.value = null;
      await loadOrders();
    } catch (error) {
      EMessage.error(error, value.mode === 'complete' ? '工单完工确认失败' : '工单关闭失败');
    } finally {
      transitionSubmitting.value = false;
      endRow(order.id);
    }
  };

  return {
    transitionDialogVisible,
    transitionSubmitting,
    transitionOrder,
    transitionMode,
    releaseOrder,
    cancelOrder,
    openWorkOrderTransition,
    confirmWorkOrderTransition,
  };
}
