<template>
  <div class="tasks-page">
    <section class="query-panel">
      <el-form
        class="query-form"
        :inline="true"
        :model="query"
      >
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="批次号/工单号/产品"
          />
        </el-form-item>
        <el-form-item label="负责人">
          <el-select
            v-model="query.ownerId"
            clearable
            filterable
            placeholder="全部"
            @visible-change="(v: boolean) => v && userSource.refresh()"
          >
            <el-option
              v-for="choice in userChoices"
              :key="choice.value"
              :label="choice.option?.displayName ?? `${choice.value}（已失效）`"
              :value="choice.value"
              :disabled="choice.isUnavailable"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="query.status"
            placeholder="全部"
            clearable
          >
            <el-option
              label="全部"
              value=""
            />
            <el-option
              v-for="item in BATCH_STATUS_META"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item class="query-actions">
          <el-button
            type="primary"
            :loading="loading"
            @click="searchTasks"
            >查询</el-button
          >
          <el-button @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </section>

    <section class="table-panel">
      <TableToolbar>
        <template #actions>
          <el-button
            type="primary"
            :icon="Plus"
            @click="openCreate"
            >新增任务</el-button
          >
        </template>
        <template #tools>
          <el-tooltip
            content="刷新"
            placement="top"
          >
            <el-button
              :icon="Refresh"
              text
              circle
              :loading="loading"
              @click="loadTasks"
            />
          </el-tooltip>
        </template>
      </TableToolbar>

      <el-table
        v-loading="loading"
        :data="batches"
        row-key="id"
        :row-class-name="batchRowClass"
        class="tasks-table"
      >
        <el-table-column
          label="任务 / 工单"
          min-width="180"
        >
          <template #default="{ row }">
            <div class="batch-no">{{ row.batchNo }}</div>
            <div class="sub-text">{{ row.workOrderNo || '未关联工单' }}</div>
          </template>
        </el-table-column>
        <el-table-column
          label="产品"
          min-width="190"
        >
          <template #default="{ row }">
            <div class="product-name">{{ row.productName }}</div>
            <div class="product-meta">
              <span class="sub-text">{{ row.productCode }}</span>
              <el-tag
                size="small"
                :type="taskTypeTagType(row.orderType)"
                effect="light"
                >{{ taskTypeLabel(row) }}</el-tag
              >
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="计划数量"
          width="100"
          align="right"
        >
          <template #default="{ row }">{{ formatQuantity(row.plannedQuantity) }}</template>
        </el-table-column>
        <el-table-column
          label="当前批准产出"
          min-width="135"
        >
          <template #header>
            <el-tooltip
              content="当前有效批准清单的可用量为计划内加计划外，不含报废，不代表报工量或实际入库量。完整清单见任务详情。"
            >
              <span>当前批准产出</span>
            </el-tooltip>
          </template>
          <template #default="{ row }"
            ><BatchApprovedOutput
              :output="row.finalOutput"
              compact
          /></template>
        </el-table-column>
        <el-table-column
          label="任务状态"
          min-width="190"
        >
          <template #default="{ row }">
            <el-tag
              :type="batchStatusMeta(row.status).type"
              effect="light"
              >{{ batchStatusMeta(row.status).label }}</el-tag
            >
            <div class="phase-hint">{{ taskNextAction(row).label }}</div>
          </template>
        </el-table-column>
        <el-table-column
          label="交期"
          width="130"
        >
          <template #default="{ row }">
            <div>{{ formatDateForDisplay(row.planEndDate, '未设置') }}</div>
            <span
              v-if="row.planEndDate"
              :class="['deadline-badge', `deadline-${batchDeadline(row).tone}`]"
              >{{ batchDeadline(row).label }}</span
            >
          </template>
        </el-table-column>
        <el-table-column
          label="负责人"
          min-width="110"
        >
          <template #default="{ row }">{{ row.ownerName || '未指定' }}</template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="290"
          fixed="right"
        >
          <template #default="{ row }">
            <div class="task-actions">
              <el-button
                link
                type="primary"
                @click="openDetail(row)"
                >详情</el-button
              >
              <el-button
                v-if="row.orderType === 'mass_production'"
                link
                type="primary"
                @click="openSteps(row)"
                >工序管理</el-button
              >
              <el-button
                v-if="row.status === 'pending'"
                link
                type="primary"
                @click="openMaterialDemandConfiguration(row)"
                >配置需求</el-button
              >
              <el-button
                v-else-if="canStartBatch(row)"
                link
                type="primary"
                @click="openExecutionStart(row)"
                >任务开工</el-button
              >
              <el-button
                v-else-if="row.orderType === 'research' && row.status === 'doing'"
                link
                type="warning"
                @click="openResearchExecution(row)"
                >结束本轮研发</el-button
              >
              <el-button
                v-else-if="['closing', 'completed', 'terminated'].includes(row.status)"
                link
                :type="batchCloseoutActionType(row.status)"
                @click="openCloseout(row)"
                >{{ batchCloseoutActionLabel(row.status, row.closeoutMode) }}</el-button
              >
              <el-dropdown trigger="click">
                <el-button
                  link
                  type="primary"
                  >更多<el-icon class="more-icon"><ArrowDown /></el-icon
                ></el-button>
                <template #dropdown>
                  <el-dropdown-menu class="task-more-menu">
                    <el-dropdown-item @click="openMaterialDemandOverview(row)"
                      >物料需求</el-dropdown-item
                    >
                    <el-dropdown-item
                      v-if="canHandleMaterials(row)"
                      @click="openMaterialAllocation(row)"
                      >分配物料</el-dropdown-item
                    >
                    <el-dropdown-item
                      v-if="canHandleMaterials(row)"
                      @click="openMaterialOutbound(row)"
                      >领料出库</el-dropdown-item
                    >
                    <el-dropdown-item
                      v-if="canEditBatch(row)"
                      divided
                      @click="openEdit(row)"
                      >编辑任务</el-dropdown-item
                    >
                    <el-dropdown-item
                      v-if="row.status === 'pending'"
                      @click="openExecutionStart(row)"
                      >任务开工</el-dropdown-item
                    >
                    <el-dropdown-item
                      v-if="
                        ['material_partially_outbound', 'material_outbound', 'doing'].includes(
                          row.status,
                        )
                      "
                      divided
                      class="task-action-warning"
                      @click="openCloseout(row)"
                      >提前结束</el-dropdown-item
                    >
                    <el-dropdown-item
                      v-if="row.status === 'closing'"
                      divided
                      class="task-action-warning"
                      @click="openCloseoutWithdrawal(row)"
                      >撤回结束</el-dropdown-item
                    >
                    <el-dropdown-item
                      v-if="
                        !['completed', 'cancelled', 'terminated', 'closing'].includes(row.status)
                      "
                      divided
                      class="task-action-danger"
                      :disabled="isRowPending(row.id)"
                      @click="openBatchCancellation(row)"
                      >取消任务</el-dropdown-item
                    >
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <PaginationFooter
        :total="total"
        :current-page="currentPage"
        :page-size="pageSize"
        @update:page-size="handlePageSizeChange"
        @page-change="handlePageChange"
      />
    </section>

    <!-- 新增/编辑任务弹窗 -->
    <TaskFormDialog
      ref="taskFormDialogRef"
      :visible="taskDialogVisible"
      :editing-task-id="editingTaskId"
      :user-options="userSource.options.value"
      :sop-file-options="sopFileOptions"
      :submitting="submitting"
      @update:visible="handleTaskDialogClose"
      @refresh-users="userSource.refresh"
      @refresh-sop-files="refreshSopFiles"
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

    <ProductionTaskStepsDialog
      ref="stepsDialog"
      v-model:visible="stepsVisible"
      :batch-id="stepsBatchId"
      :batch-label="stepsBatchLabel"
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

    <ResearchExecutionDialog
      v-model:visible="researchExecutionVisible"
      :batch="batches.find((row) => row.id === researchExecutionBatch?.id) ?? null"
      @changed="researchExecutionChanged"
    />
    <ProductionExecutionStartDialog
      ref="executionStartDialog"
      v-model:visible="executionStartVisible"
      :batch-id="executionStartBatch?.id ?? null"
      :batch-label="
        executionStartBatch
          ? `${executionStartBatch.batchNo} · ${executionStartBatch.productName}`
          : ''
      "
      @changed="taskPhaseChanged"
    />
    <ProductionCloseoutWithdrawalDialog
      ref="closeoutWithdrawalDialog"
      v-model:visible="closeoutWithdrawalVisible"
      :batch-id="closeoutWithdrawalBatch?.id ?? null"
      :batch-label="
        closeoutWithdrawalBatch
          ? `${closeoutWithdrawalBatch.batchNo} · ${closeoutWithdrawalBatch.productName}`
          : ''
      "
      @changed="taskPhaseChanged"
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

    <ProductionBatchTerminationDialog
      ref="terminationDialog"
      v-model:visible="terminationVisible"
      :batch-id="terminationBatchId"
      @terminated="closeoutChanged"
      @open-output="openOutput"
      @open-withdrawal="openOutputWithdrawal"
    />
    <ProductionOutputDialog
      ref="outputDialog"
      v-model:visible="outputVisible"
      :batch-id="outputBatchId"
      @changed="loadTasks"
      @open-closeout="openCloseoutItems"
      @open-withdrawal="openOutputWithdrawal"
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
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowDown, Plus, Refresh } from '@element-plus/icons-vue';
import TableToolbar from '../../components/TableToolbar.vue';
import PaginationFooter from '../../components/PaginationFooter.vue';
import type {
  CreateProductionBatchPayload,
  ProductionBatchDetail,
  ProductionBatchCancellationCheck,
  ProductionBatchItem,
  CreateMaterialAllocationsPayload,
  CreateMaterialOutboundPayload,
  ProductionMaterialAllocationItem,
  ProductionMaterialDemandItem,
} from '@company/contracts';
import { WORK_ORDER_TYPE_LABELS } from '@company/constants';
import { useLatestReadRequest } from '../../composables/requests/useLatestReadRequest';
import { normalizeCreateBatchPayload } from '@company/utils';
import { productionApi } from '../../api/production';
import { formatDateForDisplay } from '../../utils/date';
import { EMessage } from '../../utils/message';
import { RouteMessageBox as ElMessageBox } from '../../utils/route-message-box';
import { useRowPending } from '../../utils/useRowPending';
import { BATCH_STATUS_META, batchStatusMeta, formatQuantity } from './production-status';
import { useProductionBatchesList } from './composables/useProductionBatchesList';
import { useIdempotentIntent } from '../../composables/idempotency/useIdempotentIntent';
import { useUserOptions } from '../../composables/options/useUserOptions';
import { buildLiveOptions } from '../../utils/live-options';
import TaskFormDialog from './components/TaskFormDialog.vue';
import type { TaskFormValue } from './components/TaskFormDialog.vue';
import TaskDetailDialog from './components/TaskDetailDialog.vue';
import BatchApprovedOutput from './components/BatchApprovedOutput.vue';
import ProductionTaskStepsDialog from './components/ProductionTaskStepsDialog.vue';
import MaterialDemandAllocationDialog from './components/MaterialDemandAllocationDialog.vue';
import MaterialOutboundDialog from './components/MaterialOutboundDialog.vue';
import { useProductionMaterials } from './composables/useProductionMaterials';
import {
  batchCloseoutActionLabel,
  batchCloseoutActionType,
  deadlinePresentation,
  taskNextActionPresentation,
  taskTypeTagType,
} from './production-task-presentation';
import ProductionBatchTerminationDialog from './components/ProductionBatchTerminationDialog.vue';
import ProductionOutputDialog from './components/ProductionOutputDialog.vue';
import ProductionBatchCancelDialog from './components/ProductionBatchCancelDialog.vue';
import MaterialDemandConfigurationDialog from './components/MaterialDemandConfigurationDialog.vue';
import MaterialDemandOverviewDialog from './components/MaterialDemandOverviewDialog.vue';
import ManualMaterialDemandDialog from './components/ManualMaterialDemandDialog.vue';
import ResearchExecutionDialog from './components/ResearchExecutionDialog.vue';
import ProductionExecutionStartDialog from './components/ProductionExecutionStartDialog.vue';
import ProductionCloseoutWithdrawalDialog from './components/ProductionCloseoutWithdrawalDialog.vue';

defineOptions({ name: 'ProductionTasksPage' });

const researchExecutionVisible = ref(false);
const researchExecutionBatch = ref<ProductionBatchItem | null>(null);
const openResearchExecution = (batch: ProductionBatchItem) => {
  researchExecutionBatch.value = batch;
  researchExecutionVisible.value = true;
};
const researchExecutionChanged = async (batchId: string, completed: boolean) => {
  await taskPhaseChanged(batchId);
  if (completed) openOutput(batchId);
};
const executionStartVisible = ref(false);
const executionStartBatch = ref<ProductionBatchItem | null>(null);
const executionStartDialog = ref<InstanceType<typeof ProductionExecutionStartDialog> | null>(null);
const closeoutWithdrawalVisible = ref(false);
const closeoutWithdrawalBatch = ref<ProductionBatchItem | null>(null);
const closeoutWithdrawalDialog = ref<InstanceType<
  typeof ProductionCloseoutWithdrawalDialog
> | null>(null);
const terminationDialog = ref<InstanceType<typeof ProductionBatchTerminationDialog> | null>(null);
const openExecutionStart = async (batch: ProductionBatchItem): Promise<void> => {
  if (executionStartVisible.value && !(await executionStartDialog.value?.close())) return;
  await nextTick();
  executionStartBatch.value = { ...batch };
  executionStartVisible.value = true;
};
const openCloseoutWithdrawal = async (batch: ProductionBatchItem): Promise<void> => {
  if (closeoutWithdrawalVisible.value && !(await closeoutWithdrawalDialog.value?.close())) return;
  await nextTick();
  closeoutWithdrawalBatch.value = { ...batch };
  closeoutWithdrawalVisible.value = true;
};
const openOutputWithdrawal = async (batchId: string): Promise<void> => {
  try {
    const batch =
      batches.value.find((row) => row.id === batchId) ?? (await productionApi.getBatch(batchId));
    await openCloseoutWithdrawal(batch);
  } catch (error) {
    EMessage.error(error, '撤回任务详情查询失败');
  }
};
const closeoutChanged = async (): Promise<void> => {
  if (terminationBatchId.value) await taskPhaseChanged(terminationBatchId.value);
};
async function taskPhaseChanged(batchId: string): Promise<void> {
  const updates: Promise<unknown>[] = [loadTasks()];
  if (detailBatchId.value === batchId && detailDialogVisible.value)
    updates.push(refreshTaskDetail());
  if (materials.batchId.value === batchId)
    updates.push(materials.loadDemands(), materials.loadOutbounds());
  if (materialDemandBatch.value?.id === batchId && materialDemandOverviewVisible.value)
    updates.push(loadMaterialDemandOverview());
  if (outputVisible.value && outputBatchId.value === batchId)
    updates.push(outputDialog.value?.refresh() ?? Promise.resolve());
  if (terminationVisible.value && terminationBatchId.value === batchId)
    updates.push(terminationDialog.value?.refresh() ?? Promise.resolve());
  const results = await Promise.allSettled(updates);
  for (const result of results)
    if (result.status === 'rejected')
      EMessage.error(result.reason, '任务已变更，部分详情刷新失败，请重新核对');
}

const route = useRoute();
const router = useRouter();

const {
  batches,
  sopFileOptions,
  loading,
  total,
  currentPage,
  pageSize,
  query,
  refreshSopFiles,
  loadTasks,
  loadPageData,
  searchTasks,
  resetQuery,
  handlePageSizeChange,
  handlePageChange,
} = useProductionBatchesList();

/** 页面级负责人候选：筛选展开或任务表单打开时读取；存量 options 待后续专项替换 */
const userSource = useUserOptions();

/** 负责人筛选下拉实时选项：已选负责人在候选被移除时显示「ID（已失效）」并禁用 */
const userChoices = computed(() =>
  buildLiveOptions(
    userSource.options.value,
    query.ownerId ? [query.ownerId] : [],
    (user) => user.id,
  ),
);

const batchDeadline = (row: ProductionBatchItem) =>
  deadlinePresentation(
    row.planEndDate,
    row.status === 'completed' || row.status === 'cancelled' || row.status === 'terminated',
  );
const batchRowClass = ({ row }: { row: ProductionBatchItem }): string =>
  batchDeadline(row).overdueDays > 0 ? 'deadline-overdue-row' : '';
const taskNextAction = (row: ProductionBatchItem) => taskNextActionPresentation(row);
const taskTypeLabel = (row: ProductionBatchItem) => WORK_ORDER_TYPE_LABELS[row.orderType];

/** 行内写操作守卫（关闭剩余需求、取消任务），同一行只允许一个在途。 */
const { isRowPending, beginRow, endRow } = useRowPending();

/** 创建生产批次任务的幂等意图（试点端点）：页面局部持有，弹窗打开/关闭时清除旧意图 */
const createBatchIntent = useIdempotentIntent();

/* ====== 弹窗状态 ====== */
const outputVisible = ref(false),
  outputBatchId = ref<string | null>(null);
const outputDialog = ref<InstanceType<typeof ProductionOutputDialog> | null>(null);
let locatingOutput = false;
const openOutput = async (batchId: string): Promise<boolean> => {
  if (outputVisible.value && outputBatchId.value === batchId) return true;
  if (locatingOutput || outputDialog.value?.navigationLocked) return false;
  locatingOutput = true;
  try {
    if (outputVisible.value && outputDialog.value && !(await outputDialog.value.close()))
      return false;
    await nextTick();
    outputBatchId.value = batchId;
    outputVisible.value = true;
    return true;
  } finally {
    locatingOutput = false;
  }
};
let acceptedOutput = '';
let locatingRouteOutput = false;
async function locateOutput(): Promise<void> {
  if (route.name !== 'production-tasks' || locatingRouteOutput) return;
  const id = typeof route.query.batchId === 'string' ? route.query.batchId : '';
  if (!id) acceptedOutput = '';
  if (!/^[1-9]\d*$/.test(id)) return;
  if (acceptedOutput === id) return;
  locatingRouteOutput = true;
  try {
    await nextTick();
    const opened = await openOutput(id);
    if (route.name !== 'production-tasks' || route.query.batchId !== id) return;
    if (opened) acceptedOutput = id;
    else {
      const query = { ...route.query };
      delete query.batchId;
      const retainedBatchId = outputVisible.value ? outputBatchId.value : acceptedOutput;
      await router.replace({
        query: { ...query, ...(retainedBatchId ? { batchId: retainedBatchId } : {}) },
      });
    }
  } finally {
    locatingRouteOutput = false;
    if (route.name === 'production-tasks' && route.query.batchId !== id) void locateOutput();
  }
}
watch(
  () => [route.name, route.query.batchId],
  () => {
    void locateOutput();
  },
  { immediate: true },
);
const openCloseoutItems = (batchId: string) => {
  terminationBatchId.value = batchId;
  terminationVisible.value = true;
};
function openCloseout(batch: ProductionBatchItem) {
  if (
    batch.status === 'completed' ||
    batch.status === 'terminated' ||
    (batch.status === 'closing' && batch.closeoutMode === 'normal')
  )
    openOutput(batch.id);
  else {
    terminationBatchId.value = batch.id;
    terminationVisible.value = true;
  }
}
const terminationVisible = ref(false);
const terminationBatchId = ref<string | null>(null);
const taskDialogVisible = ref(false);
const detailDialogVisible = ref(false);
const editingTaskId = ref<string | null>(null);
const editingTaskVersion = ref<number | null>(null);
const editRead = useLatestReadRequest(() => undefined);
const submitting = ref(false);
const activeBatch = ref<ProductionBatchDetail | null>(null);
const detailBatchId = ref<string | null>(null);
const detailLoading = ref(false);
const detailError = ref('');
const detailRead = useLatestReadRequest(() => {
  detailLoading.value = false;
});
const stepsVisible = ref(false);
const stepsBatchId = ref<string | null>(null);
const stepsBatchLabel = ref('');
const stepsDialog = ref<InstanceType<typeof ProductionTaskStepsDialog> | null>(null);
const materialAllocationVisible = ref(false);
const materialDemandConfigurationVisible = ref(false);
const materialDemandOverviewVisible = ref(false);
const materialDemandOverviewDialog = ref<InstanceType<typeof MaterialDemandOverviewDialog> | null>(
  null,
);
const manualMaterialDemandVisible = ref(false);
const materialDemandBatch = ref<ProductionBatchItem | null>(null);
const materialOverviewDemands = ref<ProductionMaterialDemandItem[]>([]);
const materialOverviewLoading = ref(false);
const materialOverviewError = ref('');
const materialOverviewRead = useLatestReadRequest(() => {
  materialOverviewLoading.value = false;
});
watch(materialDemandOverviewVisible, (visible) => {
  if (!visible) materialOverviewRead.invalidate();
});
const materialOutboundVisible = ref(false);
const batchCancelDialogVisible = ref(false);
const batchCancelSubmitting = ref(false);
const cancellingBatch = ref<ProductionBatchItem | null>(null);
const batchCancellationCheck = ref<ProductionBatchCancellationCheck | null>(null);
const materials = useProductionMaterials();
const visibleMaterialDemands = computed(() => materials.demands.value);
const taskFormDialogRef = ref<{
  setForm: (row: ProductionBatchDetail) => void;
  resetForm: () => void;
}>();

/* ====== 任务 CRUD ====== */
const openCreate = (): void => {
  editRead.invalidate();
  editingTaskId.value = null;
  editingTaskVersion.value = null;
  taskFormDialogRef.value?.resetForm();
  createBatchIntent.reset();
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
  if (submitting.value) return;
  editRead.invalidate();
  const state = createBatchIntent.getStatus();
  if (state === 'idle') {
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
    const detail = await productionApi.getBatch(row.id, {
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
  submitting.value = true;
  try {
    const editId = editingTaskId.value;
    if (editId) {
      const version = editingTaskVersion.value;
      if (version === null) throw new Error('任务编辑依据缺失，请关闭后重新打开');
      await productionApi.updateBatch(editId, {
        ownerId: data.ownerId || null,
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
        ownerId: data.ownerId || null,
        planStartDate: data.planStartDate,
        planEndDate: data.planEndDate,
        remark: data.remark || null,
        stepOverrides: data.stepOverrides,
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
        (key) => productionApi.createOrderBatch(workOrderId, normalizedPayload, key),
      );
      EMessage.success('任务已新增');
    }
    taskDialogVisible.value = false;
    await loadTasks();
  } catch (error) {
    EMessage.error(error, '任务保存失败');
  } finally {
    submitting.value = false;
  }
};

/* ====== 只读详情与独立工序管理 ====== */
async function refreshTaskDetail(): Promise<void> {
  const id = detailBatchId.value;
  if (!id || !detailDialogVisible.value || !detailRead.isActive()) return;
  const request = detailRead.begin(() => detailDialogVisible.value && detailBatchId.value === id);
  detailLoading.value = true;
  detailError.value = '';
  try {
    const detail = await productionApi.getBatch(id, {
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
const openDetail = async (row: ProductionBatchItem): Promise<void> => {
  detailRead.invalidate();
  detailBatchId.value = row.id;
  activeBatch.value = null;
  detailError.value = '';
  detailDialogVisible.value = true;
  await refreshTaskDetail();
};
const openSteps = async (row: ProductionBatchItem): Promise<void> => {
  if (stepsVisible.value && stepsBatchId.value === row.id) return;
  if (stepsVisible.value && !(await stepsDialog.value?.close())) return;
  await nextTick();
  stepsBatchId.value = row.id;
  stepsBatchLabel.value = `${row.batchNo} · ${row.productName}`;
  stepsVisible.value = true;
};

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

/* ====== 取消生产任务 ====== */
const openBatchCancellation = async (row: ProductionBatchItem): Promise<void> => {
  if (!beginRow(row.id)) return;
  try {
    const check = await productionApi.getBatchCancellationCheck(row.id);
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
    await productionApi.cancelBatch(batch.id, { version: check.version, reason });
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

/* ====== 工具函数 ====== */
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
    const demands = await productionApi.listMaterialDemands(batchId, {
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
