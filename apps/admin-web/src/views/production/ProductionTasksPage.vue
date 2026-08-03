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
          >
            <el-option
              v-for="user in userOptions"
              :key="user.id"
              :label="user.displayName"
              :value="user.id"
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
          label="计划数量"
          width="120"
          align="right"
        >
          <template #default="{ row }">{{ formatQuantity(row.plannedQuantity) }}</template>
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
          label="负责人"
          width="120"
        >
          <template #default="{ row }">{{ row.ownerName || '-' }}</template>
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
              v-if="row.status === 'material_pending'"
              link
              type="primary"
              >分配物料</el-button
            >
            <el-button
              v-if="row.status === 'material_assigned'"
              link
              type="primary"
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
          @current-change="loadTasks"
        />
      </div>
    </section>

    <!-- 新增/编辑任务弹窗 -->
    <TaskFormDialog
      ref="taskFormDialogRef"
      :visible="taskDialogVisible"
      :editing-task-id="editingTaskId"
      :work-order-options="workOrderOptions"
      :work-order-loading="workOrderLoading"
      :product-options="productOptions"
      :route-options="routeOptions"
      :user-options="userOptions"
      :sop-file-options="sopFileOptions"
      :submitting="submitting"
      @update:visible="taskDialogVisible = $event"
      @refresh-work-orders="refreshWorkOrders"
      @refresh-routes="refreshRoutes"
      @refresh-users="refreshUsers"
      @refresh-sop-files="refreshSopFiles"
      @save="submitTask"
    />

    <!-- 任务详情弹窗 -->
    <TaskDetailDialog
      :visible="detailDialogVisible"
      :batch="activeBatch"
      @update:visible="detailDialogVisible = $event"
      @edit-step-execution="openStepExecutionOverride"
    />

    <!-- 调整工序执行参数弹窗 -->
    <StepExecutionDialog
      :visible="stepExecutionDialogVisible"
      :step-record="editingStepRecord"
      :sop-file-options="sopFileOptions"
      :user-options="userOptions"
      :submitting="submitting"
      @update:visible="stepExecutionDialogVisible = $event"
      @refresh-sop-files="refreshSopFiles"
      @refresh-users="refreshUsers"
      @save="submitStepExecutionOverride"
    />
  </div>
</template>

<script setup lang="ts">
import { onActivated, onMounted, ref } from 'vue';
import { Plus, Refresh } from '@element-plus/icons-vue';
import TableToolbar from '../../components/TableToolbar.vue';
import type {
  BatchStepRecordItem,
  ProductionBatchDetail,
  ProductionBatchItem,
} from '@company/contracts';
import { productionApi } from '../../api/production';
import { EMessage } from '../../utils/message';
import { useRowPending } from '../../utils/useRowPending';
import { BATCH_STATUS_META, batchStatusMeta, formatQuantity } from './production-status';
import { useProductionBatches } from './composables/useProductionBatches';
import TaskFormDialog from './components/TaskFormDialog.vue';
import type { TaskFormValue } from './components/TaskFormDialog.vue';
import TaskDetailDialog from './components/TaskDetailDialog.vue';
import StepExecutionDialog from './components/StepExecutionDialog.vue';
import type { StepExecutionValue } from './components/StepExecutionDialog.vue';

defineOptions({ name: 'ProductionTasksPage' });

const {
  batches,
  productOptions,
  routeOptions,
  userOptions,
  workOrderOptions,
  sopFileOptions,
  loading,
  workOrderLoading,
  total,
  currentPage,
  pageSize,
  query,
  refreshProducts,
  refreshRoutes,
  refreshUsers,
  refreshSopFiles,
  loadTasks,
  loadPageData,
  searchTasks,
  resetQuery,
  handlePageSizeChange,
  refreshWorkOrders,
} = useProductionBatches();

/** 行内写操作守卫（生成物料），同一行只允许一个在途（todo 3.5） */
const { isRowPending, beginRow, endRow } = useRowPending();

/* ====== 弹窗状态 ====== */
const taskDialogVisible = ref(false);
const detailDialogVisible = ref(false);
const stepExecutionDialogVisible = ref(false);
const editingTaskId = ref<string | null>(null);
const submitting = ref(false);
const activeBatch = ref<ProductionBatchDetail | null>(null);
const editingStepRecord = ref<BatchStepRecordItem | null>(null);
const taskFormDialogRef = ref<{
  setForm: (row: ProductionBatchItem) => void;
  resetForm: () => void;
}>();

/* ====== 任务 CRUD ====== */
const openCreate = (): void => {
  editingTaskId.value = null;
  taskFormDialogRef.value?.resetForm();
  taskDialogVisible.value = true;
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
      await productionApi.createOrderBatch(data.workOrderId, {
        batchNo: data.batchNo || '',
        routeId: data.routeId || null,
        plannedQuantity: data.plannedQuantity,
        ownerId: data.ownerId || null,
        remark: data.remark || null,
        stepOverrides: data.stepOverrides,
      });
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
        responsibleUserId: data.responsibleUserId,
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

/* ====== 工具函数 ====== */
const canEditBatch = (row: ProductionBatchItem): boolean => row.status === 'pending';

onMounted(loadPageData);
/** 页面重新激活：定向刷新页面可见筛选与仍打开弹窗的候选（各资源独立 loader 组合） */
onActivated(() => {
  refreshProducts();
  refreshRoutes();
  refreshUsers();
  refreshSopFiles();
  refreshWorkOrders();
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
