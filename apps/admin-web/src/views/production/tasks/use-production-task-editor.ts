import { ref } from 'vue';
import type {
  CreateProductionBatchPayload,
  ProductionBatchDetail,
  ProductionBatchItem,
  UpdateProductionBatchPayload,
} from '@company/contracts';
import { normalizeCreateBatchPayload } from '@company/utils';
import { productionTasksApi } from '../../../api/production/tasks';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import {
  useIdempotentIntent,
  type IdempotentIntentStatus,
} from '../../../composables/idempotency/useIdempotentIntent';
import { confirmSubmissionClose } from '../../../composables/idempotency/submission-recovery';
import { EMessage } from '../../../utils/message';
import type { TaskFormValue } from './task-form';

export function useProductionTaskEditor(loadTasks: () => Promise<void>) {
  const createBatchIntent = useIdempotentIntent();
  const taskIntentStatus = ref<IdempotentIntentStatus>('idle');
  let submittedCreateCommand: {
    workOrderId: string;
    payload: ReturnType<typeof normalizeCreateBatchPayload>;
  } | null = null;
  let editingTaskPlan: {
    plannedQuantity: number;
    routeId: string | null;
    isDraft: boolean;
  } | null = null;
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
    editingTaskPlan = null;
    taskFormDialogRef.value?.resetForm();
    createBatchIntent.reset();
    taskIntentStatus.value = 'idle';
    submittedCreateCommand = null;
    taskDialogVisible.value = true;
  };

  const restartTask = (): void => {
    if (submitting.value) return;
    createBatchIntent.reset();
    taskIntentStatus.value = 'idle';
    submittedCreateCommand = null;
  };
  const discardTaskDialog = (): void => {
    if (submitting.value) return;
    editRead.invalidate();
    taskDialogVisible.value = false;
    restartTask();
  };
  const canCloseTaskDialog = async (): Promise<boolean> => {
    if (submitting.value) return false;
    if (!taskDialogVisible.value && createBatchIntent.getStatus() === 'idle') return true;
    return confirmSubmissionClose(createBatchIntent.getStatus(), {
      entityLabel: '任务',
      dirty: taskDialogVisible.value && taskFormDialogRef.value?.isDirty(),
    });
  };
  const handleTaskDialogClose = async (visible: boolean): Promise<void> => {
    if (visible) {
      taskDialogVisible.value = true;
      return;
    }
    if (await canCloseTaskDialog()) discardTaskDialog();
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
      if (detail.status === 'completed' || detail.status === 'cancelled') {
        throw new Error('当前任务已结束，只能查看详情');
      }
      editingTaskId.value = detail.id;
      editingTaskVersion.value = detail.version;
      editingTaskPlan = {
        plannedQuantity: Number(detail.plannedQuantity),
        routeId: detail.routeId,
        isDraft: detail.status === 'draft',
      };
      taskFormDialogRef.value?.setForm(detail);
      taskDialogVisible.value = true;
    } catch (error) {
      if (request.isCurrent()) EMessage.error(error, '任务编辑信息查询失败');
    }
  };

  const saveTask = async (data?: TaskFormValue): Promise<void> => {
    if (submitting.value || !editRead.isActive()) return;
    submitting.value = true;
    let saved = false;
    try {
      const editId = editingTaskId.value;
      if (editId) {
        if (!data) return;
        const version = editingTaskVersion.value;
        const originalPlan = editingTaskPlan;
        if (version === null || !originalPlan) {
          throw new Error('任务编辑依据缺失，请关闭后重新打开');
        }
        const payload: UpdateProductionBatchPayload = {
          ownerId: data.ownerId,
          version,
        };
        if (data.plannedQuantity !== originalPlan.plannedQuantity) {
          payload.plannedQuantity = data.plannedQuantity;
        }
        if (originalPlan.isDraft) {
          payload.planStartDate = data.planStartDate || null;
          payload.planEndDate = data.planEndDate || null;
          payload.remark = data.remark || null;
          const routeId = data.routeId || null;
          if (routeId !== originalPlan.routeId) payload.routeId = routeId;
        }
        await productionTasksApi.updateBatch(editId, payload);
        EMessage.success('任务已更新');
      } else {
        if (createBatchIntent.getStatus() === 'idle' && data) {
          const payload: CreateProductionBatchPayload = {
            routeId: data.routeId || null,
            plannedQuantity: data.plannedQuantity,
            ownerId: data.ownerId,
            planStartDate: data.planStartDate,
            planEndDate: data.planEndDate,
            remark: data.remark || null,
          };
          submittedCreateCommand = {
            workOrderId: data.workOrderId,
            payload: normalizeCreateBatchPayload(payload),
          };
        }
        const command = submittedCreateCommand;
        if (!command) throw new Error('原任务提交内容缺失，请先核对任务列表');
        await createBatchIntent.execute(
          {
            intentType: 'production.batch.create',
            params: { workOrderId: command.workOrderId },
            query: {},
            body: command.payload,
          },
          (key) => productionTasksApi.createOrderBatch(command.workOrderId, command.payload, key),
        );
        submittedCreateCommand = null;
        EMessage.success('任务草稿已保存，请在列表中下达任务');
      }
      taskDialogVisible.value = false;
      saved = true;
    } catch (error) {
      if (createBatchIntent.getStatus() === 'idle') submittedCreateCommand = null;
      EMessage.error(error, '任务保存失败');
    } finally {
      taskIntentStatus.value = createBatchIntent.getStatus();
      submitting.value = false;
    }
    if (saved) {
      try {
        await loadTasks();
      } catch (error) {
        EMessage.error(error, '任务已保存，列表刷新失败，请刷新列表核对');
      }
    }
  };
  const submitTask = (data: TaskFormValue): Promise<void> => saveTask(data);

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
  const retryTask = (): Promise<void> => saveTask();
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
    canCloseTaskDialog,
    discardTaskDialog,
    openEdit,
    submitTask,
    refreshTaskDetail,
    handleDetailVisibility,
    openDetail,
    canLocateDetail,
    taskIntentStatus,
    retryTask,
    restartTask,
  };
}
