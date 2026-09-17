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
        :row-class-name="orderRowClass"
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
          label="工单类型"
          width="120"
        >
          <template #default="{ row }">{{ formatWorkOrderType(row.orderType) }}</template>
        </el-table-column>
        <el-table-column
          label="计划数量"
          width="100"
          align="right"
        >
          <template #default="{ row }">{{ formatQuantity(row.plannedQuantity) }}</template>
        </el-table-column>
        <el-table-column
          label="已分配"
          min-width="185"
          align="right"
        >
          <template #header>
            <el-tooltip content="已取消、已终止任务的计划数量不占用分配额度；收尾中的任务仍占用。"
              ><span>已分配</span></el-tooltip
            >
          </template>
          <template #default="{ row }">
            {{ formatQuantity(row.assignedQuantity) }}
            <div
              v-if="Number(row.terminatedPlannedQuantity) > 0"
              class="sub-text"
            >
              已终止计划 {{ formatQuantity(row.terminatedPlannedQuantity) }}，不占额度
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="审定产出（计划内 / 外 / 报废）"
          min-width="230"
        >
          <template #default="{ row }">
            <div>可用合计 {{ formatQuantity(approvedUsableQuantity(row.finalOutput)) }}</div>
            {{ formatQuantity(row.finalOutput?.availableQuantity) }} /
            {{ formatQuantity(row.finalOutput?.extraQuantity) }} /
            {{ formatQuantity(row.finalOutput?.scrapQuantity) }}
            <div
              v-if="row.finalOutput?.closingBatchCount"
              class="sub-text"
            >
              待结案 {{ row.finalOutput.closingBatchCount }} 批，草稿计划内
              {{ formatQuantity(row.finalOutput.pendingAvailableQuantity) }}（未计入）
            </div>
            <div class="sub-text">
              计划内
              {{
                plannedOutputGapText(
                  row.finalOutput?.plannedShortfallQuantity ?? row.plannedQuantity,
                )
              }}，已批准 {{ row.finalOutput?.finalizedBatchCount ?? 0 }} 批
            </div>
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
            <div>{{ formatDateForDisplay(row.planEndDate, '未设置') }}</div>
            <span :class="['deadline-badge', `deadline-${orderDeadline(row).tone}`]">
              {{ orderDeadline(row).label }}
            </span>
          </template>
        </el-table-column>
        <el-table-column
          label="状态"
          width="110"
        >
          <template #default="{ row }">
            <el-tag
              :type="orderStatusMeta(row.status).type"
              :class="['order-status-tag', `order-status-${row.status}`]"
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
              v-if="
                row.orderType === 'mass_production' &&
                (row.status === 'released' || row.status === 'doing')
              "
              link
              type="primary"
              :disabled="isRowPending(row.id)"
              @click="openMaterialConfiguration(row)"
              >物料版本配置</el-button
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
                :disabled="!hasMoreActions(row)"
                >更多</el-button
              >
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-if="canStartNextResearchRound(row)"
                    :disabled="isRowPending(row.id)"
                    @click="openNextResearchRound(row)"
                    >开启下一轮研发</el-dropdown-item
                  >
                  <el-dropdown-item
                    v-if="canCompleteOrder(row)"
                    :disabled="isRowPending(row.id)"
                    @click="openWorkOrderTransition(row, 'complete')"
                    >确认工单完工</el-dropdown-item
                  >
                  <el-dropdown-item
                    v-if="canCloseOrder(row)"
                    :disabled="isRowPending(row.id)"
                    @click="
                      openWorkOrderTransition(
                        row,
                        row.status === 'completed' ? 'archive' : 'early-close',
                      )
                    "
                    >{{
                      row.status === 'completed' ? '归档关闭工单' : '提前关闭工单'
                    }}</el-dropdown-item
                  >
                  <el-dropdown-item
                    v-if="canCancelOrder(row)"
                    :disabled="isRowPending(row.id)"
                    @click="cancelOrder(row)"
                    >取消工单</el-dropdown-item
                  >
                </el-dropdown-menu>
              </template>
            </el-dropdown>
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
      @update:visible="handleOrderFormDialogClose"
      @refresh-products="productSource.refresh"
      @refresh-users="userSource.refresh"
      @save="submitOrder"
    />

    <!-- 工单详情弹窗 -->
    <WorkOrderDetailDialog
      :visible="detailDialogVisible"
      :order="activeOrder"
      :loading="detailLoading"
      :user-options="userSource.options.value"
      @update:visible="handleDetailDialogClose"
      @view-research-order="(id) => openDetail({ id })"
      @next-research-round="openNextResearchRound"
    />

    <WorkOrderMaterialConfigurationDialog
      v-model:visible="materialConfigurationVisible"
      :work-order-id="materialConfigurationOrderId"
      @saved="loadOrders"
    />

    <WorkOrderTransitionDialog
      :visible="transitionDialogVisible"
      :mode="transitionMode"
      :order="transitionOrder"
      :submitting="transitionSubmitting"
      @update:visible="transitionDialogVisible = $event"
      @confirm="confirmWorkOrderTransition"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, ref } from 'vue';
import { approvedUsableQuantity, plannedOutputGapText } from './production-output-quantity';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { WORK_ORDER_TYPE_LABELS } from '@company/constants';
import TableToolbar from '../../components/TableToolbar.vue';
import PaginationFooter from '../../components/PaginationFooter.vue';
import type {
  CreateWorkOrderPayload,
  ProductOption,
  WorkOrderDetail,
  WorkOrderItem,
} from '@company/contracts';
import { productionApi } from '../../api/production';
import { EMessage } from '../../utils/message';
import { RouteMessageBox as ElMessageBox } from '../../utils/route-message-box';
import { useRowPending } from '../../utils/useRowPending';
import { buildLiveOptions } from '../../utils/live-options';
import { formatDateForDisplay, toDateInputValue } from '../../utils/date';
import { deadlinePresentation } from './production-task-presentation';
import { useIdempotentIntent } from '../../composables/idempotency/useIdempotentIntent';
import { useProductOptions } from '../../composables/options/useProductOptions';
import { useUserOptions } from '../../composables/options/useUserOptions';
import { ORDER_STATUS_META, formatQuantity, orderStatusMeta } from './production-status';
import { useWorkOrdersList } from './composables/useWorkOrdersList';
import { canStartNextResearchRound } from './research-work-order';
import { useWorkOrderDialogs, type WorkOrderFormHandle } from './composables/useWorkOrderDialogs';
import WorkOrderFormDialog from './components/WorkOrderFormDialog.vue';
import type { WorkOrderFormValue } from './components/WorkOrderFormDialog.vue';
import WorkOrderDetailDialog from './components/WorkOrderDetailDialog.vue';
import WorkOrderTransitionDialog from './components/WorkOrderTransitionDialog.vue';
import WorkOrderMaterialConfigurationDialog from './components/WorkOrderMaterialConfigurationDialog.vue';

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
const finishedProducts = computed(() => productSource.options.value);
const getOwnerName = (ownerId: string | null | undefined): string =>
  userSource.options.value.find((user) => user.id === ownerId)?.displayName ?? '-';
const formatProduct = (product: ProductOption): string =>
  `${product.itemCode} / ${product.productName}`;
const formatWorkOrderType = (orderType: WorkOrderItem['orderType']): string =>
  WORK_ORDER_TYPE_LABELS[orderType];
/** 产品筛选下拉实时选项：已选产品在候选被移除时显示「ID（已失效）」并禁用（筛选允许清除） */
const productChoices = computed(() =>
  buildLiveOptions(
    finishedProducts.value,
    query.productId ? [query.productId] : [],
    (product) => product.id,
  ),
);
const orderDeadline = (row: WorkOrderItem) =>
  deadlinePresentation(
    row.planEndDate,
    row.status === 'completed' || row.status === 'closed' || row.status === 'cancelled',
  );
const orderRowClass = ({ row }: { row: WorkOrderItem }): string =>
  orderDeadline(row).overdueDays > 0 ? 'deadline-overdue-row' : '';

/** 行内工单状态写操作守卫（下达/关闭/取消），同一行只允许一个在途（todo 3.5） */
const { isRowPending, beginRow, endRow } = useRowPending();

const createOrderIntent = useIdempotentIntent('工单');

/* ====== 弹窗状态 ====== */
const orderDialogVisible = ref(false);
const transitionDialogVisible = ref(false);
const editingOrderId = ref<string | null>(null);
const editingOrderVersion = ref(0);
const submitting = ref(false);
const transitionSubmitting = ref(false);
const transitionOrder = ref<WorkOrderDetail | null>(null);
const transitionMode = ref<'complete' | 'early-close' | 'archive'>('complete');
const workOrderFormDialogRef = ref<WorkOrderFormHandle>();

const {
  activeOrder,
  detailDialogVisible,
  detailLoading,
  openDetail,
  openEdit,
  openNextResearchRound,
  closeDetail: handleDetailDialogClose,
  invalidate: invalidateWorkOrderDialogRequest,
} = useWorkOrderDialogs({
  form: workOrderFormDialogRef,
  editingOrderId,
  editingOrderVersion,
  orderDialogVisible,
  resetCreationIntent: createOrderIntent.reset,
  beginRow,
  endRow,
});

/* ====== 工单 CRUD ====== */
const openCreate = (): void => {
  invalidateWorkOrderDialogRequest();
  editingOrderId.value = null;
  workOrderFormDialogRef.value?.resetForm();
  createOrderIntent.reset();
  orderDialogVisible.value = true;
};

const submitOrder = async (data: WorkOrderFormValue): Promise<void> => {
  if (submitting.value) return;
  submitting.value = true;
  try {
    const editId = editingOrderId.value;
    if (editId) {
      await productionApi.updateOrder(editId, {
        orderType: data.orderType,
        productId: data.productId,
        plannedQuantity: data.plannedQuantity,
        workOrderOwnerId: data.workOrderOwnerId || null,
        customerName: data.customerName || null,
        qualityLevel: data.qualityLevel || null,
        planStartDate: toDateInputValue(data.planStartDate),
        planEndDate: toDateInputValue(data.planEndDate),
        externalOrderNo: data.externalOrderNo || null,
        remark: data.remark || null,
        version: editingOrderVersion.value,
      });
      EMessage.success('工单已更新');
    } else {
      const payload: CreateWorkOrderPayload = {
        orderType: data.orderType,
        previousResearchOrderId: data.previousResearchOrderId,
        productId: data.productId,
        plannedQuantity: data.plannedQuantity,
        workOrderOwnerId: data.workOrderOwnerId || null,
        customerName: data.customerName || null,
        qualityLevel: data.qualityLevel || null,
        planStartDate: toDateInputValue(data.planStartDate),
        planEndDate: toDateInputValue(data.planEndDate),
        externalOrderNo: data.externalOrderNo || null,
        remark: data.remark || null,
      };
      const created = await createOrderIntent.execute(
        { intentType: 'production.work-order.create', params: {}, query: {}, body: payload },
        (key) => productionApi.createOrder(payload, key),
      );
      EMessage.success(`工单 ${created.workOrderNo} 已新增`);
    }
    orderDialogVisible.value = false;
    await loadOrders();
  } catch (error) {
    EMessage.error(error, '工单保存失败');
  } finally {
    submitting.value = false;
  }
};

const handleOrderFormDialogClose = async (visible: boolean): Promise<void> => {
  if (!visible) invalidateWorkOrderDialogRequest();
  if (submitting.value) return;
  if (!visible && createOrderIntent.getStatus() !== 'idle') {
    try {
      await ElMessageBox.confirm(
        '上次创建结果尚未确认。请先在工单列表核对，关闭后重新创建可能产生重复工单。是否仍要关闭？',
        '关闭确认',
        { confirmButtonText: '仍要关闭', cancelButtonText: '继续保留', type: 'warning' },
      );
    } catch {
      return;
    }
  }
  orderDialogVisible.value = visible;
  if (!visible) createOrderIntent.reset();
};

/* ====== 工单状态变更 ====== */
const releaseOrder = (row: WorkOrderItem) =>
  runSimpleOrderAction(row, '下达', () => productionApi.releaseOrder(row.id, row.version));
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
    await productionApi.cancelOrder(row.id, { version: row.version, reason: value.trim() });
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
  mode: 'complete' | 'early-close' | 'archive',
): Promise<void> => {
  if (!beginRow(row.id)) return;
  try {
    transitionOrder.value = await productionApi.getOrder(row.id);
    transitionMode.value = mode;
    transitionDialogVisible.value = true;
  } catch (error) {
    EMessage.error(error, '工单状态核对失败');
  } finally {
    endRow(row.id);
  }
};

const confirmWorkOrderTransition = async (value: {
  mode: 'complete' | 'early-close' | 'archive';
  reason: string | null;
}): Promise<void> => {
  const order = transitionOrder.value;
  if (!order || !beginRow(order.id)) return;
  transitionSubmitting.value = true;
  try {
    if (value.mode === 'complete') {
      await productionApi.completeOrder(order.id, order.version);
      EMessage.success('工单已确认完工');
    } else {
      await productionApi.closeOrder(order.id, {
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

const canEditOrder = (row: WorkOrderItem): boolean => row.status === 'draft';
const canCompleteOrder = (row: WorkOrderItem): boolean =>
  row.status === 'released' || row.status === 'doing';
const canCloseOrder = (row: WorkOrderItem): boolean =>
  row.status === 'released' || row.status === 'doing' || row.status === 'completed';
const canCancelOrder = (row: WorkOrderItem): boolean => row.status === 'draft';
const hasMoreActions = (row: WorkOrderItem): boolean =>
  canCompleteOrder(row) ||
  canCloseOrder(row) ||
  canCancelOrder(row) ||
  canStartNextResearchRound(row);

const materialConfigurationVisible = ref(false);
const materialConfigurationOrderId = ref<string | null>(null);
const openMaterialConfiguration = (row: WorkOrderItem): void => {
  materialConfigurationOrderId.value = row.id;
  materialConfigurationVisible.value = true;
};

let hasActivated = false;
onMounted(loadPageData);
/** 页面重新激活：刷新页面可见候选（产品筛选 + 弹窗消费者）；正式列表由 onMounted 首访加载 */
onActivated(() => {
  if (hasActivated) void loadOrders();
  hasActivated = true;
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
.orders-table :deep(.order-status-draft) {
  background: #f4f4f5;
  color: #909399;
}
.orders-table :deep(.order-status-released) {
  background: #f5f3ff;
  color: #a78bfa;
}
.orders-table :deep(.order-status-doing) {
  background: #ecf5ff;
  color: #409eff;
}
.orders-table :deep(.order-status-completed) {
  background: #f0f9eb;
  color: #67c23a;
}
.orders-table :deep(.order-status-closed) {
  background: #f0fdfa;
  color: #14b8a6;
}
.orders-table :deep(.order-status-cancelled) {
  background: #fef0f0;
  color: #f56c6c;
}
.orders-table :deep(tr.deadline-overdue-row) {
  --el-table-tr-bg-color: rgb(255, 247, 237);
  --el-table-row-hover-bg-color: rgb(255, 239, 219);
}
.orders-table :deep(tr.deadline-overdue-row > td.el-table__cell) {
  background-color: rgb(255, 247, 237) !important;
}
.orders-table :deep(tr.deadline-overdue-row:hover > td.el-table__cell) {
  background-color: rgb(255, 239, 219) !important;
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
  border-color: #e5e7eb;
  background: #f4f4f5;
  color: #909399;
}
.deadline-normal {
  border-color: #d9ecff;
  background: #ecf5ff;
  color: #409eff;
}
.deadline-warning {
  border-color: #fde2e2;
  background: #fef0f0;
  color: #f56c6c;
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
