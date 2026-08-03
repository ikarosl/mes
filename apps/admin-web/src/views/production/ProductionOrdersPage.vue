<template>
  <div class="orders-page">
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
            placeholder="工单号/产品编码/名称"
          />
        </el-form-item>
        <el-form-item label="产品">
          <el-select
            v-model="query.productId"
            clearable
            filterable
            placeholder="全部"
          >
            <el-option
              v-for="product in productOptions"
              :key="product.id"
              :label="formatProduct(product)"
              :value="product.id"
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
              v-for="item in ORDER_STATUS_META"
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
            @click="searchOrders"
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
            >新增工单</el-button
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
              @click="loadOrders"
            />
          </el-tooltip>
        </template>
      </TableToolbar>

      <el-table
        v-loading="loading"
        :data="orders"
        class="orders-table"
      >
        <el-table-column
          label="工单号"
          min-width="160"
        >
          <template #default="{ row }"
            ><span class="order-no">{{ row.workOrderNo }}</span></template
          >
        </el-table-column>
        <el-table-column
          label="产品"
          min-width="200"
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
          label="已分配"
          width="110"
          align="right"
        >
          <template #default="{ row }">{{ formatQuantity(row.assignedQuantity) }}</template>
        </el-table-column>
        <el-table-column
          label="负责人"
          width="110"
        >
          <template #default="{ row }">{{ getOwnerName(row.workOrderOwnerId) }}</template>
        </el-table-column>
        <el-table-column
          label="客户名称"
          width="140"
        >
          <template #default="{ row }">{{ row.customerName || '-' }}</template>
        </el-table-column>
        <el-table-column
          label="计划开始"
          width="110"
        >
          <template #default="{ row }">{{ formatDateForDisplay(row.planStartDate) }}</template>
        </el-table-column>
        <el-table-column
          label="计划完成"
          width="110"
        >
          <template #default="{ row }">{{ formatDateForDisplay(row.planEndDate) }}</template>
        </el-table-column>
        <el-table-column
          label="状态"
          width="110"
        >
          <template #default="{ row }">
            <el-tag
              :type="orderStatusMeta(row.status).type"
              effect="light"
            >
              {{ orderStatusMeta(row.status).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="300"
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
              :disabled="!canEditOrder(row)"
              @click="openEdit(row)"
              >编辑</el-button
            >
            <el-button
              link
              type="primary"
              :disabled="row.status === 'draft'"
              @click="openTasks(row)"
              >生产批次</el-button
            >
            <el-button
              link
              type="primary"
              :disabled="row.status !== 'draft' || isRowPending(row.id)"
              @click="releaseOrder(row)"
              >下达</el-button
            >
            <el-dropdown trigger="click">
              <el-button
                link
                type="primary"
                >更多</el-button
              >
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    :disabled="!canCloseOrder(row) || isRowPending(row.id)"
                    @click="closeOrder(row)"
                    >关闭工单</el-dropdown-item
                  >
                  <el-dropdown-item
                    :disabled="!canCancelOrder(row) || isRowPending(row.id)"
                    @click="cancelOrder(row)"
                    >取消工单</el-dropdown-item
                  >
                </el-dropdown-menu>
              </template>
            </el-dropdown>
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
          @current-change="loadOrders"
        />
      </div>
    </section>

    <!-- 新增/编辑工单弹窗 -->
    <WorkOrderFormDialog
      ref="workOrderFormDialogRef"
      :visible="orderDialogVisible"
      :editing-order-id="editingOrderId"
      :product-options="productOptions"
      :user-options="userOptions"
      :submitting="submitting"
      @update:visible="orderDialogVisible = $event"
      @refresh-products="refreshProducts"
      @refresh-users="refreshUsers"
      @save="submitOrder"
    />

    <!-- 工单详情弹窗 -->
    <WorkOrderDetailDialog
      :visible="detailDialogVisible"
      :order="activeOrder"
      :user-options="userOptions"
      @update:visible="detailDialogVisible = $event"
    />

    <!-- 生产批次列表弹窗 -->
    <BatchListDialog
      :visible="taskDialogVisible"
      :order="taskOrder"
      :batches="taskBatches"
      :can-create-batch="canCreateBatch"
      @update:visible="taskDialogVisible = $event"
      @create-batch="openCreateBatch"
      @edit-batch="openEditBatch"
    />

    <!-- 新增/编辑生产批次弹窗 -->
    <BatchFormDialog
      ref="batchFormDialogRef"
      :visible="batchFormDialogVisible"
      :editing-batch-id="editingBatchId"
      :available-route-options="availableRouteOptions"
      :user-options="userOptions"
      :max-quantity="batchQuantityMax"
      :default-start-date="toDateInputValue(taskOrder?.planStartDate)"
      :default-end-date="toDateInputValue(taskOrder?.planEndDate)"
      :submitting="submitting"
      @update:visible="batchFormDialogVisible = $event"
      @refresh-routes="refreshRoutes"
      @refresh-users="refreshUsers"
      @save="submitBatch"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, ref, watch } from 'vue';
import { Plus, Refresh } from '@element-plus/icons-vue';
import TableToolbar from '../../components/TableToolbar.vue';
import type { ProductionBatchItem, WorkOrderDetail, WorkOrderItem } from '@company/contracts';
import { productionApi } from '../../api/production';
import { EMessage } from '../../utils/message';
import { RouteMessageBox as ElMessageBox } from '../../utils/route-message-box';
import { useRowPending } from '../../utils/useRowPending';
import { formatDateForDisplay, toDateInputValue } from '../../utils/date';
import { ORDER_STATUS_META, formatQuantity, orderStatusMeta } from './production-status';
import { useWorkOrders } from './composables/useWorkOrders';
import WorkOrderFormDialog from './components/WorkOrderFormDialog.vue';
import type { WorkOrderFormValue } from './components/WorkOrderFormDialog.vue';
import WorkOrderDetailDialog from './components/WorkOrderDetailDialog.vue';
import BatchListDialog from './components/BatchListDialog.vue';
import BatchFormDialog from './components/BatchFormDialog.vue';
import type { BatchFormValue } from './components/BatchFormDialog.vue';

defineOptions({ name: 'ProductionOrdersPage' });

const {
  orders,
  productOptions,
  routeOptions,
  userOptions,
  loading,
  total,
  currentPage,
  pageSize,
  query,
  refreshProducts,
  refreshRoutes,
  refreshUsers,
  loadOrders,
  loadPageData,
  searchOrders,
  resetQuery,
  handlePageSizeChange,
  getOwnerName,
  formatProduct,
} = useWorkOrders();

/** 行内工单状态写操作守卫（下达/关闭/取消），同一行只允许一个在途（todo 3.5） */
const { isRowPending, beginRow, endRow } = useRowPending();

/* ====== 弹窗状态 ====== */
const orderDialogVisible = ref(false);
const detailDialogVisible = ref(false);
const taskDialogVisible = ref(false);
const batchFormDialogVisible = ref(false);
const editingOrderId = ref<string | null>(null);
const editingBatchId = ref<string | null>(null);
const submitting = ref(false);
const activeOrder = ref<WorkOrderDetail | null>(null);
const taskOrder = ref<WorkOrderItem | null>(null);
const taskBatches = ref<ProductionBatchItem[]>([]);
const workOrderFormDialogRef = ref<{
  setForm: (row: WorkOrderItem) => void;
  resetForm: () => void;
}>();
const batchFormDialogRef = ref<{
  setForm: (row: ProductionBatchItem) => void;
  resetForm: () => void;
}>();

const editingBatch = computed(
  () => taskBatches.value.find((item) => item.id === editingBatchId.value) ?? null,
);
const availableRouteOptions = computed(() => {
  if (!taskOrder.value) return [];
  return routeOptions.value.filter((route) => route.productId === taskOrder.value?.productId);
});
/** 本批次计划数量上限：工单计划 - 已分配 + 当前编辑批次数量 */
const batchQuantityMax = computed(() => {
  if (!taskOrder.value) return null;
  const planned = Number(taskOrder.value.plannedQuantity);
  const assigned = Number(taskOrder.value.assignedQuantity);
  const currentBatch = editingBatch.value ? Number(editingBatch.value.plannedQuantity) : 0;
  const maxQty = planned - assigned + currentBatch;
  return Number.isFinite(maxQty) ? Math.max(maxQty, 0) : null;
});
const canCreateBatch = computed(
  () =>
    taskOrder.value?.status === 'released' &&
    Number(taskOrder.value.plannedQuantity) > Number(taskOrder.value.assignedQuantity),
);

/* ====== 工单 CRUD ====== */
const openCreate = (): void => {
  editingOrderId.value = null;
  workOrderFormDialogRef.value?.resetForm();
  orderDialogVisible.value = true;
};

const openEdit = (row: WorkOrderItem): void => {
  editingOrderId.value = row.id;
  workOrderFormDialogRef.value?.setForm(row);
  orderDialogVisible.value = true;
};

const submitOrder = async (data: WorkOrderFormValue): Promise<void> => {
  submitting.value = true;
  try {
    const editId = editingOrderId.value;
    if (editId) {
      const order = orders.value.find((item) => item.id === editId);
      await productionApi.updateOrder(editId, {
        productId: data.productId,
        plannedQuantity: data.plannedQuantity,
        workOrderOwnerId: data.workOrderOwnerId || null,
        customerName: data.customerName || null,
        qualityLevel: data.qualityLevel || null,
        planStartDate: toDateInputValue(data.planStartDate) || null,
        planEndDate: toDateInputValue(data.planEndDate) || null,
        externalOrderNo: data.externalOrderNo || null,
        remark: data.remark || null,
        version: order?.version ?? 0,
      });
      EMessage.success('工单已更新');
    } else {
      await productionApi.createOrder({
        workOrderNo: data.workOrderNo.trim(),
        productId: data.productId,
        plannedQuantity: data.plannedQuantity,
        workOrderOwnerId: data.workOrderOwnerId || null,
        customerName: data.customerName || null,
        qualityLevel: data.qualityLevel || null,
        planStartDate: toDateInputValue(data.planStartDate) || null,
        planEndDate: toDateInputValue(data.planEndDate) || null,
        externalOrderNo: data.externalOrderNo || null,
        remark: data.remark || null,
      });
      EMessage.success('工单已新增');
    }
    orderDialogVisible.value = false;
    await loadOrders();
  } catch (error) {
    EMessage.error(error, '工单保存失败');
  } finally {
    submitting.value = false;
  }
};

const openDetail = async (row: WorkOrderItem): Promise<void> => {
  try {
    activeOrder.value = await productionApi.getOrder(row.id);
    detailDialogVisible.value = true;
  } catch (error) {
    EMessage.error(error, '工单详情查询失败');
  }
};

/* ====== 工单状态变更 ====== */
const releaseOrder = (row: WorkOrderItem) => changeOrderStatus(row, 'release', '下达');
const closeOrder = (row: WorkOrderItem) => changeOrderStatus(row, 'close', '关闭');
const cancelOrder = (row: WorkOrderItem) => changeOrderStatus(row, 'cancel', '取消');

const changeOrderStatus = async (
  row: WorkOrderItem,
  action: 'release' | 'close' | 'cancel',
  label: string,
): Promise<void> => {
  if (!beginRow(row.id)) return;
  try {
    await ElMessageBox.confirm(`确认${label}该工单？`, `${label}工单`, {
      confirmButtonText: `确认${label}`,
      cancelButtonText: '取消',
      type: action === 'cancel' ? 'warning' : 'info',
    });
    await productionApi.changeOrderStatus(row.id, action, row.version);
    EMessage.success(`工单已${label}`);
    await loadOrders();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') EMessage.error(error, `工单${label}失败`);
  } finally {
    endRow(row.id);
  }
};

const canEditOrder = (row: WorkOrderItem): boolean => row.status === 'draft';
const canCloseOrder = (row: WorkOrderItem): boolean => row.status === 'completed';
const canCancelOrder = (row: WorkOrderItem): boolean =>
  ['draft', 'released', 'doing'].includes(row.status);

/* ====== 批次管理 ====== */
const openTasks = async (row: WorkOrderItem): Promise<void> => {
  taskOrder.value = row;
  try {
    taskBatches.value = await productionApi.listOrderBatches(row.id);
    taskDialogVisible.value = true;
  } catch (error) {
    EMessage.error(error, '生产批次查询失败');
  }
};

/** 列表刷新后同步批次弹窗中的工单数据 */
watch(orders, (items) => {
  if (!taskOrder.value) return;
  const latest = items.find((item) => item.id === taskOrder.value?.id);
  if (latest) taskOrder.value = latest;
});

const openCreateBatch = (): void => {
  editingBatchId.value = null;
  batchFormDialogRef.value?.resetForm();
  batchFormDialogVisible.value = true;
};

const openEditBatch = (row: ProductionBatchItem): void => {
  editingBatchId.value = row.id;
  batchFormDialogRef.value?.setForm(row);
  batchFormDialogVisible.value = true;
};

const submitBatch = async (data: BatchFormValue): Promise<void> => {
  if (!taskOrder.value) return;
  submitting.value = true;
  try {
    if (editingBatchId.value) {
      const batch = taskBatches.value.find((item) => item.id === editingBatchId.value);
      await productionApi.updateBatch(editingBatchId.value, {
        ownerId: data.ownerId || null,
        planStartDate: toDateInputValue(data.planStartDate) || null,
        planEndDate: toDateInputValue(data.planEndDate) || null,
        remark: data.remark || null,
        version: batch?.version ?? 0,
      });
      EMessage.success('生产批次已更新');
    } else {
      await productionApi.createOrderBatch(taskOrder.value.id, {
        batchNo: data.batchNo || '',
        routeId: data.routeId || null,
        plannedQuantity: data.plannedQuantity,
        ownerId: data.ownerId || null,
        planStartDate: toDateInputValue(data.planStartDate) || null,
        planEndDate: toDateInputValue(data.planEndDate) || null,
        remark: data.remark || null,
      });
      EMessage.success('生产批次已新增');
    }
    batchFormDialogVisible.value = false;
    taskBatches.value = await productionApi.listOrderBatches(taskOrder.value.id);
    await loadOrders();
  } catch (error) {
    EMessage.error(error, '生产批次保存失败');
  } finally {
    submitting.value = false;
  }
};

onMounted(loadPageData);
/** 页面重新激活：定向刷新页面可见筛选与仍打开弹窗的候选（各资源独立 loader 组合） */
onActivated(() => {
  refreshProducts();
  refreshRoutes();
  refreshUsers();
});
</script>

<style scoped>
.orders-page {
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
.orders-table {
  width: 100%;
  color: #1f2937;
  font-size: 14px;
}
.orders-table :deep(.el-table__header th) {
  height: 48px;
  background: #f9fafb;
  color: #1f2937;
  font-weight: 600;
}
.orders-table :deep(.el-table__row) {
  height: 48px;
}
.orders-table :deep(.el-table__row:hover) {
  background: #f3f4f6;
}
.orders-table :deep(.el-table__cell) {
  border-bottom-color: #e5e7eb;
}
.orders-table :deep(.el-tag) {
  height: 22px;
  padding: 0 10px;
  border: 0;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  line-height: 22px;
}
.orders-table :deep(.el-tag--success) {
  background: #dcfce7;
  color: #22c55e;
}
.orders-table :deep(.el-tag--info) {
  background: #f3f4f6;
  color: #6b7280;
}
.orders-table :deep(.el-tag--danger) {
  background: #fce8e8;
  color: #ef4444;
}
.orders-table :deep(.el-tag--warning) {
  background: #fef3c7;
  color: #f59e0b;
}
.orders-table :deep(.el-tag--primary) {
  background: #e8f0fe;
  color: #306188;
}
.orders-table :deep(.el-button.is-link) {
  padding: 0;
  font-weight: 500;
}
.order-no,
.product-name {
  color: #1f2937;
  font-weight: 600;
}
.sub-text {
  margin-left: 8px;
  color: #6b7280;
  font-size: 12px;
}
.product-name + .sub-text {
  display: block;
  margin-left: 0;
  margin-top: 2px;
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
