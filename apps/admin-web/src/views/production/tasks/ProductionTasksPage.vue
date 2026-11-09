<template>
  <div class="tasks-page">
    <section class="query-panel">
      <el-form
        class="query-form"
        :inline="true"
        :model="query"
        ><el-form-item label="关键字"
          ><el-input
            v-model="query.keyword"
            clearable
            placeholder="任务号 / 工单号 / 产品"
            @keyup.enter="searchTasks" /></el-form-item
        ><el-form-item label="状态"
          ><el-select
            v-model="query.status"
            clearable
            placeholder="全部"
            ><el-option
              v-for="item in BATCH_STATUS_META"
              :key="item.value"
              :label="item.label"
              :value="item.value" /></el-select></el-form-item
        ><el-form-item
          ><el-button
            type="primary"
            :loading="loading"
            @click="searchTasks"
            >查询</el-button
          ><el-button @click="resetQuery">重置</el-button></el-form-item
        ></el-form
      >
    </section>
    <section class="table-panel">
      <TableToolbar
        ><template #actions
          ><el-button
            type="primary"
            :icon="Plus"
            @click="openCreate"
            >新增任务</el-button
          ></template
        ><template #tools
          ><el-button
            :icon="Refresh"
            text
            :loading="loading"
            @click="loadTasks"
            >刷新</el-button
          ></template
        ></TableToolbar
      >
      <el-table
        v-loading="loading"
        :data="batches"
        row-key="id"
        class="tasks-table"
      >
        <el-table-column
          label="任务 / 工单"
          min-width="185"
          ><template #default="{ row }"
            ><strong>{{ row.batchNo }}</strong>
            <div class="sub-text">{{ row.workOrderNo }}</div></template
          ></el-table-column
        >
        <el-table-column
          label="产品"
          min-width="180"
          ><template #default="{ row }"
            ><strong>{{ row.productName }}</strong>
            <div class="product-meta">
              <span class="sub-text">{{ row.productCode }}</span
              ><el-tag
                :type="taskTypeTagType(row.orderType)"
                size="small"
                >{{ taskTypeLabel(row) }}</el-tag
              >
            </div></template
          ></el-table-column
        >
        <el-table-column
          label="计划数量"
          width="105"
          align="right"
          ><template #default="{ row }">{{
            formatQuantity(row.plannedQuantity)
          }}</template></el-table-column
        >
        <el-table-column
          label="实际最终产出"
          min-width="135"
          align="right"
          ><template #default="{ row }"
            ><BatchApprovedOutput
              :output="row.finalOutput"
              compact /></template
        ></el-table-column>
        <el-table-column
          label="状态"
          min-width="130"
          ><template #default="{ row }"
            ><el-tag :type="batchStatusMeta(row.status).type">{{
              batchStatusMeta(row.status).label
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column
          label="计划交期"
          width="130"
          ><template #default="{ row }">{{
            formatDateForDisplay(row.planEndDate, '未设置')
          }}</template></el-table-column
        >
        <el-table-column
          prop="ownerName"
          label="负责人"
          min-width="105"
        />
        <el-table-column
          label="操作"
          width="295"
          fixed="right"
          ><template #default="{ row }"
            ><div class="task-actions">
              <el-button
                link
                type="primary"
                @click="openDetail(row)"
                >详情</el-button
              ><el-button
                v-if="
                  row.orderType === 'mass_production' &&
                  canAccessRoute({ name: 'production-tracking' })
                "
                link
                type="primary"
                @click="openTracking(row)"
                >工序追踪</el-button
              ><el-button
                v-if="canStartBatch(row)"
                link
                type="primary"
                @click="openLifecycle(row, 'start')"
                >任务开工</el-button
              ><el-button
                v-else-if="row.status === 'doing'"
                link
                type="warning"
                @click="openLifecycle(row, 'finish')"
                >结束任务</el-button
              ><el-dropdown trigger="click"
                ><el-button
                  link
                  type="primary"
                  >更多<el-icon><ArrowDown /></el-icon></el-button
                ><template #dropdown
                  ><el-dropdown-menu
                    ><el-dropdown-item
                      v-if="
                        row.orderType === 'research' &&
                        row.status === 'doing' &&
                        !row.finalOutput.confirmedOutputCount
                      "
                      @click="openLifecycle(row, 'research-output')"
                      >登记研发产出</el-dropdown-item
                    ><el-dropdown-item
                      v-if="row.status === 'pending'"
                      @click="openMaterialDemandConfiguration(row)"
                      >配置物料需求</el-dropdown-item
                    ><el-dropdown-item @click="openMaterialDemandOverview(row)"
                      >物料需求</el-dropdown-item
                    ><el-dropdown-item
                      v-if="canHandleMaterials(row)"
                      @click="openMaterialAllocation(row)"
                      >分配物料</el-dropdown-item
                    ><el-dropdown-item
                      v-if="canHandleMaterials(row)"
                      @click="openMaterialOutbound(row)"
                      >领料出库</el-dropdown-item
                    ><el-dropdown-item
                      v-if="canEditBatch(row)"
                      divided
                      @click="openEdit(row)"
                      >编辑任务</el-dropdown-item
                    ><el-dropdown-item
                      v-if="canStartBatch(row)"
                      @click="openBatchCancellation(row)"
                      >取消任务</el-dropdown-item
                    ></el-dropdown-menu
                  ></template
                ></el-dropdown
              >
            </div></template
          ></el-table-column
        > </el-table
      ><PaginationFooter
        :total="total"
        :current-page="currentPage"
        :page-size="pageSize"
        @update:page-size="handlePageSizeChange"
        @page-change="handlePageChange"
      />
    </section>
    <TaskFormDialog
      ref="taskFormDialogRef"
      :visible="taskDialogVisible"
      :editing-task-id="editingTaskId"
      :submitting="submitting"
      :intent-status="taskIntentStatus"
      @retry="retryTask"
      @update:visible="handleTaskDialogClose"
      @save="submitTask"
    />
    <TaskDetailDialog
      :visible="detailDialogVisible"
      :batch="activeBatch"
      :loading="detailLoading"
      :error="detailError"
      @update:visible="handleDetailVisibility"
      @refresh="refreshTaskDetail"
    />
    <TaskLifecycleDialog
      v-model:visible="lifecycleVisible"
      :batch="lifecycleBatch"
      :mode="lifecycleMode"
      @changed="taskPhaseChanged"
    />
    <MaterialDemandConfigurationDialog
      :visible="materialDemandConfigurationVisible"
      :batch="materialDemandBatch"
      @update:visible="materialDemandConfigurationVisible = $event"
      @configured="handleMaterialDemandsConfigured"
    />

    <MaterialDemandOverviewDialog
      ref="materialDemandOverviewDialog"
      :visible="materialDemandOverviewVisible"
      :batch="materialDemandBatch"
      :demands="materialOverviewDemands"
      :loading="materialOverviewLoading"
      :error="materialOverviewError"
      @update:visible="materialDemandOverviewVisible = $event"
      @add-manual="openManualMaterialDemand"
      @changed="handleManualMaterialDemandAdded"
      @refresh="loadMaterialDemandOverview"
    />

    <ManualMaterialDemandDialog
      :visible="manualMaterialDemandVisible"
      :batch="materialDemandBatch"
      @update:visible="manualMaterialDemandVisible = $event"
      @added="handleManualMaterialDemandAdded"
    />

    <MaterialDemandAllocationDialog
      :visible="materialAllocationVisible"
      :demands="visibleMaterialDemands"
      :available-item-batches="materials.availableItemBatches.value"
      :loading-demands="materials.loadingDemands.value"
      :loading-available="materials.loadingAvailable.value"
      :submitting="materials.submitting.value"
      :release-pending-ids="materials.releasePendingIds.value"
      @update:visible="handleMaterialAllocationClose"
      @load-available="materials.loadAvailable"
      @allocate="handleMaterialAllocate"
      @release="handleMaterialRelease"
    />

    <MaterialOutboundDialog
      :visible="materialOutboundVisible"
      :demands="visibleMaterialDemands"
      :outbounds="materials.outbounds.value"
      :loading-outbounds="materials.loadingOutbounds.value"
      :loading-demands="materials.loadingDemands.value"
      :intent-status="materials.getOutboundIntentStatus()"
      :submitting="materials.submitting.value"
      @update:visible="handleMaterialOutboundClose"
      @submit="handleMaterialOutbound"
    />

    <ProductionBatchCancelDialog
      :visible="batchCancelDialogVisible"
      :batch="cancellingBatch"
      :check="batchCancellationCheck"
      :submitting="batchCancelSubmitting"
      @update:visible="batchCancelDialogVisible = $event"
      @confirm="confirmBatchCancellation"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowDown, Plus, Refresh } from '@element-plus/icons-vue';
import type {
  ProductionBatchCancellationCheck,
  ProductionBatchItem,
  CreateMaterialAllocationsPayload,
  CreateMaterialOutboundPayload,
  ProductionMaterialAllocationItem,
  ProductionMaterialDemandItem,
} from '@company/contracts';
import { WORK_ORDER_TYPE_LABELS } from '@company/constants';
import TableToolbar from '../../../components/TableToolbar.vue';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import { productionMaterialDemandsApi } from '../../../api/production/material-demands';
import { productionTasksApi } from '../../../api/production/tasks';
import { useRowPending } from '../../../composables/use-row-pending';
import { formatDateForDisplay } from '../../../utils/date';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox as ElMessageBox } from '../../../utils/route-message-box';
import { formatQuantity } from '../../../utils/quantity';
import { BATCH_STATUS_META, batchStatusMeta } from '../shared/production-status';
import { taskTypeTagType } from '../shared/production-task-presentation';
import { useProductionBatchesList } from './use-production-batches-list';
import { useProductionTaskEditor } from './use-production-task-editor';
import TaskFormDialog from './TaskFormDialog.vue';
import TaskDetailDialog from './TaskDetailDialog.vue';
import TaskLifecycleDialog, { type TaskLifecycleMode } from './TaskLifecycleDialog.vue';
import BatchApprovedOutput from '../shared/BatchApprovedOutput.vue';
import ProductionBatchCancelDialog from './ProductionBatchCancelDialog.vue';
import MaterialDemandAllocationDialog from '../materials/MaterialDemandAllocationDialog.vue';
import MaterialOutboundDialog from '../materials/MaterialOutboundDialog.vue';
import { useProductionMaterials } from '../materials/use-production-materials';
import MaterialDemandConfigurationDialog from '../materials/MaterialDemandConfigurationDialog.vue';
import MaterialDemandOverviewDialog from '../materials/MaterialDemandOverviewDialog.vue';
import ManualMaterialDemandDialog from '../materials/ManualMaterialDemandDialog.vue';

defineOptions({ name: 'ProductionTasksPage' });
const route = useRoute(),
  router = useRouter();
const { canAccessRoute } = useRouteAccess();
const {
  batches,
  loading,
  total,
  currentPage,
  pageSize,
  query,
  loadTasks,
  loadPageData,
  searchTasks,
  resetQuery,
  handlePageSizeChange,
  handlePageChange,
} = useProductionBatchesList();
const {
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
} = useProductionTaskEditor(loadTasks);
const { beginRow, endRow } = useRowPending();
const taskTypeLabel = (row: ProductionBatchItem): string => WORK_ORDER_TYPE_LABELS[row.orderType];
const lifecycleVisible = ref(false),
  lifecycleBatch = ref<ProductionBatchItem | null>(null),
  lifecycleMode = ref<TaskLifecycleMode>('start');
function openLifecycle(batch: ProductionBatchItem, mode: TaskLifecycleMode): void {
  if (lifecycleVisible.value) return;
  lifecycleBatch.value = { ...batch };
  lifecycleMode.value = mode;
  lifecycleVisible.value = true;
}
async function openTracking(batch: ProductionBatchItem): Promise<void> {
  await router.push({ name: 'production-tracking', query: { batchId: batch.id } });
}
async function taskPhaseChanged(batchId: string): Promise<void> {
  const updates: Promise<unknown>[] = [loadTasks()];
  if (detailBatchId.value === batchId && detailDialogVisible.value)
    updates.push(refreshTaskDetail());
  if (materials.batchId.value === batchId)
    updates.push(materials.loadDemands(), materials.loadOutbounds());
  if (materialDemandBatch.value?.id === batchId && materialDemandOverviewVisible.value)
    updates.push(loadMaterialDemandOverview());
  const results = await Promise.allSettled(updates);
  for (const result of results)
    if (result.status === 'rejected')
      EMessage.error(result.reason, '任务已变更，部分详情刷新失败，请重新核对');
}
const materialAllocationVisible = ref(false),
  materialDemandConfigurationVisible = ref(false),
  materialDemandOverviewVisible = ref(false),
  manualMaterialDemandVisible = ref(false),
  materialOutboundVisible = ref(false);
const materialDemandOverviewDialog = ref<InstanceType<typeof MaterialDemandOverviewDialog> | null>(
  null,
);
const materialDemandBatch = ref<ProductionBatchItem | null>(null),
  materialOverviewDemands = ref<ProductionMaterialDemandItem[]>([]),
  materialOverviewLoading = ref(false),
  materialOverviewError = ref('');
const materialOverviewRead = useLatestReadRequest(() => {
  materialOverviewLoading.value = false;
});
watch(materialDemandOverviewVisible, (visible) => {
  if (!visible) materialOverviewRead.invalidate();
});
const batchCancelDialogVisible = ref(false),
  batchCancelSubmitting = ref(false),
  cancellingBatch = ref<ProductionBatchItem | null>(null),
  batchCancellationCheck = ref<ProductionBatchCancellationCheck | null>(null);
const materials = useProductionMaterials();
const visibleMaterialDemands = computed(() => materials.demands.value);
const openMaterialAllocation = async (row: ProductionBatchItem): Promise<void> => {
  if (!(await prepareMaterialBatch(row.id))) return;
  materials.setBatch(row.id);
  materialAllocationVisible.value = true;
  try {
    await materials.loadDemands();
  } catch (error) {
    EMessage.error(error, '物料需求查询失败');
  }
};
const handleMaterialAllocate = async (payload: CreateMaterialAllocationsPayload): Promise<void> => {
  try {
    await materials.allocate(payload);
    EMessage.success('物料分配已完成');
    await loadTasks();
  } catch (error) {
    EMessage.error(error, materialErrorFallback(error, '物料分配失败'));
  }
};
const handleMaterialRelease = async (
  allocation: ProductionMaterialAllocationItem,
): Promise<void> => {
  try {
    await materials.release(allocation.allocationId, allocation.version);
    EMessage.success('未出库分配已释放');
    await loadTasks();
  } catch (error) {
    EMessage.error(error, materialErrorFallback(error, '物料分配释放失败'));
  }
};
const openMaterialOutbound = async (row: ProductionBatchItem): Promise<void> => {
  if (!(await prepareMaterialBatch(row.id))) return;
  materials.setBatch(row.id);
  materialOutboundVisible.value = true;
  try {
    await Promise.all([materials.loadDemands(), materials.loadOutbounds()]);
  } catch (error) {
    EMessage.error(error, '生产领料数据查询失败');
  }
};
const handleMaterialOutbound = async (payload: CreateMaterialOutboundPayload): Promise<void> => {
  try {
    await materials.outbound(payload);
    EMessage.success('待出库单已创建，请打印并完成线下拣货后再整单确认');
    await loadTasks();
  } catch (error) {
    EMessage.error(error, materialErrorFallback(error, '待出库单创建失败'));
  }
};
const materialIntentMessage = (operation: string, state: string): string => {
  if (state === 'blocked')
    return `暂时无法确认${operation}是否成功，当前不能继续提交。请先核对需求、出库记录和库存，并联系管理员；确认关闭当前操作？`;
  if (state === 'expired')
    return `${operation}已超过可重试时限。请先核对需求、出库记录和库存；重新办理可能重复提交，确认关闭当前操作？`;
  return `暂时无法确认${operation}是否成功。关闭后无法继续重试本次提交，重新办理可能重复操作；请先核对需求、出库记录和库存，确认关闭？`;
};
const confirmMaterialIntentReset = async (
  operation: string,
  status: 'idle' | 'pending' | 'blocked' | 'expired',
  reset: () => void,
): Promise<boolean> => {
  if (status === 'idle') {
    reset();
    return true;
  }
  try {
    await ElMessageBox.confirm(materialIntentMessage(operation, status), '确认关闭当前操作', {
      confirmButtonText: '核对后仍要放弃',
      cancelButtonText: '继续保留',
      type: 'warning',
    });
    reset();
    return true;
  } catch {
    return false;
  }
};
const prepareMaterialBatch = async (nextBatchId: string): Promise<boolean> => {
  if (!materials.batchId.value || materials.batchId.value === nextBatchId) return true;
  if (
    !(await confirmMaterialIntentReset(
      '物料分配',
      materials.getAllocationIntentStatus(),
      materials.resetAllocationIntent,
    ))
  )
    return false;
  return confirmMaterialIntentReset(
    '生产领料出库',
    materials.getOutboundIntentStatus(),
    materials.resetOutboundIntent,
  );
};
const handleMaterialAllocationClose = async (visible: boolean): Promise<void> => {
  if (visible) {
    materialAllocationVisible.value = true;
    return;
  }
  if (
    await confirmMaterialIntentReset(
      '物料分配',
      materials.getAllocationIntentStatus(),
      materials.resetAllocationIntent,
    )
  )
    materialAllocationVisible.value = false;
};
const handleMaterialOutboundClose = async (visible: boolean): Promise<void> => {
  if (materials.submitting.value) return;
  if (visible) {
    materialOutboundVisible.value = true;
    return;
  }
  if (
    await confirmMaterialIntentReset(
      '生产领料出库',
      materials.getOutboundIntentStatus(),
      materials.resetOutboundIntent,
    )
  )
    materialOutboundVisible.value = false;
};
const materialErrorFallback = (error: unknown, fallback: string): string => {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  const messages: Record<string, string> = {
    INSUFFICIENT_AVAILABLE_STOCK: '库存已变化，请刷新库存批次后重新分配',
    ALLOCATION_EXCEEDS_DEMAND: '分配数量超过当前需求缺口，请刷新需求后重试',
    ALLOCATION_ALREADY_OUTBOUND: '该分配已发生出库，不能释放',
    OUTBOUND_EXCEEDS_ALLOCATION: '出库数量超过当前未出库量，请刷新后重试',
    ALLOCATION_PENDING_OUTBOUND: '该分配已有待确认出库单，请先取消相关单据',
    CONCURRENT_MODIFICATION: '数据已被其他操作修改，请刷新后重试',
  };
  return messages[code] ?? fallback;
};

const openBatchCancellation = async (row: ProductionBatchItem): Promise<void> => {
  if (!beginRow(row.id)) return;
  try {
    const check = await productionTasksApi.getBatchCancellationCheck(row.id);
    cancellingBatch.value = { ...row, status: check.batchStatus, version: check.version };
    batchCancellationCheck.value = check;
    batchCancelDialogVisible.value = true;
  } catch (error) {
    EMessage.error(error, '取消任务影响核对失败');
  } finally {
    endRow(row.id);
  }
};

const confirmBatchCancellation = async (reason: string): Promise<void> => {
  const batch = cancellingBatch.value;
  const check = batchCancellationCheck.value;
  if (!batch || !check || !beginRow(batch.id)) return;
  batchCancelSubmitting.value = true;
  try {
    await productionTasksApi.cancelBatch(batch.id, { version: check.version, reason });
    EMessage.success('生产任务已取消，待出库单、物料预留和活动需求已按提示处理');
    batchCancelDialogVisible.value = false;
    cancellingBatch.value = null;
    batchCancellationCheck.value = null;
    await loadTasks();
  } catch (error) {
    EMessage.error(error, '生产任务取消失败');
  } finally {
    batchCancelSubmitting.value = false;
    endRow(batch.id);
  }
};

const canHandleMaterials = (row: ProductionBatchItem): boolean =>
  [
    'material_pending',
    'material_assigned',
    'material_partially_outbound',
    'material_outbound',
    'doing',
  ].includes(row.status);
const canStartBatch = (row: ProductionBatchItem): boolean =>
  [
    'pending',
    'material_pending',
    'material_assigned',
    'material_partially_outbound',
    'material_outbound',
  ].includes(row.status);
const canEditBatch = (row: ProductionBatchItem): boolean => row.status === 'pending';
const closeMaterialDemandOverview = async (): Promise<boolean> =>
  !materialDemandOverviewVisible.value ||
  (await materialDemandOverviewDialog.value?.close()) === true;
const openMaterialDemandConfiguration = async (row: ProductionBatchItem): Promise<void> => {
  if (!(await closeMaterialDemandOverview())) return;
  materialDemandBatch.value = row;
  if (row.orderType === 'research') manualMaterialDemandVisible.value = true;
  else materialDemandConfigurationVisible.value = true;
};
const loadMaterialDemandOverview = async (): Promise<void> => {
  if (
    !materialDemandOverviewVisible.value ||
    !materialDemandBatch.value ||
    !materialOverviewRead.isActive()
  )
    return;
  const batchId = materialDemandBatch.value.id;
  const current = materialOverviewRead.begin(
    () => materialDemandOverviewVisible.value && materialDemandBatch.value?.id === batchId,
  );
  materialOverviewLoading.value = true;
  materialOverviewError.value = '';
  try {
    const demands = await productionMaterialDemandsApi.listMaterialDemands(batchId, {
      signal: current.signal,
      skipErrorHandling: true,
    });
    if (current.isCurrent()) materialOverviewDemands.value = demands;
  } catch (error) {
    if (!current.isCurrent()) return;
    materialOverviewDemands.value = [];
    materialOverviewError.value =
      error instanceof Error ? error.message : '物料需求查询失败，请刷新重试';
  } finally {
    if (current.isCurrent()) materialOverviewLoading.value = false;
  }
};
const openMaterialDemandOverview = async (row: ProductionBatchItem): Promise<void> => {
  if (!(await closeMaterialDemandOverview())) return;
  materialDemandBatch.value = row;
  materialOverviewDemands.value = [];
  materialOverviewError.value = '';
  materialDemandOverviewVisible.value = true;
  void loadMaterialDemandOverview();
};
const openManualMaterialDemand = (): void => {
  manualMaterialDemandVisible.value = true;
};
const handleMaterialDemandsConfigured = async (): Promise<void> => {
  await loadTasks();
};
const handleManualMaterialDemandAdded = async (): Promise<void> => {
  await Promise.all([loadMaterialDemandOverview(), loadTasks()]);
};

let consumedLocation = '';
function locateTask(): void {
  if (
    route.name !== 'production-tasks' ||
    !canLocateDetail() ||
    typeof route.query.batchId !== 'string' ||
    route.query.batchId === consumedLocation
  )
    return;
  consumedLocation = route.query.batchId;
  void openDetail({ id: consumedLocation });
}
watch(() => [route.name, route.query.batchId], locateTask, { immediate: true });
onActivated(locateTask);
onMounted(() => {
  const keyword = route.query.keyword;
  if (typeof keyword === 'string') query.keyword = keyword;
  void loadPageData();
});
</script>

<style scoped>
.tasks-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.query-panel,
.table-panel {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
}
.query-panel {
  padding: 20px 20px 4px;
}
.query-form {
  display: flex;
  align-items: flex-start;
  gap: 10px 22px;
}
.query-form :deep(.el-form-item) {
  margin-right: 0;
  margin-bottom: 16px;
}
.query-form :deep(.el-form-item__label) {
  height: 34px;
  padding-right: 8px;
  color: var(--el-text-color-primary);
  font-size: 14px;
  font-weight: 500;
  line-height: 34px;
}
.query-form :deep(.el-input),
.query-form :deep(.el-select) {
  width: 180px;
}
.query-form :deep(.el-input__wrapper),
.query-form :deep(.el-select__wrapper) {
  min-height: 34px;
  border-radius: 6px;
  box-shadow: 0 0 0 1px var(--el-border-color-lighter) inset;
}
.query-actions {
  margin-left: auto;
}
.query-actions :deep(.el-button) {
  min-width: 67px;
  height: 32px;
  border-radius: 6px;
}
.query-actions :deep(.el-button + .el-button) {
  margin-left: 12px;
}
.table-panel {
  overflow: hidden;
}
.table-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.table-toolbar :deep(.el-button) {
  height: 34px;
  border-radius: 6px;
}
.tasks-table {
  width: 100%;
  color: var(--el-text-color-primary);
  font-size: 14px;
}
.tasks-table :deep(.el-table__header th) {
  height: 48px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
  font-weight: 600;
}
.tasks-table :deep(.el-table__row) {
  height: 48px;
}
.tasks-table :deep(.el-table__row:hover) {
  background: var(--el-fill-color-light);
}
.tasks-table :deep(.el-table__cell) {
  border-bottom-color: var(--el-border-color-lighter);
}
.tasks-table :deep(.el-tag) {
  height: 22px;
  padding: 0 10px;
  border: 0;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  line-height: 22px;
}
.tasks-table :deep(tr.deadline-overdue-row) {
  --el-table-tr-bg-color: var(--el-color-warning-light-9);
  --el-table-row-hover-bg-color: var(--el-color-warning-light-8);
}
.tasks-table :deep(tr.deadline-overdue-row > td.el-table__cell) {
  background-color: var(--el-color-warning-light-9) !important;
}
.tasks-table :deep(tr.deadline-overdue-row:hover > td.el-table__cell) {
  background: var(--el-color-warning-light-8) !important;
}
.deadline-badge {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  margin-top: 4px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  line-height: 20px;
}
.deadline-muted {
  border-color: var(--el-border-color-lighter);
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
}
.deadline-normal {
  border-color: var(--el-color-primary-light-8);
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}
.deadline-warning {
  border-color: var(--el-color-warning-light-8);
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning);
}
.phase-hint {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}
.task-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
}
.task-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.task-more-menu :deep(.task-action-warning:not(.is-disabled)) {
  --el-text-color-regular: var(--el-color-warning);
  --el-dropdown-menuItem-hover-color: var(--el-color-warning);
  --el-dropdown-menuItem-hover-fill: var(--el-color-warning-light-9);
}
.task-more-menu :deep(.task-action-danger:not(.is-disabled)) {
  --el-text-color-regular: var(--el-color-danger);
  --el-dropdown-menuItem-hover-color: var(--el-color-danger);
  --el-dropdown-menuItem-hover-fill: var(--el-color-danger-light-9);
}
.more-icon {
  margin-left: 3px;
}
.product-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}
.tasks-table :deep(.el-button.is-link) {
  padding: 0;
  font-weight: 500;
}
.batch-no,
.product-name {
  color: var(--el-text-color-primary);
  font-weight: 600;
}
.sub-text {
  margin-top: 2px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
@media (max-width: 1120px) {
  .query-form {
    display: grid;
    grid-template-columns: repeat(2, minmax(240px, 1fr));
  }
  .query-actions {
    margin-left: 0;
  }
}
</style>
