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
        class="tasks-table"
        :row-class-name="batchRowClass"
      >
        <el-table-column
          label="批次号"
          min-width="170"
        >
          <template #default="{ row }"
            ><span class="batch-no">{{ row.batchNo }}</span></template
          >
        </el-table-column>
        <el-table-column
          label="工单号"
          min-width="150"
        >
          <template #default="{ row }">{{ row.workOrderNo || '-' }}</template>
        </el-table-column>
        <el-table-column
          label="产品"
          min-width="220"
        >
          <template #default="{ row }">
            <div class="product-name">{{ row.productName }}</div>
            <div class="sub-text">{{ row.productCode }}</div>
          </template>
        </el-table-column>
        <el-table-column
          label="完工进度"
          min-width="180"
        >
          <template #default="{ row }">
            <div class="quantity-progress-label">
              <strong>{{ formatQuantity(row.completedQuantity) }}</strong>
              <span>/ {{ formatQuantity(row.plannedQuantity) }}</span>
            </div>
            <el-progress
              :percentage="quantityProgressPercentage(row.completedQuantity, row.plannedQuantity)"
              :stroke-width="6"
              :show-text="false"
            />
          </template>
        </el-table-column>
        <el-table-column
          label="工艺路线"
          min-width="140"
        >
          <template #default="{ row }">{{ row.routeCode || '未选择' }}</template>
        </el-table-column>
        <el-table-column
          label="任务状态"
          width="130"
        >
          <template #default="{ row }">
            <el-tag
              :type="batchStatusMeta(row.status).type"
              effect="light"
            >
              {{ batchStatusMeta(row.status).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          label="物料阶段"
          width="120"
        >
          <template #default="{ row }">
            <el-tag
              :type="batchMaterialStage(row.status).type"
              effect="light"
            >
              {{ batchMaterialStage(row.status).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          label="负责人"
          width="120"
        >
          <template #default="{ row }">{{ row.ownerName || '-' }}</template>
        </el-table-column>
        <el-table-column
          label="计划完成"
          width="140"
        >
          <template #default="{ row }">
            <div>{{ formatDateForDisplay(row.planEndDate) }}</div>
            <div :class="['deadline-text', `deadline-${batchDeadline(row).tone}`]">
              {{ batchDeadline(row).label }}
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="280"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              @click="openDetail(row)"
              >查看</el-button
            >
            <el-button
              link
              type="primary"
              :disabled="!canEditBatch(row)"
              @click="openEdit(row)"
              >编辑</el-button
            >
            <el-button
              link
              type="primary"
              :disabled="
                (row.status !== 'material_pending' && row.status !== 'pending') ||
                isRowPending(row.id)
              "
              @click="generateMaterials(row)"
              >生成物料</el-button
            >
            <el-button
              v-if="row.status === 'material_pending' || row.status === 'material_assigned'"
              link
              type="primary"
              @click="openMaterialAllocation(row)"
              >分配物料</el-button
            >
            <el-button
              v-if="row.status === 'material_assigned' || row.status === 'material_outbound'"
              link
              type="primary"
              @click="openMaterialOutbound(row)"
              >领料出库</el-button
            >
          </template>
        </el-table-column>
      </el-table>

      <div class="table-footer">
        <span class="total-text">共 {{ total }} 条</span>
        <el-select
          v-model="pageSize"
          class="page-size-select"
          @change="handlePageSizeChange"
        >
          <el-option
            label="10条/页"
            :value="10"
          />
          <el-option
            label="20条/页"
            :value="20"
          />
          <el-option
            label="50条/页"
            :value="50"
          />
        </el-select>
        <el-pagination
          :current-page="currentPage"
          :page-size="pageSize"
          :total="total"
          layout="prev, pager, next, jumper"
          @current-change="handlePageChange"
        />
      </div>
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

    <!-- 任务详情弹窗 -->
    <TaskDetailDialog
      :visible="detailDialogVisible"
      :batch="activeBatch"
      :assignment-pending-ids="assignmentPendingIds"
      @update:visible="detailDialogVisible = $event"
      @edit-step-execution="openStepExecutionOverride"
      @assign-step="openStepAssignment($event, 'assign')"
      @reassign-step="openStepAssignment($event, 'reassign')"
      @unassign-step="handleStepUnassign"
    />

    <!-- 调整工序执行参数弹窗 -->
    <StepExecutionDialog
      :visible="stepExecutionDialogVisible"
      :step-record="editingStepRecord"
      :sop-file-options="sopFileOptions"
      :submitting="submitting"
      @update:visible="stepExecutionDialogVisible = $event"
      @refresh-sop-files="refreshSopFiles"
      @save="submitStepExecutionOverride"
    />

    <StepAssignmentDialog
      :visible="stepAssignmentDialogVisible"
      :mode="stepAssignmentMode"
      :step-record="assignmentStepRecord"
      :user-options="userSource.options.value"
      :submitting="
        assignmentStepRecord ? stepAssignments.isPending(assignmentStepRecord.id) : false
      "
      @update:visible="stepAssignmentDialogVisible = $event"
      @refresh-users="userSource.refresh"
      @submit="submitStepAssignment"
    />

    <MaterialDemandAllocationDialog
      :visible="materialAllocationVisible"
      :demands="materials.demands.value"
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
      :demands="materials.demands.value"
      :outbounds="materials.outbounds.value"
      :loading-outbounds="materials.loadingOutbounds.value"
      :submitting="materials.submitting.value"
      @update:visible="handleMaterialOutboundClose"
      @submit="handleMaterialOutbound"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, ref } from 'vue';
import { Plus, Refresh } from '@element-plus/icons-vue';
import TableToolbar from '../../components/TableToolbar.vue';
import type {
  BatchStepRecordItem,
  CreateProductionBatchPayload,
  ProductionBatchDetail,
  ProductionBatchItem,
  CreateMaterialAllocationsPayload,
  CreateMaterialOutboundPayload,
  ProductionMaterialAllocationItem,
} from '@company/contracts';
import { normalizeCreateBatchPayload } from '@company/utils';
import { productionApi } from '../../api/production';
import { EMessage } from '../../utils/message';
import { RouteMessageBox as ElMessageBox } from '../../utils/route-message-box';
import { useRowPending } from '../../utils/useRowPending';
import { formatDateForDisplay } from '../../utils/date';
import { BATCH_STATUS_META, batchStatusMeta, formatQuantity } from './production-status';
import {
  batchIsTerminal,
  batchMaterialStage,
  deadlinePresentation,
  quantityProgressPercentage,
} from './production-list-presentation';
import { useProductionBatchesList } from './composables/useProductionBatchesList';
import { useIdempotentIntent } from '../../composables/idempotency/useIdempotentIntent';
import { useUserOptions } from '../../composables/options/useUserOptions';
import { buildLiveOptions } from '../../utils/live-options';
import TaskFormDialog from './components/TaskFormDialog.vue';
import type { TaskFormValue } from './components/TaskFormDialog.vue';
import TaskDetailDialog from './components/TaskDetailDialog.vue';
import StepExecutionDialog from './components/StepExecutionDialog.vue';
import type { StepExecutionValue } from './components/StepExecutionDialog.vue';
import MaterialDemandAllocationDialog from './components/MaterialDemandAllocationDialog.vue';
import MaterialOutboundDialog from './components/MaterialOutboundDialog.vue';
import { useProductionMaterials } from './composables/useProductionMaterials';
import StepAssignmentDialog from './components/StepAssignmentDialog.vue';
import { useStepAssignments } from './composables/useStepAssignments';

defineOptions({ name: 'ProductionTasksPage' });

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

/** 页面级负责人候选（查询筛选 + 任务弹窗 + 工序执行弹窗）：页面持有并负责激活刷新 */
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
  deadlinePresentation(row.planEndDate, batchIsTerminal(row.status));
const batchRowClass = ({ row }: { row: ProductionBatchItem }): string =>
  batchDeadline(row).tone === 'warning' ? 'risk-warning-row' : '';

/** 行内写操作守卫（生成物料），同一行只允许一个在途（todo 3.5） */
const { isRowPending, beginRow, endRow } = useRowPending();

/** 创建生产批次任务的幂等意图（试点端点）：页面局部持有，弹窗打开/关闭时清除旧意图 */
const createBatchIntent = useIdempotentIntent();

/* ====== 弹窗状态 ====== */
const taskDialogVisible = ref(false);
const detailDialogVisible = ref(false);
const stepExecutionDialogVisible = ref(false);
const editingTaskId = ref<string | null>(null);
const submitting = ref(false);
const activeBatch = ref<ProductionBatchDetail | null>(null);
const editingStepRecord = ref<BatchStepRecordItem | null>(null);
const stepAssignmentDialogVisible = ref(false);
const stepAssignmentMode = ref<'assign' | 'reassign'>('assign');
const assignmentStepRecord = ref<BatchStepRecordItem | null>(null);
const stepAssignments = useStepAssignments();
const assignmentPendingIds = computed(
  () =>
    new Set(
      (activeBatch.value?.stepRecords ?? [])
        .filter((step) => stepAssignments.isPending(step.id))
        .map((step) => step.id),
    ),
);
const materialAllocationVisible = ref(false);
const materialOutboundVisible = ref(false);
const materials = useProductionMaterials();
const taskFormDialogRef = ref<{
  setForm: (row: ProductionBatchItem) => void;
  resetForm: () => void;
}>();

/* ====== 任务 CRUD ====== */
const openCreate = (): void => {
  editingTaskId.value = null;
  taskFormDialogRef.value?.resetForm();
  createBatchIntent.reset();
  taskDialogVisible.value = true;
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
  const state = createBatchIntent.getStatus();
  if (state === 'idle') {
    taskDialogVisible.value = false;
    createBatchIntent.reset();
    return;
  }
  const message =
    state === 'blocked'
      ? '该提交的幂等结果已损坏，无法确认本次是否已创建批次。关闭后重新发起可能生成重复批次，建议先在批次列表中核对是否已生成。是否仍要关闭？'
      : state === 'expired'
        ? '该提交已超出幂等重试窗口（12 小时），旧键已无法安全重试。关闭后重新发起可能生成重复批次，建议先在批次列表中核对是否已生成。是否仍要关闭？'
        : '上次提交结果未知（网络异常或服务端未确认）。关闭后将无法安全重试；若本次实际已成功，重新提交可能生成重复批次。是否仍要关闭？';
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

const openEdit = (row: ProductionBatchItem): void => {
  editingTaskId.value = row.id;
  taskFormDialogRef.value?.setForm(row);
  taskDialogVisible.value = true;
};

const submitTask = async (data: TaskFormValue): Promise<void> => {
  submitting.value = true;
  try {
    const editId = editingTaskId.value;
    if (editId) {
      const batch = batches.value.find((item) => item.id === editId);
      await productionApi.updateBatch(editId, {
        ownerId: data.ownerId || null,
        remark: data.remark || null,
        version: batch?.version ?? 0,
      });
      EMessage.success('任务已更新');
    } else {
      const payload: CreateProductionBatchPayload = {
        batchNo: data.batchNo || '',
        routeId: data.routeId || null,
        plannedQuantity: data.plannedQuantity,
        ownerId: data.ownerId || null,
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

/* ====== 查看详情 ====== */
const openDetail = async (row: ProductionBatchItem): Promise<void> => {
  try {
    activeBatch.value = await productionApi.getBatch(row.id);
    detailDialogVisible.value = true;
  } catch (error) {
    EMessage.error(error, '任务详情查询失败');
  }
};

const openStepExecutionOverride = (row: BatchStepRecordItem): void => {
  editingStepRecord.value = row;
  stepExecutionDialogVisible.value = true;
};

const submitStepExecutionOverride = async (data: StepExecutionValue): Promise<void> => {
  if (!activeBatch.value || !editingStepRecord.value) return;
  submitting.value = true;
  try {
    activeBatch.value = await productionApi.updateBatchStepExecution(
      activeBatch.value.id,
      editingStepRecord.value.id,
      {
        version: editingStepRecord.value.version,
        actualSopFileId: data.actualSopFileId,
      },
    );
    stepExecutionDialogVisible.value = false;
    EMessage.success('工序执行参数已更新');
  } catch (error) {
    EMessage.error(error, '工序执行参数保存失败');
  } finally {
    submitting.value = false;
  }
};

const openStepAssignment = (row: BatchStepRecordItem, mode: 'assign' | 'reassign'): void => {
  assignmentStepRecord.value = row;
  stepAssignmentMode.value = mode;
  stepAssignmentDialogVisible.value = true;
};

const refreshActiveBatch = async (): Promise<void> => {
  if (!activeBatch.value) return;
  activeBatch.value = await productionApi.getBatch(activeBatch.value.id);
  await loadTasks();
};

const submitStepAssignment = async (responsibleUserId: string): Promise<void> => {
  if (!activeBatch.value || !assignmentStepRecord.value) return;
  const row = assignmentStepRecord.value;
  try {
    if (stepAssignmentMode.value === 'assign')
      await stepAssignments.assign(activeBatch.value.id, row.id, responsibleUserId, row.version);
    else
      await stepAssignments.reassign(activeBatch.value.id, row.id, responsibleUserId, row.version);
    stepAssignmentDialogVisible.value = false;
    EMessage.success(stepAssignmentMode.value === 'assign' ? '工序派工成功' : '工序改派成功');
    await refreshActiveBatch();
  } catch (error) {
    EMessage.error(error, stepExecutionErrorFallback(error, '工序派工失败'));
  }
};

const handleStepUnassign = async (row: BatchStepRecordItem): Promise<void> => {
  if (!activeBatch.value) return;
  try {
    await ElMessageBox.confirm(`确认撤回工序「${row.stepName}」的当前派工？`, '撤回派工', {
      confirmButtonText: '确认撤回',
      cancelButtonText: '取消',
      type: 'warning',
    });
    await stepAssignments.unassign(activeBatch.value.id, row.id, row.version);
    EMessage.success('工序派工已撤回');
    await refreshActiveBatch();
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    EMessage.error(error, stepExecutionErrorFallback(error, '撤回派工失败'));
  }
};

const stepExecutionErrorFallback = (error: unknown, fallback: string): string => {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  const messages: Record<string, string> = {
    STEP_ASSIGNMENT_CONFLICT: '工序派工状态已变化，请刷新任务详情后重试',
    CONCURRENT_MODIFICATION: '工序已被其他操作修改，请刷新后重试',
  };
  return messages[code] ?? fallback;
};

/* ====== 生成物料需求 ====== */
const generateMaterials = async (row: ProductionBatchItem): Promise<void> => {
  if (!beginRow(row.id)) return;
  try {
    await productionApi.generateMaterialDemands(row.id, row.version);
    EMessage.success('物料需求已生成');
    await loadTasks();
  } catch (error) {
    EMessage.error(error, '物料需求生成失败');
  } finally {
    endRow(row.id);
  }
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
const materialIntentMessage = (operation: string, state: string): string =>
  state === 'blocked'
    ? `${operation}的幂等结果已损坏，无法确认业务结果。请先刷新需求、出库记录和库存后核对；仍要放弃本次安全重试吗？`
    : state === 'expired'
      ? `${operation}已超出 12 小时安全重试窗口。请先核对需求、出库记录和库存；仍要放弃本次意图吗？`
      : `${operation}的服务端结果尚未确认。放弃后重新提交可能重复形成业务事实，请先核对需求、出库记录和库存；仍要放弃吗？`;
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
    await ElMessageBox.confirm(materialIntentMessage(operation, status), '放弃幂等意图确认', {
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

/* ====== 工具函数 ====== */
const canEditBatch = (row: ProductionBatchItem): boolean => row.status === 'pending';

onMounted(loadPageData);
/** 页面重新激活：定向刷新页面持有的候选（负责人 + SOP 文件）；弹窗自持候选由弹窗自身刷新 */
onActivated(() => {
  void userSource.refresh();
  void refreshSopFiles();
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
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
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
  color: #1f2937;
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
  box-shadow: 0 0 0 1px #e5e7eb inset;
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
  border-bottom: 1px solid #e5e7eb;
}
.table-toolbar :deep(.el-button) {
  height: 34px;
  border-radius: 6px;
}
.tasks-table {
  width: 100%;
  color: #1f2937;
  font-size: 14px;
}
.tasks-table :deep(.el-table__header th) {
  height: 48px;
  background: #f9fafb;
  color: #1f2937;
  font-weight: 600;
}
.tasks-table :deep(.el-table__row) {
  height: 48px;
}
.tasks-table :deep(.el-table__row:hover) {
  background: #f3f4f6;
}
.tasks-table :deep(.el-table__cell) {
  border-bottom-color: #e5e7eb;
}
.tasks-table :deep(.risk-warning-row > td:first-child) {
  box-shadow: inset 3px 0 0 #f59e0b;
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
.tasks-table :deep(.el-tag--success) {
  background: #dcfce7;
  color: #22c55e;
}
.tasks-table :deep(.el-tag--info) {
  background: #f3f4f6;
  color: #6b7280;
}
.tasks-table :deep(.el-tag--danger) {
  background: #fce8e8;
  color: #ef4444;
}
.tasks-table :deep(.el-tag--primary) {
  background: #e8f0fe;
  color: #306188;
}
.tasks-table :deep(.el-button.is-link) {
  padding: 0;
  font-weight: 500;
}
.batch-no,
.product-name {
  color: #1f2937;
  font-weight: 600;
}
.sub-text {
  margin-top: 2px;
  color: #6b7280;
  font-size: 12px;
}
.quantity-progress-label {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 6px;
  white-space: nowrap;
}
.quantity-progress-label strong {
  color: #1f2937;
  font-weight: 600;
}
.quantity-progress-label span {
  color: #6b7280;
  font-size: 12px;
}
.tasks-table :deep(.el-progress-bar__outer) {
  background: #e5e7eb;
}
.tasks-table :deep(.el-progress-bar__inner) {
  background: #306188;
}
.deadline-text {
  margin-top: 2px;
  font-size: 12px;
  font-weight: 500;
}
.deadline-muted {
  color: #9ca3af;
}
.deadline-normal {
  color: #6b7280;
}
.deadline-warning {
  color: #f59e0b;
}
.table-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  height: 56px;
  padding: 0 16px;
}
.total-text {
  color: #6b7280;
  font-size: 14px;
}
.page-size-select {
  width: 78px;
}
.page-size-select :deep(.el-select__wrapper) {
  min-height: 30px;
  padding: 0 7px;
  border-radius: 6px;
}
.table-footer :deep(.el-pagination) {
  gap: 4px;
}
.table-footer :deep(.el-pager li),
.table-footer :deep(.btn-prev),
.table-footer :deep(.btn-next) {
  min-width: 32px;
  height: 32px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}
.table-footer :deep(.el-pager li.is-active) {
  border-color: #306188;
  background: #306188;
  color: #ffffff;
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
