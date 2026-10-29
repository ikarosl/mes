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

    <section
      ref="tablePanel"
      class="table-panel"
    >
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
              class="order-assignment-note"
            >
              <span>已终止计划 {{ formatQuantity(row.terminatedPlannedQuantity) }}</span>
              <span>不占额度</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="审定产出（计划内 / 外 / 报废）"
          min-width="230"
        >
          <template #default="{ row }">
            <div class="order-output-summary">
              <div class="order-output-summary__total">
                <span>可用合计</span>
                <strong>{{ formatQuantity(approvedUsableQuantity(row.finalOutput)) }}</strong>
              </div>
              <div class="order-output-summary__breakdown">
                <span>{{ formatQuantity(row.finalOutput?.availableQuantity) }}</span>
                <span>/</span>
                <span>{{ formatQuantity(row.finalOutput?.extraQuantity) }}</span>
                <span>/</span>
                <span>{{ formatQuantity(row.finalOutput?.scrapQuantity) }}</span>
              </div>
              <div class="order-output-meta">
                <span
                  v-if="row.finalOutput?.closingBatchCount"
                  class="order-output-meta__item"
                >
                  <span class="order-output-meta__label">待结案</span>
                  <span>{{ row.finalOutput.closingBatchCount }} 批</span>
                </span>
                <span class="order-output-meta__item">
                  <span class="order-output-meta__label">已批准</span>
                  <span>{{ row.finalOutput?.finalizedBatchCount ?? 0 }} 批</span>
                </span>
                <span class="order-output-meta__item order-output-meta__item--wide">
                  <span class="order-output-meta__label">计划内</span>
                  <span>{{
                    plannedOutputGapText(
                      row.finalOutput?.plannedShortfallQuantity ?? row.plannedQuantity,
                    )
                  }}</span>
                </span>
                <span
                  v-if="row.finalOutput?.closingBatchCount"
                  class="order-output-meta__item order-output-meta__item--wide"
                >
                  <el-tooltip content="待结案任务的计划内产出草稿，尚未计入审定产出。">
                    <span class="order-output-meta__label">草稿计划内</span>
                  </el-tooltip>
                  <span>{{ formatQuantity(row.finalOutput.pendingAvailableQuantity) }}</span>
                  <span class="order-output-meta__label">未计入</span>
                </span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="负责人"
          width="110"
        >
          <template #default="{ row }">{{ row.ownerName || row.workOrderOwnerId || '-' }}</template>
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
          :width="actionColumnWidth"
          fixed="right"
        >
          <template #header><span class="order-actions-heading">操作</span></template>
          <template #default="{ row }">
            <div class="order-row-actions">
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

    <!-- 新增/编辑工单弹窗 -->
    <WorkOrderFormDialog
      ref="workOrderFormDialogRef"
      :visible="orderDialogVisible"
      :editing-order-id="editingOrderId"
      :product-options="productSource.options.value"
      :product-options-status="productSource.status.value"
      :submitting="submitting"
      @update:visible="handleOrderFormDialogClose"
      @refresh-products="productSource.refresh"
      @save="submitOrder"
    />

    <!-- 工单详情弹窗 -->
    <WorkOrderDetailDialog
      :visible="detailDialogVisible"
      :order="activeOrder"
      :loading="detailLoading"
      @update:visible="handleDetailDialogClose"
      @refresh="refreshOrderDetail"
      @view-research-order="(id) => openDetail({ id })"
      @next-research-round="openNextResearchRound"
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
import { computed, onMounted } from 'vue';
import { approvedUsableQuantity, plannedOutputGapText } from '../shared/production-output-quantity';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { WORK_ORDER_TYPE_LABELS } from '@company/constants';
import TableToolbar from '../../../components/TableToolbar.vue';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import type { ProductOption, WorkOrderItem } from '@company/contracts';
import { useRowPending } from '../../../composables/use-row-pending';
import { buildLiveOptions } from '../../../utils/live-options';
import { formatDateForDisplay } from '../../../utils/date';
import { deadlinePresentation } from '../shared/production-task-presentation';
import { useProductOptions } from '../../../composables/options/useProductOptions';
import { useTableActionColumn } from '../../../composables/useTableActionColumn';
import { formatQuantity } from '../../../utils/quantity';
import { ORDER_STATUS_META, orderStatusMeta } from '../shared/production-status';
import { useWorkOrdersList } from './use-work-orders-list';
import { canStartNextResearchRound } from './research-work-order';
import { useWorkOrderEditor } from './use-work-order-editor';
import { useWorkOrderTransitions } from './use-work-order-transitions';
import WorkOrderFormDialog from './WorkOrderFormDialog.vue';
import WorkOrderDetailDialog from './WorkOrderDetailDialog.vue';
import WorkOrderTransitionDialog from './WorkOrderTransitionDialog.vue';

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
const { tablePanel, actionColumnWidth } = useTableActionColumn(
  orders,
  '.order-row-actions, .order-actions-heading',
);

/** 产品筛选和工单表单共用本页的产品候选；负责人候选由工单表单独立持有。 */
const productSource = useProductOptions();

/** 工单产品候选：仅成品 */
const finishedProducts = computed(() => productSource.options.value);
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

const {
  orderDialogVisible,
  editingOrderId,
  submitting,
  workOrderFormDialogRef,
  activeOrder,
  detailDialogVisible,
  detailLoading,
  openDetail,
  refreshOrderDetail,
  openEdit,
  openNextResearchRound,
  handleDetailDialogClose,
  openCreate,
  submitOrder,
  handleOrderFormDialogClose,
} = useWorkOrderEditor({ loadOrders, beginRow, endRow });

const {
  transitionDialogVisible,
  transitionSubmitting,
  transitionOrder,
  transitionMode,
  releaseOrder,
  cancelOrder,
  openWorkOrderTransition,
  confirmWorkOrderTransition,
} = useWorkOrderTransitions({ loadOrders, beginRow, endRow });

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

onMounted(() => {
  void loadPageData();
  void productSource.refresh();
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
.order-row-actions {
  display: inline-flex;
  width: max-content;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.order-actions-heading {
  display: inline-block;
  white-space: nowrap;
}
.order-row-actions :deep(.el-button) {
  margin-left: 0;
}
.order-assignment-note {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
}
.order-output-summary {
  display: grid;
  gap: 4px;
  font-variant-numeric: tabular-nums;
}
.order-output-summary__total,
.order-output-summary__breakdown {
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.order-output-summary__total {
  gap: 8px;
}
.order-output-summary__breakdown {
  flex-wrap: wrap;
}
.order-output-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px 8px;
  font-size: 12px;
  line-height: 18px;
}
.order-output-meta__item {
  display: flex;
  align-items: baseline;
  gap: 4px;
  white-space: nowrap;
}
.order-output-meta__item--wide {
  grid-column: 1 / -1;
}
.order-output-meta__label {
  color: var(--el-text-color-secondary);
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
