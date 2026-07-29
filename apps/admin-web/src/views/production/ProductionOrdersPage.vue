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
              v-for="item in orderStatusOptions"
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
              :type="getOrderStatusMeta(row.status).type"
              effect="light"
            >
              {{ getOrderStatusMeta(row.status).label }}
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
              :disabled="row.status !== 'draft'"
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
                    :disabled="!canCloseOrder(row)"
                    @click="closeOrder(row)"
                    >关闭工单</el-dropdown-item
                  >
                  <el-dropdown-item
                    :disabled="!canCancelOrder(row)"
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
    <el-dialog
      v-model="orderDialogVisible"
      :title="editingOrderId ? '编辑工单' : '新增工单'"
      :width="DialogWidth.lg"
      @open="loadOptions"
    >
      <el-form
        class="dialog-form"
        label-width="108px"
        :model="orderForm"
        :disabled="submitting"
      >
        <div class="form-grid">
          <el-form-item
            label="工单号"
            required
          >
            <el-input
              v-model="orderForm.workOrderNo"
              placeholder="请输入工单号"
            />
          </el-form-item>
          <el-form-item
            label="产品"
            required
          >
            <el-select
              v-model="orderForm.productId"
              filterable
              placeholder="请选择产品"
              @change="handleOrderProductChange"
              @visible-change="(v: boolean) => v && loadOptions()"
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
          <el-form-item
            label="计划数量"
            required
          >
            <el-input-number
              v-model="orderForm.plannedQuantity"
              :min="0.0001"
              :precision="4"
              :step="1"
            />
          </el-form-item>
          <el-form-item label="负责人">
            <el-select
              v-model="orderForm.workOrderOwnerId"
              clearable
              filterable
              placeholder="请选择工单负责人"
              @visible-change="(v: boolean) => v && loadOptions()"
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
          <el-form-item label="客户名称">
            <el-input
              v-model="orderForm.customerName"
              placeholder="可选填写"
            />
          </el-form-item>
          <el-form-item label="质量等级">
            <el-input
              v-model="orderForm.qualityLevel"
              placeholder="客户质量等级代码"
            />
          </el-form-item>
          <el-form-item label="计划开始">
            <el-date-picker
              v-model="orderForm.planStartDate"
              type="date"
              value-format="YYYY-MM-DD"
            />
          </el-form-item>
          <el-form-item label="计划完成">
            <el-date-picker
              v-model="orderForm.planEndDate"
              type="date"
              value-format="YYYY-MM-DD"
            />
          </el-form-item>
          <el-form-item label="外部订单号">
            <el-input
              v-model="orderForm.externalOrderNo"
              placeholder="可选填写"
            />
          </el-form-item>
        </div>
        <el-form-item label="备注">
          <el-input
            v-model="orderForm.remark"
            type="textarea"
            :rows="3"
            placeholder="可填写生产要求或注意事项"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="orderDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          @click="submitOrder"
          >保存工单</el-button
        >
      </template>
    </el-dialog>

    <!-- 工单详情弹窗 -->
    <el-dialog
      v-model="detailDialogVisible"
      title="工单详情"
      :width="DialogWidth.xl"
    >
      <template v-if="activeOrder">
        <el-descriptions
          :column="3"
          border
        >
          <el-descriptions-item label="工单号">{{ activeOrder.workOrderNo }}</el-descriptions-item>
          <el-descriptions-item label="产品">{{ activeOrder.productName }}</el-descriptions-item>
          <el-descriptions-item label="产品编码">{{
            activeOrder.productCode
          }}</el-descriptions-item>
          <el-descriptions-item label="计划数量">{{
            formatQuantity(activeOrder.plannedQuantity)
          }}</el-descriptions-item>
          <el-descriptions-item label="已分配">{{
            formatQuantity(activeOrder.assignedQuantity)
          }}</el-descriptions-item>
          <el-descriptions-item label="外部订单号">{{
            activeOrder.externalOrderNo || '-'
          }}</el-descriptions-item>
          <el-descriptions-item label="负责人">{{
            getOwnerName(activeOrder.workOrderOwnerId)
          }}</el-descriptions-item>
          <el-descriptions-item label="客户名称">{{
            activeOrder.customerName || '-'
          }}</el-descriptions-item>
          <el-descriptions-item label="质量等级">{{
            activeOrder.qualityLevel || '-'
          }}</el-descriptions-item>
          <el-descriptions-item label="计划开始">{{
            formatDateForDisplay(activeOrder.planStartDate)
          }}</el-descriptions-item>
          <el-descriptions-item label="计划完成">{{
            formatDateForDisplay(activeOrder.planEndDate)
          }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{
            getOrderStatusMeta(activeOrder.status).label
          }}</el-descriptions-item>
          <el-descriptions-item label="版本号">{{ activeOrder.version }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{
            activeOrder.createdAt || '-'
          }}</el-descriptions-item>
          <el-descriptions-item
            label="备注"
            :span="3"
            >{{ activeOrder.remark || '-' }}</el-descriptions-item
          >
        </el-descriptions>

        <div class="dialog-section-title">生产批次</div>
        <el-table
          v-if="activeOrder.batches?.length"
          :data="activeOrder.batches"
          class="detail-table"
        >
          <el-table-column
            prop="batchNo"
            label="生产批次号"
            min-width="160"
          />
          <el-table-column
            label="计划数量"
            width="120"
            align="right"
          >
            <template #default="{ row }">{{ formatQuantity(row.plannedQuantity) }}</template>
          </el-table-column>
          <el-table-column
            label="完成/合格"
            width="160"
            align="right"
          >
            <template #default="{ row }"
              >{{ formatQuantity(row.completedQuantity) }} /
              {{ formatQuantity(row.qualifiedQuantity) }}</template
            >
          </el-table-column>
          <el-table-column
            label="任务状态"
            width="120"
          >
            <template #default="{ row }">{{ getBatchStatusMeta(row.status).label }}</template>
          </el-table-column>
          <el-table-column
            label="负责人"
            width="120"
          >
            <template #default="{ row }">{{ row.ownerName || '-' }}</template>
          </el-table-column>
        </el-table>
        <div
          v-else
          class="empty-hint"
        >
          暂无生产批次
        </div>
      </template>
    </el-dialog>

    <!-- 生产批次列表弹窗 -->
    <el-dialog
      v-model="taskDialogVisible"
      title="生产批次"
      :width="DialogWidth.xl"
    >
      <template v-if="taskOrder">
        <div class="task-toolbar">
          <div>
            <span class="order-no">{{ taskOrder.workOrderNo }}</span>
            <span class="sub-text">
              计划 {{ formatQuantity(taskOrder.plannedQuantity) }}， 已分配
              {{ formatQuantity(taskOrder.assignedQuantity) }}
            </span>
          </div>
          <el-button
            type="primary"
            :icon="Plus"
            :disabled="
              taskOrder.status === 'draft' ||
              Number(taskOrder.plannedQuantity) <= Number(taskOrder.assignedQuantity)
            "
            @click="openCreateBatch"
          >
            新增生产批次
          </el-button>
        </div>
        <el-table
          :data="taskBatches"
          class="detail-table"
        >
          <el-table-column
            prop="batchNo"
            label="生产批次号"
            min-width="160"
          />
          <el-table-column
            label="计划数量"
            width="120"
            align="right"
          >
            <template #default="{ row }">{{ formatQuantity(row.plannedQuantity) }}</template>
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
            label="任务状态"
            width="130"
          >
            <template #default="{ row }">
              <el-tag
                :type="getBatchStatusMeta(row.status).type"
                effect="light"
              >
                {{ getBatchStatusMeta(row.status).label }}
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
            label="完成/合格"
            width="150"
            align="right"
          >
            <template #default="{ row }"
              >{{ formatQuantity(row.completedQuantity) }} /
              {{ formatQuantity(row.qualifiedQuantity) }}</template
            >
          </el-table-column>
          <el-table-column
            label="操作"
            width="90"
            fixed="right"
          >
            <template #default="{ row }">
              <el-button
                link
                type="primary"
                @click="openEditBatch(row)"
                >编辑</el-button
              >
            </template>
          </el-table-column>
        </el-table>
      </template>
    </el-dialog>

    <!-- 新增/编辑生产批次弹窗 -->
    <el-dialog
      v-model="batchFormDialogVisible"
      :title="editingBatchId ? '编辑生产批次' : '新增生产批次'"
      :width="DialogWidth.md"
    >
      <el-form
        class="dialog-form"
        label-width="108px"
        :model="batchForm"
        :disabled="submitting"
      >
        <el-form-item label="批次号">
          <el-input
            v-model="batchForm.batchNo"
            placeholder="不填则系统自动生成"
          />
        </el-form-item>
        <el-form-item
          label="计划数量"
          required
        >
          <el-input-number
            v-model="batchForm.plannedQuantity"
            :min="0.0001"
            :max="batchQuantityMax ?? undefined"
            :precision="4"
            :step="1"
          />
        </el-form-item>
        <el-form-item label="计划开始">
          <el-date-picker
            v-model="batchForm.planStartDate"
            type="date"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        <el-form-item label="计划完成">
          <el-date-picker
            v-model="batchForm.planEndDate"
            type="date"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        <el-form-item label="工艺路线">
          <el-select
            v-model="batchForm.routeId"
            clearable
            filterable
            placeholder="默认使用产品默认路线"
          >
            <el-option
              v-for="route in availableRouteOptions"
              :key="route.id"
              :label="route.routeName"
              :value="route.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="负责人">
          <el-select
            v-model="batchForm.ownerId"
            clearable
            filterable
            placeholder="请选择负责人"
          >
            <el-option
              v-for="user in userOptions"
              :key="user.id"
              :label="user.displayName"
              :value="user.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="batchForm.remark"
            type="textarea"
            :rows="3"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchFormDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          @click="submitBatch"
          >保存生产批次</el-button
        >
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, reactive, ref } from 'vue';
import { Plus, Refresh } from '@element-plus/icons-vue';
import TableToolbar from '../../components/TableToolbar.vue';
import type {
  ProductionBatchItem,
  ProductionBatchStatus,
  WorkOrderDetail,
  WorkOrderItem,
  WorkOrderStatus,
} from '@company/contracts';
import { DialogWidth } from '../../utils/dialog';
import { formatDateForDisplay, toDateInputValue } from '../../utils/date';
import { EMessage } from '../../utils/message';
import { RouteMessageBox as ElMessageBox } from '../../utils/route-message-box';
import { buildLiveOptions, hasUnavailableSelection } from '../../utils/live-options';
import { productionApi } from '../../api/production';
import { productApi } from '../../api/product';

defineOptions({ name: 'ProductionOrdersPage' });

/* ====== 基础类型 ====== */
interface ProductOption {
  id: string;
  productName: string;
  itemCode: string;
}

interface SystemUserOption {
  id: string;
  displayName: string;
}

interface ProcessRouteOption {
  id: string;
  routeName: string;
  version: string;
  productId: string;
}

/* ====== 状态选项 ====== */
const orderStatusOptions: Array<{
  value: WorkOrderStatus;
  label: string;
  type: 'info' | 'primary' | 'success' | 'warning' | 'danger';
}> = [
  { value: 'draft', label: '草稿', type: 'info' },
  { value: 'released', label: '已下达', type: 'primary' },
  { value: 'doing', label: '生产中', type: 'primary' },
  { value: 'completed', label: '已完工', type: 'success' },
  { value: 'closed', label: '已关闭', type: 'info' },
  { value: 'cancelled', label: '已取消', type: 'danger' },
];

const batchStatusOptions: Array<{
  value: ProductionBatchStatus;
  label: string;
  type: 'info' | 'primary' | 'success' | 'danger';
}> = [
  { value: 'pending', label: '已生成批次', type: 'info' },
  { value: 'material_pending', label: '已生成物料需求', type: 'primary' },
  { value: 'material_assigned', label: '已分配物料批次', type: 'primary' },
  { value: 'material_outbound', label: '已领料出库', type: 'primary' },
  { value: 'doing', label: '执行中', type: 'primary' },
  { value: 'completed', label: '已完成', type: 'success' },
  { value: 'cancelled', label: '已取消', type: 'danger' },
];

/* ====== 响应式数据 ====== */
const orders = ref<WorkOrderItem[]>([]);
const productOptions = ref<ProductOption[]>([]);
const routeOptions = ref<ProcessRouteOption[]>([]);
const userOptions = ref<SystemUserOption[]>([]);
const activeOrder = ref<WorkOrderDetail | null>(null);
const taskOrder = ref<WorkOrderItem | null>(null);
const taskBatches = ref<ProductionBatchItem[]>([]);
const loading = ref(false);
const submitting = ref(false);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(10);
const orderDialogVisible = ref(false);
const detailDialogVisible = ref(false);
const taskDialogVisible = ref(false);
const batchFormDialogVisible = ref(false);
const editingOrderId = ref<string | null>(null);
const editingBatchId = ref<string | null>(null);

const query = reactive({ keyword: '', productId: '', status: '' });
const orderForm = reactive({
  workOrderNo: '',
  productId: '',
  plannedQuantity: 1,
  workOrderOwnerId: '',
  customerName: '',
  qualityLevel: '',
  planStartDate: '',
  planEndDate: '',
  externalOrderNo: '',
  remark: '',
});
const batchForm = reactive({
  batchNo: '',
  routeId: '',
  plannedQuantity: 1,
  ownerId: '',
  planStartDate: '',
  planEndDate: '',
  remark: '',
});

const editingBatch = computed(
  () => taskBatches.value.find((item) => item.id === editingBatchId.value) ?? null,
);
const availableRouteOptions = computed(() => {
  if (!taskOrder.value) return [];
  return routeOptions.value.filter((route) => route.productId === taskOrder.value?.productId);
});
const batchQuantityMax = computed(() => {
  if (!taskOrder.value) return null;
  const planned = Number(taskOrder.value.plannedQuantity);
  const assigned = Number(taskOrder.value.assignedQuantity);
  const currentBatch = editingBatch.value ? Number(editingBatch.value.plannedQuantity) : 0;
  const maxQty = planned - assigned + currentBatch;
  return Number.isFinite(maxQty) ? Math.max(maxQty, 0) : null;
});

const getOwnerName = (ownerId: string | null | undefined): string => {
  if (!ownerId) return '-';
  return userOptions.value.find((u) => u.id === ownerId)?.displayName ?? '-';
};

/** 实时选项：产品和负责人 */
const productChoices = computed(() =>
  buildLiveOptions(
    productOptions.value,
    orderForm.productId ? [orderForm.productId] : [],
    (p) => p.id,
  ),
);
const userChoices = computed(() =>
  buildLiveOptions(
    userOptions.value,
    orderForm.workOrderOwnerId ? [orderForm.workOrderOwnerId] : [],
    (u) => u.id,
  ),
);

/* ====== 数据加载 ====== */
const loadOptions = async () => {
  try {
    const [formOptions, userOpts] = await Promise.all([
      productApi.productFormOptions(),
      productApi.userOptions(),
    ]);
    productOptions.value = formOptions.products.map((p) => ({
      id: p.id,
      productName: p.productName,
      itemCode: p.itemCode,
    }));
    routeOptions.value = formOptions.routes.map((r) => ({
      id: r.id,
      routeName: r.routeName,
      version: r.versionNo,
      productId: r.productId,
    }));
    userOptions.value = userOpts;
  } catch {
    productOptions.value = [];
    routeOptions.value = [];
    userOptions.value = [];
  }
};

const loadOrders = async () => {
  loading.value = true;
  try {
    const page = await productionApi.listOrders({
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: query.keyword || undefined,
      productId: query.productId || undefined,
      status: (query.status || undefined) as WorkOrderStatus | undefined,
    });
    orders.value = page.items;
    total.value = page.total;
    syncTaskOrderFromOrders();
  } catch (error) {
    EMessage.error(error, '工单查询失败');
  } finally {
    loading.value = false;
  }
};

const syncTaskOrderFromOrders = () => {
  if (!taskOrder.value) return;
  const latest = orders.value.find((item) => item.id === taskOrder.value?.id);
  if (latest) taskOrder.value = latest;
};

const loadPageData = async () => {
  loading.value = true;
  try {
    await Promise.all([loadOptions(), loadOrders()]);
  } finally {
    loading.value = false;
  }
};

const searchOrders = async () => {
  currentPage.value = 1;
  await loadOrders();
};
const resetQuery = async () => {
  query.keyword = '';
  query.productId = '';
  query.status = '';
  currentPage.value = 1;
  await loadOrders();
};
const handlePageSizeChange = async () => {
  currentPage.value = 1;
  await loadOrders();
};

/* ====== 工单 CRUD ====== */
const resetOrderForm = () => {
  Object.assign(orderForm, {
    workOrderNo: '',
    productId: '',
    plannedQuantity: 1,
    workOrderOwnerId: '',
    customerName: '',
    qualityLevel: '',
    planStartDate: '',
    planEndDate: '',
    externalOrderNo: '',
    remark: '',
  });
};

const openCreate = () => {
  editingOrderId.value = null;
  resetOrderForm();
  orderDialogVisible.value = true;
};

const openEdit = (row: WorkOrderItem) => {
  editingOrderId.value = row.id;
  Object.assign(orderForm, {
    workOrderNo: row.workOrderNo,
    productId: row.productId,
    plannedQuantity: Number(row.plannedQuantity),
    workOrderOwnerId: row.workOrderOwnerId ?? '',
    customerName: row.customerName ?? '',
    qualityLevel: row.qualityLevel ?? '',
    planStartDate: toDateInputValue(row.planStartDate),
    planEndDate: toDateInputValue(row.planEndDate),
    externalOrderNo: row.externalOrderNo ?? '',
    remark: row.remark ?? '',
  });
  orderDialogVisible.value = true;
};

const handleOrderProductChange = () => {};

const submitOrder = async () => {
  if (!orderForm.workOrderNo.trim() || !orderForm.productId || orderForm.plannedQuantity <= 0) {
    EMessage.warning('请填写工单号、产品和计划数量');
    return;
  }
  if (
    hasUnavailableSelection(
      productOptions.value,
      orderForm.productId ? [orderForm.productId] : [],
      (p) => p.id,
    )
  ) {
    EMessage.warning('所选产品已失效，请重新选择');
    return;
  }
  if (
    hasUnavailableSelection(
      userOptions.value,
      orderForm.workOrderOwnerId ? [orderForm.workOrderOwnerId] : [],
      (u) => u.id,
    )
  ) {
    EMessage.warning('所选负责人已失效，请重新选择');
    return;
  }
  submitting.value = true;
  try {
    const editId = editingOrderId.value;
    if (editId) {
      const order = orders.value.find((o) => o.id === editId);
      await productionApi.updateOrder(editId, {
        workOrderOwnerId: orderForm.workOrderOwnerId || null,
        customerName: orderForm.customerName || null,
        qualityLevel: orderForm.qualityLevel || null,
        planStartDate: toDateInputValue(orderForm.planStartDate) || null,
        planEndDate: toDateInputValue(orderForm.planEndDate) || null,
        externalOrderNo: orderForm.externalOrderNo || null,
        remark: orderForm.remark || null,
        version: order?.version ?? 0,
      });
      EMessage.success('工单已更新');
    } else {
      await productionApi.createOrder({
        workOrderNo: orderForm.workOrderNo.trim(),
        productId: orderForm.productId,
        plannedQuantity: orderForm.plannedQuantity,
        workOrderOwnerId: orderForm.workOrderOwnerId || null,
        customerName: orderForm.customerName || null,
        qualityLevel: orderForm.qualityLevel || null,
        planStartDate: toDateInputValue(orderForm.planStartDate) || null,
        planEndDate: toDateInputValue(orderForm.planEndDate) || null,
        externalOrderNo: orderForm.externalOrderNo || null,
        remark: orderForm.remark || null,
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

const openDetail = async (row: WorkOrderItem) => {
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
) => {
  try {
    await ElMessageBox.confirm(`确认${label}该工单？`, `${label}工单`, {
      confirmButtonText: `确认${label}`,
      cancelButtonText: '取消',
      type: action === 'cancel' ? 'warning' : 'info',
    });
  } catch {
    return;
  }
  try {
    await productionApi.changeOrderStatus(row.id, action, row.version);
    EMessage.success(`工单已${label}`);
    await loadOrders();
  } catch (error) {
    EMessage.error(error, `工单${label}失败`);
  }
};

const canEditOrder = (row: WorkOrderItem) => row.status === 'draft' || row.status === 'released';
const canCloseOrder = (row: WorkOrderItem) =>
  row.status === 'released' || row.status === 'completed';
const canCancelOrder = (row: WorkOrderItem) => ['draft', 'released', 'doing'].includes(row.status);

/* ====== 批次管理 ====== */
const openTasks = async (row: WorkOrderItem) => {
  taskOrder.value = row;
  try {
    taskBatches.value = await productionApi.listOrderBatches(row.id);
    taskDialogVisible.value = true;
  } catch (error) {
    EMessage.error(error, '生产批次查询失败');
  }
};

const resetBatchForm = () => {
  Object.assign(batchForm, {
    batchNo: '',
    routeId: '',
    plannedQuantity: 1,
    ownerId: '',
    planStartDate: toDateInputValue(taskOrder.value?.planStartDate),
    planEndDate: toDateInputValue(taskOrder.value?.planEndDate),
    remark: '',
  });
};

const openCreateBatch = () => {
  editingBatchId.value = null;
  resetBatchForm();
  batchFormDialogVisible.value = true;
};

const openEditBatch = (row: ProductionBatchItem) => {
  editingBatchId.value = row.id;
  Object.assign(batchForm, {
    batchNo: row.batchNo,
    routeId: row.routeId ?? '',
    plannedQuantity: Number(row.plannedQuantity),
    ownerId: row.ownerId ?? '',
    planStartDate: toDateInputValue(row.planStartDate),
    planEndDate: toDateInputValue(row.planEndDate),
    remark: row.remark ?? '',
  });
  batchFormDialogVisible.value = true;
};

const submitBatch = async () => {
  if (!taskOrder.value || batchForm.plannedQuantity <= 0) {
    EMessage.warning('请填写生产批次数量');
    return;
  }
  if (batchQuantityMax.value !== null && batchForm.plannedQuantity > batchQuantityMax.value) {
    EMessage.warning('生产批次数量不能超过工单剩余可分配数量');
    return;
  }
  if (
    batchForm.planStartDate &&
    batchForm.planEndDate &&
    batchForm.planEndDate < batchForm.planStartDate
  ) {
    EMessage.warning('计划完成日期不能早于计划开始日期');
    return;
  }
  submitting.value = true;
  try {
    if (editingBatchId.value) {
      const batch = taskBatches.value.find((b) => b.id === editingBatchId.value);
      await productionApi.updateBatch(editingBatchId.value, {
        ownerId: batchForm.ownerId || null,
        planStartDate: toDateInputValue(batchForm.planStartDate) || null,
        planEndDate: toDateInputValue(batchForm.planEndDate) || null,
        remark: batchForm.remark || null,
        version: batch?.version ?? 0,
      });
      EMessage.success('生产批次已更新');
    } else {
      await productionApi.createOrderBatch(taskOrder.value.id, {
        batchNo: batchForm.batchNo || '',
        routeId: batchForm.routeId || null,
        plannedQuantity: batchForm.plannedQuantity,
        ownerId: batchForm.ownerId || null,
        planStartDate: toDateInputValue(batchForm.planStartDate) || null,
        planEndDate: toDateInputValue(batchForm.planEndDate) || null,
        remark: batchForm.remark || null,
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

/* ====== 工具函数 ====== */
const getOrderStatusMeta = (status: WorkOrderStatus) =>
  orderStatusOptions.find((item) => item.value === status) ?? orderStatusOptions[0];
const getBatchStatusMeta = (status: ProductionBatchStatus) =>
  batchStatusOptions.find((item) => item.value === status) ?? batchStatusOptions[0];
const formatProduct = (product: ProductOption) => `${product.itemCode} / ${product.productName}`;
const formatQuantity = (value: string | number | null | undefined) => {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount)
    ? amount.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 4 })
    : '-';
};

onMounted(loadPageData);
onActivated(loadOptions);
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
.table-toolbar,
.task-toolbar {
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
.orders-table :deep(.el-table__header th),
.detail-table :deep(.el-table__header th) {
  height: 48px;
  background: #f9fafb;
  color: #1f2937;
  font-weight: 600;
}
.orders-table :deep(.el-table__row),
.detail-table :deep(.el-table__row) {
  height: 48px;
}
.orders-table :deep(.el-table__row:hover),
.detail-table :deep(.el-table__row:hover) {
  background: #f3f4f6;
}
.orders-table :deep(.el-table__cell),
.detail-table :deep(.el-table__cell) {
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
.dialog-form {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 20px;
}
.dialog-form :deep(.el-input),
.dialog-form :deep(.el-select),
.dialog-form :deep(.el-date-editor),
.dialog-form :deep(.el-input-number),
.dialog-form :deep(.el-textarea) {
  width: 100%;
}
.dialog-form :deep(.el-input__wrapper),
.dialog-form :deep(.el-select__wrapper) {
  border-radius: 6px;
  box-shadow: 0 0 0 1px #e5e7eb inset;
}
.dialog-form :deep(.el-button) {
  border-radius: 6px;
}
.dialog-section-title {
  margin: 20px 0 12px;
  color: #1f2937;
  font-size: 16px;
  font-weight: 600;
}
.empty-hint {
  padding: 24px;
  text-align: center;
  color: #9ca3af;
  font-size: 14px;
}
@media (max-width: 1120px) {
  .query-form,
  .form-grid {
    grid-template-columns: repeat(2, minmax(240px, 1fr));
  }
  .query-actions {
    margin-left: 0;
  }
}
</style>
