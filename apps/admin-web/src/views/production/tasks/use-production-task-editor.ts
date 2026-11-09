import { onScopeDispose, ref } from 'vue';
import type {
  CreateProductionBatchPayload,
  ProductionBatchDetail,
  ProductionBatchItem,
} from '@company/contracts';
import { normalizeCreateBatchPayload } from '@company/utils';
import { productionTasksApi } from '../../../api/production/tasks';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import {
  useIdempotentIntent,
  type IdempotentIntentStatus,
} from '../../../composables/idempotency/useIdempotentIntent';
import { useTabsStore } from '../../../stores/tabs';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox as ElMessageBox } from '../../../utils/route-message-box';
import type { TaskFormValue } from './task-form';

export function useProductionTaskEditor(loadTasks: () => Promise<void>) {
  const createBatchIntent = useIdempotentIntent();
  const taskIntentStatus = ref<IdempotentIntentStatus>('idle');
  let submittedCreateDraft: TaskFormValue | null = null;
  const taskDialogVisible = ref(false),
    detailDialogVisible = ref(false),
    editingTaskId = ref<string | null>(null),
    editingTaskVersion = ref<number | null>(null),
    submitting = ref(false);
  const activeBatch = ref<ProductionBatchDetail | null>(null),
    detailBatchId = ref<string | null>(null),
    detailLoading = ref(false),
    detailError = ref('');
  const editRead = useLatestReadRequest(() => undefined),
    detailRead = useLatestReadRequest(() => {
      detailLoading.value = false;
    });
  const taskFormDialogRef = ref<{
    setForm: (row: ProductionBatchDetail) => void;
    resetForm: () => void;
    isDirty: () => boolean;
  }>();
  const openCreate = (): void => {
    if (taskDialogVisible.value) return;
    editRead.invalidate();
    editingTaskId.value = null;
    editingTaskVersion.value = null;
    taskFormDialogRef.value?.resetForm();
    createBatchIntent.reset();
    taskIntentStatus.value = 'idle';
    submittedCreateDraft = null;
    taskDialogVisible.value = true;
  };

  const batchCreationIntentMessage = (state: string): string => {
    if (state === 'blocked')
      return '暂时无法确认批次是否已创建，当前不能继续提交。请先核对批次列表并联系管理员；关闭后重新办理可能重复创建，确认关闭？';
    if (state === 'expired')
      return '本次提交已超过可重试时限。请先核对批次列表；关闭后重新办理可能重复创建，确认关闭？';
    return '暂时无法确认批次是否已创建。关闭后无法继续重试本次提交，重新办理可能重复创建；请先核对批次列表，确认关闭？';
  };

  /**
   * 任务弹窗关闭守卫：意图结果未知（网络模糊失败/提交在途/结果损坏/超时）时不得静默丢弃 K1，
   * 否则重新提交可能生成第二个自动编号批次。必须提示后由用户显式确认才 reset（放弃）。
   * idle 状态直接关闭；程序化关闭（提交成功后置 visible=false）不会触发 update:visible，走不到这里。
   */
  const handleTaskDialogClose = async (visible: boolean): Promise<void> => {
    if (visible) {
      taskDialogVisible.value = true;
      return;
    }
    if (!taskDialogVisible.value) return;
    if (submitting.value) return;
    editRead.invalidate();
    const state = createBatchIntent.getStatus();
    if (state === 'idle') {
      if (taskFormDialogRef.value?.isDirty()) {
        try {
          await ElMessageBox.confirm('任务填写尚未保存，确认放弃本次修改？', '关闭确认', {
            type: 'warning',
          });
        } catch {
          return;
        }
      }
      taskDialogVisible.value = false;
      createBatchIntent.reset();
      return;
    }
    const message = batchCreationIntentMessage(state);
    try {
      await ElMessageBox.confirm(message, '关闭确认', {
        confirmButtonText: '仍要关闭',
        cancelButtonText: '继续保留',
        type: 'warning',
      });
      taskDialogVisible.value = false;
      createBatchIntent.reset();
    } catch {
      // 用户选择保留：不关闭弹窗、不丢弃意图，K1 继续保留以便安全重试
    }
  };

  const openEdit = async (row: ProductionBatchItem): Promise<void> => {
    if (taskDialogVisible.value || !editRead.isActive()) return;
    const request = editRead.begin(() => !taskDialogVisible.value);
    try {
      const detail = await productionTasksApi.getBatch(row.id, {
        signal: request.signal,
        skipErrorHandling: true,
      });
      if (!request.isCurrent()) return;
      if (detail.id !== row.id) throw new Error('任务详情与当前目标不一致，请重试');
      editingTaskId.value = detail.id;
      editingTaskVersion.value = detail.version;
      taskFormDialogRef.value?.setForm(detail);
      taskDialogVisible.value = true;
    } catch (error) {
      if (request.isCurrent()) EMessage.error(error, '任务编辑信息查询失败');
    }
  };

  const submitTask = async (data: TaskFormValue): Promise<void> => {
    if (submitting.value || !editRead.isActive()) return;
    if (!editingTaskId.value && createBatchIntent.getStatus() === 'idle')
      submittedCreateDraft = { ...data };
    submitting.value = true;
    try {
      const editId = editingTaskId.value;
      if (editId) {
        const version = editingTaskVersion.value;
        if (version === null) throw new Error('任务编辑依据缺失，请关闭后重新打开');
        await productionTasksApi.updateBatch(editId, {
          ownerId: data.ownerId,
          planStartDate: data.planStartDate || null,
          planEndDate: data.planEndDate || null,
          remark: data.remark || null,
          version,
        });
        EMessage.success('任务已更新');
      } else {
        const payload: CreateProductionBatchPayload = {
          routeId: data.routeId || null,
          plannedQuantity: data.plannedQuantity,
          ownerId: data.ownerId,
          planStartDate: data.planStartDate,
          planEndDate: data.planEndDate,
          remark: data.remark || null,
        };
        const workOrderId = data.workOrderId;
        const normalizedPayload = normalizeCreateBatchPayload(payload);
        await createBatchIntent.execute(
          {
            intentType: 'production.batch.create',
            params: { workOrderId },
            query: {},
            body: normalizedPayload,
          },
          (key) => productionTasksApi.createOrderBatch(workOrderId, normalizedPayload, key),
        );
        EMessage.success('任务已新增');
      }
      taskDialogVisible.value = false;
      await loadTasks();
    } catch (error) {
      EMessage.error(error, '任务保存失败');
    } finally {
      taskIntentStatus.value = createBatchIntent.getStatus();
      submitting.value = false;
    }
  };

  async function refreshTaskDetail(): Promise<void> {
    const id = detailBatchId.value;
    if (!id || !detailDialogVisible.value || !detailRead.isActive()) return;
    const request = detailRead.begin(() => detailDialogVisible.value && detailBatchId.value === id);
    detailLoading.value = true;
    detailError.value = '';
    try {
      const detail = await productionTasksApi.getBatch(id, {
        signal: request.signal,
        skipErrorHandling: true,
      });
      if (!request.isCurrent()) return;
      if (detail.id !== id) throw new Error('任务详情与当前目标不一致，请重新刷新');
      activeBatch.value = detail;
    } catch (error) {
      if (!request.isCurrent()) return;
      activeBatch.value = null;
      detailError.value = error instanceof Error ? error.message : '任务详情查询失败，请重试';
    } finally {
      if (request.isCurrent()) detailLoading.value = false;
    }
  }
  const handleDetailVisibility = (visible: boolean): void => {
    detailDialogVisible.value = visible;
    if (!visible) detailRead.invalidate();
  };
  const openDetail = async (row: Pick<ProductionBatchItem, 'id'>): Promise<void> => {
    detailRead.invalidate();
    detailBatchId.value = row.id;
    activeBatch.value = null;
    detailError.value = '';
    detailDialogVisible.value = true;
    await refreshTaskDetail();
  };

  const canLocateDetail = (): boolean => detailRead.isActive();
  async function retryTask(): Promise<void> {
    if (submittedCreateDraft) await submitTask(submittedCreateDraft);
  }
  const unregister = useTabsStore().registerCloseGuard('production-tasks', async () => {
    if (submitting.value) return false;
    await handleTaskDialogClose(false);
    return !taskDialogVisible.value;
  });
  onScopeDispose(unregister);
  return {
    taskDialogVisible,
    detailDialogVisible,
    editingTaskId,
    submitting,
    activeBatch,
    detailBatchId,
    detailLoading,
    detailError,
    taskFormDialogRef,
    openCreate,
    handleTaskDialogClose,
    openEdit,
    submitTask,
    refreshTaskDetail,
    handleDetailVisibility,
    openDetail,
    canLocateDetail,
    taskIntentStatus,
    retryTask,
  };
}
