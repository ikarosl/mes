<template>
  <section>
    <div class="query-panel">
      <el-form
        class="query-form"
        :inline="true"
        :model="query"
      >
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="路线编号或名称"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="query.status"
            placeholder="全部"
          >
            <el-option
              label="全部"
              value=""
            />
            <el-option
              label="草稿"
              value="draft"
            />
            <el-option
              label="启用"
              value="enabled"
            />
            <el-option
              label="停用"
              value="disabled"
            />
            <el-option
              label="已归档"
              value="archived"
            />
          </el-select>
        </el-form-item>
        <el-form-item class="query-actions">
          <el-button
            type="primary"
            @click="handleSearch"
            >查询</el-button
          >
          <el-button @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="table-panel">
      <TableToolbar>
        <template #actions>
          <el-button
            v-if="auth.can(PERMISSIONS.product.routes.create)"
            type="primary"
            :icon="Plus"
            @click="openCreate"
            >新增路线</el-button
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
              @click="loadRoutes"
            />
          </el-tooltip>
        </template>
      </TableToolbar>

      <el-table
        v-loading="loading"
        :data="routes"
        class="data-table"
      >
        <el-table-column
          label="路线名称"
          min-width="180"
        >
          <template #default="{ row }"
            ><span class="route-name">{{ row.routeName }}</span></template
          >
        </el-table-column>
        <el-table-column
          prop="routeCode"
          label="路线编号"
          min-width="150"
        />
        <el-table-column
          label="适用产品"
          min-width="160"
        >
          <template #default="{ row }">{{
            row.itemCode && row.productName ? `${row.itemCode} / ${row.productName}` : '-'
          }}</template>
        </el-table-column>
        <el-table-column
          label="工序顺序"
          min-width="260"
        >
          <template #default="{ row }">{{ row.processSummary || '未配置' }}</template>
        </el-table-column>
        <el-table-column
          label="版本"
          width="100"
        >
          <template #default="{ row }">{{ row.versionNo || '-' }}</template>
        </el-table-column>
        <el-table-column
          label="状态"
          width="100"
        >
          <template #default="{ row }">
            <el-tag
              :type="routeStatusType(row.status)"
              effect="light"
              >{{ routeStatusLabel(row.status) }}</el-tag
            >
          </template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="310"
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
              v-if="row.status === 'draft' && auth.can(PERMISSIONS.product.routes.update)"
              link
              type="primary"
              @click="openEdit(row)"
              >编辑</el-button
            >
            <el-button
              v-if="row.status === 'draft' && auth.can(PERMISSIONS.product.routes.manageSteps)"
              link
              type="primary"
              @click="openSteps(row)"
              >配置工序</el-button
            >
            <el-button
              v-if="row.status !== 'archived' && auth.can(PERMISSIONS.product.routes.changeStatus)"
              link
              :type="row.status === 'enabled' ? 'danger' : 'success'"
              :disabled="isRowPending(row.id)"
              @click="toggleStatus(row)"
            >
              {{ row.status === 'enabled' ? '停用' : '启用' }}
            </el-button>
            <el-button
              v-if="row.status === 'draft' && auth.can(PERMISSIONS.product.routes.delete)"
              link
              type="danger"
              :disabled="isRowPending(row.id)"
              @click="deleteRoute(row)"
              >删除</el-button
            >
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
    </div>

    <!-- 新增/编辑工艺路线弹窗（自持适用产品候选） -->
    <RouteFormDialog
      ref="routeFormDialogRef"
      :visible="routeDialogVisible"
      :editing-route-id="editingRouteId"
      :submitting="submittingRoute"
      @update:visible="routeDialogVisible = $event"
      @save="submitRoute"
    />

    <!-- 配置工序顺序弹窗（自持路线步骤明细与工序/用户/物料候选） -->
    <RouteStepDialog
      :visible="stepsDialogVisible"
      :route-id="editingRouteId"
      :product-id="editingRouteProductId"
      :submitting="submittingSteps"
      @update:visible="stepsDialogVisible = $event"
      @save="submitSteps"
    />

    <!-- 工艺路线详情弹窗 -->
    <RouteDetailDialog
      :visible="detailDialogVisible"
      :row="detailRow"
      :route-status-label="routeStatusLabel"
      @update:visible="detailDialogVisible = $event"
    />
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { PERMISSIONS } from '@company/constants';
import type { ProcessRouteListItem, ProcessRouteStatus } from '@company/contracts';
import { productApi } from '../../api/product';
import TableToolbar from '../../components/TableToolbar.vue';
import PaginationFooter from '../../components/PaginationFooter.vue';
import { EMessage } from '../../utils/message';
import { RouteMessageBox as ElMessageBox } from '../../utils/route-message-box';
import { useRowPending } from '../../utils/useRowPending';
import { useAuthStore } from '../../stores/auth';
import { useProcessRoutesList } from './composables/useProcessRoutesList';
import RouteFormDialog from './components/RouteFormDialog.vue';
import type { RouteFormValue } from './components/RouteFormDialog.vue';
import RouteStepDialog from './components/RouteStepDialog.vue';
import type { StepRow } from './components/RouteStepDialog.vue';
import RouteDetailDialog from './components/RouteDetailDialog.vue';

defineOptions({ name: 'ProcessRoutesPage' });

const auth = useAuthStore();
const {
  routes,
  loading,
  total,
  currentPage,
  pageSize,
  query,
  routeStatusLabel,
  routeStatusType,
  loadRoutes,
  handleSearch,
  resetQuery,
  handlePageSizeChange,
  handlePageChange,
} = useProcessRoutesList();

/** 行内写操作守卫（启停/删除路线），同一行只允许一个在途（todo 3.5） */
const { isRowPending, beginRow, endRow } = useRowPending();

/* ----- dialog state ----- */
const routeDialogVisible = ref(false);
const stepsDialogVisible = ref(false);
const detailDialogVisible = ref(false);
const editingRouteId = ref<string | null>(null);
const editingRouteProductId = ref<string | null>(null);
const detailRow = ref<ProcessRouteListItem | null>(null);
const submittingSteps = ref(false);
const routeFormDialogRef = ref();
const submittingRoute = ref(false);

/* ----- 工艺路线增删改查 ----- */
const openCreate = (): void => {
  editingRouteId.value = null;
  routeFormDialogRef.value?.resetForm();
  routeDialogVisible.value = true;
};

const openEdit = (row: ProcessRouteListItem): void => {
  editingRouteId.value = row.id;
  routeFormDialogRef.value?.setForm(row);
  routeDialogVisible.value = true;
};

const openDetail = (row: ProcessRouteListItem): void => {
  detailRow.value = row;
  detailDialogVisible.value = true;
};

const submitRoute = async (data: RouteFormValue): Promise<void> => {
  const payload = {
    routeCode: data.routeCode,
    routeName: data.routeName,
    productId: data.productId,
    versionNo: data.versionNo,
    remark: data.remark || null,
  };
  submittingRoute.value = true;
  try {
    if (editingRouteId.value) await productApi.updateRoute(editingRouteId.value, payload);
    else await productApi.createRoute(payload);
    EMessage.success(editingRouteId.value ? '工艺路线已更新' : '工艺路线已新增');
    routeDialogVisible.value = false;
    await loadRoutes();
  } catch (error) {
    EMessage.error(error, '工艺路线保存失败');
  } finally {
    submittingRoute.value = false;
  }
};

const toggleStatus = async (row: ProcessRouteListItem): Promise<void> => {
  if (!beginRow(row.id)) return;
  const next: ProcessRouteStatus = row.status === 'enabled' ? 'disabled' : 'enabled';
  const text = next === 'enabled' ? '启用' : '停用';
  try {
    await ElMessageBox.confirm(
      `确定${text}路线"${row.routeName}（${row.versionNo}）"吗？${next === 'enabled' ? '启用后该版本的步骤、SOP 和规则快照将不可修改。' : ''}`,
      `${text}工艺路线`,
      { type: 'warning' },
    );
    await productApi.setRouteStatus(row.id, next);
    EMessage.success(`工艺路线已${text}`);
    await loadRoutes();
  } catch (error: unknown) {
    if (error !== 'cancel' && error !== 'close') EMessage.error(error, `${text}路线失败`);
  } finally {
    endRow(row.id);
  }
};

const deleteRoute = async (row: ProcessRouteListItem): Promise<void> => {
  if (!beginRow(row.id)) return;
  try {
    await ElMessageBox.confirm(
      `确定删除草稿路线"${row.routeName}（${row.versionNo}）"吗？`,
      '删除工艺路线',
      { type: 'warning', confirmButtonText: '删除' },
    );
    await productApi.deleteRoute(row.id);
    EMessage.success('草稿路线已删除');
    await loadRoutes();
  } catch (error: unknown) {
    if (error !== 'cancel' && error !== 'close') EMessage.error(error, '删除路线失败');
  } finally {
    endRow(row.id);
  }
};

/* ----- steps（弹窗自持路线步骤明细与候选） ----- */
const openSteps = (row: ProcessRouteListItem): void => {
  editingRouteId.value = row.id;
  editingRouteProductId.value = row.productId;
  stepsDialogVisible.value = true;
};

const submitSteps = async (steps: StepRow[]): Promise<void> => {
  if (!editingRouteId.value) return;
  submittingSteps.value = true;
  try {
    await productApi.replaceRouteSteps(
      editingRouteId.value,
      steps.map((step) => ({
        processStepId: step.processStepId,
        stepOrder: step.stepOrder,
        defaultOwnerId: step.defaultOwnerId || null,
        sopFileId: step.sopFileId || null,
        needInspection: step.needInspection,
        needRecord: step.needRecord,
        status: step.status,
        remark: step.remark || null,
        productMaterialIds: step.productMaterialIds,
      })),
    );
    EMessage.success('工序顺序和规则快照已保存');
    stepsDialogVisible.value = false;
    await loadRoutes();
  } catch (error) {
    EMessage.error(error, '工序顺序保存失败');
  } finally {
    submittingSteps.value = false;
  }
};

onMounted(loadRoutes);
</script>

<style scoped>
.query-panel {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
  padding: 20px 20px 4px;
  margin-bottom: 16px;
}
.query-form {
  display: flex;
  align-items: flex-start;
  gap: 12px 24px;
}
.query-form :deep(.el-form-item) {
  margin-right: 0;
  margin-bottom: 16px;
}
.query-form :deep(.el-input) {
  width: 190px;
}
.query-form :deep(.el-select) {
  width: 140px;
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
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
  overflow: hidden;
}

.data-table {
  width: 100%;
  color: #1f2937;
  font-size: 14px;
}
.data-table :deep(.el-table__header th) {
  height: 48px;
  background: #f9fafb;
  color: #1f2937;
  font-weight: 600;
}
.data-table :deep(.el-table__row) {
  height: 48px;
}
.data-table :deep(.el-table__row:hover) {
  background: #f3f4f6;
}
.data-table :deep(.el-table__cell) {
  border-bottom-color: #e5e7eb;
}
.data-table :deep(.el-tag) {
  height: 22px;
  padding: 0 10px;
  border: 0;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  line-height: 22px;
}
.data-table :deep(.el-tag--success) {
  background: #dcfce7;
  color: #22c55e;
}
.data-table :deep(.el-tag--info) {
  background: #f3f4f6;
  color: #6b7280;
}
.data-table :deep(.el-button.is-link) {
  padding: 0;
  font-weight: 500;
}

.route-name {
  font-weight: 600;
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
