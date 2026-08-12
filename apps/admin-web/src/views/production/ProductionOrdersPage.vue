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
            @visible-change="(v: boolean) => v && productSource.refresh()"
          >
            <el-option
              v-for="choice in productChoices"
              :key="choice.value"
              :label="choice.option ? formatProduct(choice.option) : `${choice.value}（已失效）`"
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
        :row-class-name="workOrderRowClass"
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
          label="分配进度"
          min-width="180"
        >
          <template #default="{ row }">
            <div class="quantity-progress-label">
              <strong>{{ formatQuantity(row.assignedQuantity) }}</strong>
              <span>/ {{ formatQuantity(row.plannedQuantity) }} {{ row.unit }}</span>
            </div>
            <el-progress
              :percentage="quantityProgressPercentage(row.assignedQuantity, row.plannedQuantity)"
              :stroke-width="6"
              :show-text="false"
            />
          </template>
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
          width="140"
        >
          <template #default="{ row }">
            <div>{{ formatDateForDisplay(row.planEndDate) }}</div>
            <div :class="['deadline-text', `deadline-${orderDeadline(row).tone}`]">
              {{ orderDeadline(row).label }}
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="下一步"
          width="150"
        >
          <template #default="{ row }">
            <span class="next-action">{{ workOrderNextAction(row) }}</span>
          </template>
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
          @current-change="handlePageChange"
        />
      </div>
    </section>

    <!-- 新增/编辑工单弹窗 -->
    <WorkOrderFormDialog
      ref="workOrderFormDialogRef"
      :visible="orderDialogVisible"
      :editing-order-id="editingOrderId"
      :product-options="productSource.options.value"
      :product-options-status="productSource.status.value"
      :user-options="userSource.options.value"
      :user-options-status="userSource.status.value"
      :submitting="submitting"
      @update:visible="orderDialogVisible = $event"
      @refresh-products="productSource.refresh"
      @refresh-users="userSource.refresh"
      @save="submitOrder"
    />

    <!-- 工单详情弹窗 -->
    <WorkOrderDetailDialog
      :visible="detailDialogVisible"
      :order="activeOrder"
      :user-options="userSource.options.value"
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
      :product-id="taskOrder?.productId"
      :user-options="userSource.options.value"
      :max-quantity="batchQuantityMax"
      :default-start-date="toDateInputValue(taskOrder?.planStartDate)"
      :default-end-date="toDateInputValue(taskOrder?.planEndDate)"
      :submitting="submitting"
      @update:visible="handleBatchFormDialogClose"
      @refresh-users="userSource.refresh"
      @save="submitBatch"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, ref, watch } from 'vue';
import { Plus, Refresh } from '@element-plus/icons-vue';
import TableToolbar from '../../components/TableToolbar.vue';
import type {
  CreateProductionBatchPayload,
  ProductOption,
  ProductionBatchItem,
  WorkOrderDetail,
  WorkOrderItem,
} from '@company/contracts';
import { normalizeCreateBatchPayload } from '@company/utils';
import { productionApi } from '../../api/production';
import { EMessage } from '../../utils/message';
import { RouteMessageBox as ElMessageBox } from '../../utils/route-message-box';
import { useRowPending } from '../../utils/useRowPending';
import { buildLiveOptions } from '../../utils/live-options';
import { formatDateForDisplay, toDateInputValue } from '../../utils/date';
import { useIdempotentIntent } from '../../composables/idempotency/useIdempotentIntent';
import { useProductOptions } from '../../composables/options/useProductOptions';
import { useUserOptions } from '../../composables/options/useUserOptions';
import { ORDER_STATUS_META, formatQuantity, orderStatusMeta } from './production-status';
import {
  deadlinePresentation,
  quantityProgressPercentage,
  workOrderIsTerminal,
  workOrderNextAction,
} from './production-list-presentation';
import { useWorkOrdersList } from './composables/useWorkOrdersList';
import WorkOrderFormDialog from './components/WorkOrderFormDialog.vue';
import type { WorkOrderFormValue } from './components/WorkOrderFormDialog.vue';
import WorkOrderDetailDialog from './components/WorkOrderDetailDialog.vue';
import BatchListDialog from './components/BatchListDialog.vue';
import BatchFormDialog from './components/BatchFormDialog.vue';
import type { BatchFormValue } from './components/BatchFormDialog.vue';

defineOptions({ name: 'ProductionOrdersPage' });

const {
  orders,
  loading,
  total,
  currentPage,
  pageSize,
  query,
  loadOrders,
  loadPageData,
  searchOrders,
  resetQuery,
  handlePageSizeChange,
  handlePageChange,
} = useWorkOrdersList();

/** 页面持有的候选实例：产品（筛选 + 工单弹窗）、负责人（工单/详情/批次弹窗） */
const productSource = useProductOptions();
const userSource = useUserOptions();

/** 工单产品候选：仅成品 */
const finishedProducts = computed(() =>
  productSource.options.value.filter((p) => p.itemKind === 'finished_product'),
);
const getOwnerName = (ownerId: string | null | undefined): string =>
  userSource.options.value.find((user) => user.id === ownerId)?.displayName ?? '-';
const formatProduct = (product: ProductOption): string =>
  `${product.itemCode} / ${product.productName}`;
/** 产品筛选下拉实时选项：已选产品在候选被移除时显示「ID（已失效）」并禁用（筛选允许清除） */
const productChoices = computed(() =>
  buildLiveOptions(
    finishedProducts.value,
    query.productId ? [query.productId] : [],
    (product) => product.id,
  ),
);

const orderDeadline = (row: WorkOrderItem) =>
  deadlinePresentation(row.planEndDate, workOrderIsTerminal(row.status));
const workOrderRowClass = ({ row }: { row: WorkOrderItem }): string =>
  orderDeadline(row).tone === 'warning' ? 'risk-warning-row' : '';

/** 行内工单状态写操作守卫（下达/关闭/取消），同一行只允许一个在途（todo 3.5） */
const { isRowPending, beginRow, endRow } = useRowPending();

/** 创建生产批次的幂等意图（试点端点）：页面局部持有，弹窗打开/关闭时清除旧意图 */
const createBatchIntent = useIdempotentIntent();

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
  createBatchIntent.reset();
  batchFormDialogVisible.value = true;
};

/**
 * 批次弹窗关闭守卫：意图结果未知（网络模糊失败/提交在途/结果损坏/超时）时不得静默丢弃 K1，
 * 否则重新提交可能生成第二个自动编号批次。必须提示后由用户显式确认才 reset（放弃）。
 * idle 状态直接关闭；程序化关闭（提交成功后置 visible=false）不会触发 update:visible，走不到这里。
 */
const handleBatchFormDialogClose = async (visible: boolean): Promise<void> => {
  if (visible) {
    batchFormDialogVisible.value = true;
    return;
  }
  const state = createBatchIntent.getStatus();
  if (state === 'idle') {
    batchFormDialogVisible.value = false;
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
    batchFormDialogVisible.value = false;
    createBatchIntent.reset();
  } catch {
    // 用户选择保留：不关闭弹窗、不丢弃意图，K1 继续保留以便安全重试
  }
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
      const payload: CreateProductionBatchPayload = {
        batchNo: data.batchNo || '',
        routeId: data.routeId || null,
        plannedQuantity: data.plannedQuantity,
        ownerId: data.ownerId || null,
        planStartDate: toDateInputValue(data.planStartDate) || null,
        planEndDate: toDateInputValue(data.planEndDate) || null,
        remark: data.remark || null,
      };
      const workOrderId = taskOrder.value.id;
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
/** 页面重新激活：刷新页面可见候选（产品筛选 + 弹窗消费者）；正式列表由 onMounted 首访加载 */
onActivated(() => {
  void productSource.refresh();
  void userSource.refresh();
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
.orders-table :deep(.risk-warning-row > td:first-child) {
  box-shadow: inset 3px 0 0 #f59e0b;
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
.quantity-progress-label span,
.next-action {
  color: #6b7280;
  font-size: 12px;
}
.orders-table :deep(.el-progress-bar__outer) {
  background: #e5e7eb;
}
.orders-table :deep(.el-progress-bar__inner) {
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
