<template>
  <div class="orders-page">
    <div class="page-title">
      <div>
        <h2>工单管理</h2>
        <p>管理生产工单与批次</p>
      </div>
      <el-button
        type="primary"
        :icon="Plus"
        @click="openCreate"
        >新增工单</el-button
      >
    </div>

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
            placeholder="工单号/产品"
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
      <div class="table-toolbar">
        <el-button
          type="primary"
          :icon="Plus"
          @click="openCreate"
          >新增工单</el-button
        >
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
      </div>

      <el-table
        v-loading="loading"
        :data="orders"
        class="orders-table"
      >
        <el-table-column
          label="工单号"
          min-width="160"
        >
          <template #default="{ row }">
            <span class="order-no">{{ row.orderNo }}</span>
          </template>
        </el-table-column>
        <el-table-column
          label="产品"
          min-width="220"
        >
          <template #default="{ row }">
            <div class="product-name">{{ row.productName }}</div>
            <div class="sub-text">{{ row.productModel }}</div>
          </template>
        </el-table-column>
        <el-table-column
          label="数量"
          width="150"
          align="right"
        >
          <template #default="{ row }">
            {{ formatQuantity(row.assignedQuantity) }} / {{ formatQuantity(row.plannedQuantity) }}
          </template>
        </el-table-column>
        <el-table-column
          label="负责人"
          width="120"
        >
          <template #default="{ row }">{{ row.ownerName || '-' }}</template>
        </el-table-column>
        <el-table-column
          label="当前流程"
          min-width="180"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ row.currentFlow }}</template>
        </el-table-column>
        <el-table-column
          label="下一步"
          min-width="150"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ row.nextAction }}</template>
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
          label="计划完成"
          width="120"
        >
          <template #default="{ row }">{{ row.planEndDate || '-' }}</template>
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
              link
              type="primary"
              :disabled="!canEditOrder(row)"
              @click="openEdit(row)"
              >编辑</el-button
            >
            <el-button
              link
              type="primary"
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

    <el-dialog
      v-model="orderDialogVisible"
      :title="editingOrderId ? '编辑工单' : '新增工单'"
      :width="DialogWidth.lg"
    >
      <el-form
        class="dialog-form"
        label-width="108px"
        :model="orderForm"
      >
        <div class="form-grid">
          <el-form-item
            label="工单号"
            required
          >
            <el-input
              v-model="orderForm.orderNo"
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
            >
              <el-option
                v-for="product in productOptions"
                :key="product.id"
                :label="formatProduct(product)"
                :value="product.id"
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
          <el-form-item label="客户订单号">
            <el-input
              v-model="orderForm.customerOrderNo"
              placeholder="可选填写"
            />
          </el-form-item>
          <el-form-item label="客户名称">
            <el-input
              v-model="orderForm.customerName"
              placeholder="可选填写"
            />
          </el-form-item>
          <el-form-item label="负责人">
            <el-select
              v-model="orderForm.ownerId"
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
          <el-descriptions-item label="工单号">{{ activeOrder.orderNo }}</el-descriptions-item>
          <el-descriptions-item label="产品">{{ activeOrder.productName }}</el-descriptions-item>
          <el-descriptions-item label="型号">{{ activeOrder.productModel }}</el-descriptions-item>
          <el-descriptions-item label="工艺路线">{{
            activeOrder.routeName || '-'
          }}</el-descriptions-item>
          <el-descriptions-item label="计划数量">{{
            formatQuantity(activeOrder.plannedQuantity)
          }}</el-descriptions-item>
          <el-descriptions-item label="已分配">{{
            formatQuantity(activeOrder.assignedQuantity)
          }}</el-descriptions-item>
          <el-descriptions-item label="客户订单号">{{
            activeOrder.customerOrderNo || '-'
          }}</el-descriptions-item>
          <el-descriptions-item label="客户名称">{{
            activeOrder.customerName || '-'
          }}</el-descriptions-item>
          <el-descriptions-item label="负责人">{{
            activeOrder.ownerName || '-'
          }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{
            getOrderStatusMeta(activeOrder.status).label
          }}</el-descriptions-item>
          <el-descriptions-item label="计划完成">{{
            activeOrder.planEndDate || '-'
          }}</el-descriptions-item>
          <el-descriptions-item
            label="备注"
            :span="3"
            >{{ activeOrder.remark || '-' }}</el-descriptions-item
          >
        </el-descriptions>

        <div class="dialog-section-title">生产批次</div>
        <el-table
          :data="activeOrder.batches"
          class="detail-table"
        >
          <el-table-column
            prop="batchNo"
            label="生产批次号"
            min-width="160"
          />
          <el-table-column
            label="数量"
            width="120"
            align="right"
          >
            <template #default="{ row }">{{ formatQuantity(row.plannedQuantity) }}</template>
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
          <el-table-column
            label="计划完成"
            width="120"
          >
            <template #default="{ row }">{{ row.planEndDate || '-' }}</template>
          </el-table-column>
        </el-table>
      </template>
    </el-dialog>

    <el-dialog
      v-model="taskDialogVisible"
      title="生产批次"
      :width="DialogWidth.xl"
    >
      <template v-if="taskOrder">
        <div class="task-toolbar">
          <div>
            <span class="order-no">{{ taskOrder.orderNo }}</span>
            <span class="sub-text"
              >计划 {{ formatQuantity(taskOrder.plannedQuantity) }}，已分配
              {{ formatQuantity(taskOrder.assignedQuantity) }}</span
            >
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
            label="数量"
            width="120"
            align="right"
          >
            <template #default="{ row }">{{ formatQuantity(row.plannedQuantity) }}</template>
          </el-table-column>
          <el-table-column
            label="任务状态"
            width="120"
          >
            <template #default="{ row }">
              <el-tag
                :type="getBatchStatusMeta(row.status).type"
                effect="light"
                >{{ getBatchStatusMeta(row.status).label }}</el-tag
              >
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
            width="120"
          >
            <template #default="{ row }">{{ row.planEndDate || '-' }}</template>
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

    <el-dialog
      v-model="batchFormDialogVisible"
      :title="editingBatchId ? '编辑生产批次' : '新增生产批次'"
      :width="DialogWidth.md"
    >
      <el-form
        class="dialog-form"
        label-width="108px"
        :model="batchForm"
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
        <el-form-item label="工艺路线">
          <el-select
            v-model="batchForm.routeId"
            clearable
            filterable
            placeholder="默认沿用工单路线"
          >
            <el-option
              v-for="route in routeOptions"
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
        <el-form-item
          v-if="editingBatchId"
          label="任务状态"
        >
          <el-select v-model="batchForm.status">
            <el-option
              v-for="item in batchStatusOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
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
import { computed, reactive, ref } from 'vue';
import { ElMessageBox } from 'element-plus';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { DialogWidth } from '../../utils/dialog';
import { EMessage } from '../../utils/message';

defineOptions({ name: 'ProductionOrdersPage' });

/* ====== 类型定义 ====== */
type WorkOrderStatus = 'draft' | 'released' | 'doing' | 'completed' | 'closed' | 'cancelled';
type ProductionBatchStatus =
  'pending' | 'material_pending' | 'material_assigned' | 'doing' | 'completed' | 'cancelled';

interface WorkOrderListItem {
  id: string;
  orderNo: string;
  productId: string;
  productName: string;
  productModel: string;
  plannedQuantity: string;
  assignedQuantity: string;
  routeId: string | null;
  routeName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  customerOrderNo: string | null;
  customerName: string | null;
  status: WorkOrderStatus;
  currentFlow: string;
  nextAction: string;
  planStartDate: string | null;
  planEndDate: string | null;
  remark: string | null;
}

interface WorkOrderDetail extends WorkOrderListItem {
  batches: ProductionBatchItem[];
}

interface ProductionBatchItem {
  id: string;
  workOrderId: string;
  batchNo: string;
  productId: string;
  productName: string;
  productModel: string;
  routeId: string | null;
  routeName: string | null;
  plannedQuantity: string;
  ownerId: string | null;
  ownerName: string | null;
  status: ProductionBatchStatus;
  planStartDate: string | null;
  planEndDate: string | null;
  remark: string | null;
}

interface ProductListItem {
  id: string;
  productName: string;
  productModel: string;
  categoryId: string | null;
}

interface ProcessRouteListItem {
  id: string;
  routeName: string;
  version: string | null;
  productCategoryId: string | null;
}

interface SystemUserListItem {
  id: string;
  displayName: string;
  username: string;
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
  { value: 'doing', label: '执行中', type: 'primary' },
  { value: 'completed', label: '已完成', type: 'success' },
  { value: 'cancelled', label: '已取消', type: 'danger' },
];

/* ====== 静态演示数据 ====== */
const orders = ref<WorkOrderListItem[]>([
  {
    id: '1',
    orderNo: 'WO-2026-0001',
    productId: '1',
    productName: 'PCB主板-A100',
    productModel: 'A100-V2',
    plannedQuantity: '500',
    assignedQuantity: '250',
    routeId: 'r1',
    routeName: 'SMT贴片工艺',
    ownerId: 'u1',
    ownerName: '张工',
    customerOrderNo: 'CO-001',
    customerName: '客户A',
    status: 'doing',
    currentFlow: 'SMT贴片',
    nextAction: 'AOI检测',
    planStartDate: '2026-07-15',
    planEndDate: '2026-07-30',
    remark: '加急订单',
  },
  {
    id: '2',
    orderNo: 'WO-2026-0002',
    productId: '1',
    productName: 'PCB主板-A100',
    productModel: 'A100-V2',
    plannedQuantity: '1000',
    assignedQuantity: '1000',
    routeId: 'r1',
    routeName: 'SMT贴片工艺',
    ownerId: 'u2',
    ownerName: '李工',
    customerOrderNo: 'CO-002',
    customerName: '客户B',
    status: 'completed',
    currentFlow: '已完工',
    nextAction: '-',
    planStartDate: '2026-07-01',
    planEndDate: '2026-07-20',
    remark: null,
  },
  {
    id: '3',
    orderNo: 'WO-2026-0003',
    productId: '2',
    productName: '电源模块-B200',
    productModel: 'B200-V1',
    plannedQuantity: '200',
    assignedQuantity: '0',
    routeId: 'r2',
    routeName: '电源组装工艺',
    ownerId: null,
    ownerName: null,
    customerOrderNo: null,
    customerName: null,
    status: 'draft',
    currentFlow: '未开始',
    nextAction: '下达工单',
    planStartDate: '2026-07-25',
    planEndDate: '2026-08-10',
    remark: null,
  },
  {
    id: '4',
    orderNo: 'WO-2026-0004',
    productId: '3',
    productName: '机箱外壳-C500',
    productModel: 'C500-V3',
    plannedQuantity: '50',
    assignedQuantity: '50',
    routeId: 'r3',
    routeName: '钣金加工工艺',
    ownerId: 'u1',
    ownerName: '张工',
    customerOrderNo: 'CO-003',
    customerName: '客户C',
    status: 'released',
    currentFlow: '待生产',
    nextAction: '创建生产批次',
    planStartDate: '2026-07-18',
    planEndDate: '2026-07-28',
    remark: null,
  },
  {
    id: '5',
    orderNo: 'WO-2026-0005',
    productId: '1',
    productName: 'PCB主板-A100',
    productModel: 'A100-V2',
    plannedQuantity: '300',
    assignedQuantity: '0',
    routeId: 'r1',
    routeName: 'SMT贴片工艺',
    ownerId: 'u2',
    ownerName: '李工',
    customerOrderNo: null,
    customerName: null,
    status: 'draft',
    currentFlow: '未开始',
    nextAction: '下达工单',
    planStartDate: null,
    planEndDate: '2026-08-05',
    remark: null,
  },
]);

const productOptions = ref<ProductListItem[]>([
  { id: '1', productName: 'PCB主板-A100', productModel: 'A100-V2', categoryId: 'cat1' },
  { id: '2', productName: '电源模块-B200', productModel: 'B200-V1', categoryId: 'cat2' },
  { id: '3', productName: '机箱外壳-C500', productModel: 'C500-V3', categoryId: 'cat3' },
]);

const routeOptions = ref<ProcessRouteListItem[]>([
  { id: 'r1', routeName: 'SMT贴片工艺', version: 'V2', productCategoryId: 'cat1' },
  { id: 'r2', routeName: '电源组装工艺', version: 'V1', productCategoryId: 'cat2' },
  { id: 'r3', routeName: '钣金加工工艺', version: 'V3', productCategoryId: 'cat3' },
]);

const userOptions = ref<SystemUserListItem[]>([
  { id: 'u1', displayName: '张工', username: 'zhang' },
  { id: 'u2', displayName: '李工', username: 'li' },
  { id: 'u3', displayName: '王工', username: 'wang' },
]);

const activeOrder = ref<WorkOrderDetail | null>(null);
const taskOrder = ref<WorkOrderListItem | null>(null);
const taskBatches = ref<ProductionBatchItem[]>([]);
const loading = ref(false);
const submitting = ref(false);
const total = ref(5);
const currentPage = ref(1);
const pageSize = ref(10);
const orderDialogVisible = ref(false);
const detailDialogVisible = ref(false);
const taskDialogVisible = ref(false);
const batchFormDialogVisible = ref(false);
const editingOrderId = ref<string | null>(null);
const editingBatchId = ref<string | null>(null);

const query = reactive({ keyword: '', productId: '', ownerId: '', status: '' });
const orderForm = reactive({
  orderNo: '',
  productId: '',
  plannedQuantity: 1,
  customerOrderNo: '',
  customerName: '',
  ownerId: '',
  planStartDate: '',
  planEndDate: '',
  remark: '',
});
const batchForm = reactive({
  batchNo: '',
  routeId: '',
  plannedQuantity: 1,
  ownerId: '',
  status: 'pending' as ProductionBatchStatus,
  planStartDate: '',
  planEndDate: '',
  remark: '',
});

const editingBatch = computed(
  () => taskBatches.value.find((item) => item.id === editingBatchId.value) ?? null,
);
const batchQuantityMax = computed(() => {
  if (!taskOrder.value) {
    return null;
  }
  const plannedQuantity = Number(taskOrder.value.plannedQuantity);
  const assignedQuantity = Number(taskOrder.value.assignedQuantity);
  const currentBatchQuantity = editingBatch.value ? Number(editingBatch.value.plannedQuantity) : 0;
  const maxQuantity = plannedQuantity - assignedQuantity + currentBatchQuantity;
  return Number.isFinite(maxQuantity) ? Math.max(maxQuantity, 0) : null;
});

const loadOrders = async () => {
  loading.value = true;
  try {
    // Demo data — simulated delay
    await new Promise((resolve) => setTimeout(resolve, 300));
    syncTaskOrderFromOrders();
  } finally {
    loading.value = false;
  }
};

const syncTaskOrderFromOrders = () => {
  if (!taskOrder.value) {
    return;
  }
  const latestOrder = orders.value.find((item) => item.id === taskOrder.value?.id);
  if (latestOrder) {
    taskOrder.value = latestOrder;
  }
};

const loadPageData = async () => {
  loading.value = true;
  try {
    await loadOrders();
  } finally {
    loading.value = false;
  }
};

const searchOrders = async () => {
  currentPage.value = 1;
  await loadOrders();
};

const resetQuery = async () => {
  Object.assign(query, { keyword: '', productId: '', ownerId: '', status: '' });
  currentPage.value = 1;
  await loadOrders();
};

const handlePageSizeChange = async () => {
  currentPage.value = 1;
  await loadOrders();
};

const resetOrderForm = () => {
  Object.assign(orderForm, {
    orderNo: '',
    productId: '',
    plannedQuantity: 1,
    customerOrderNo: '',
    customerName: '',
    ownerId: '',
    planStartDate: '',
    planEndDate: '',
    remark: '',
  });
};

const openCreate = () => {
  editingOrderId.value = null;
  resetOrderForm();
  orderDialogVisible.value = true;
};

const openEdit = (row: WorkOrderListItem) => {
  editingOrderId.value = row.id;
  Object.assign(orderForm, {
    orderNo: row.orderNo,
    productId: row.productId,
    plannedQuantity: Number(row.plannedQuantity),
    customerOrderNo: row.customerOrderNo ?? '',
    customerName: row.customerName ?? '',
    ownerId: row.ownerId ?? '',
    planStartDate: row.planStartDate ?? '',
    planEndDate: row.planEndDate ?? '',
    remark: row.remark ?? '',
  });
  orderDialogVisible.value = true;
};

const handleOrderProductChange = () => {};

const submitOrder = () => {
  if (!orderForm.orderNo.trim() || !orderForm.productId || orderForm.plannedQuantity <= 0) {
    EMessage.warning('请填写工单号、产品和计划数量');
    return;
  }
  EMessage.success(editingOrderId.value ? '工单已更新' : '工单已新增');
  orderDialogVisible.value = false;
  void loadOrders();
};

const openDetail = (row: WorkOrderListItem) => {
  const batches: ProductionBatchItem[] = [
    {
      id: 'b1',
      workOrderId: row.id,
      batchNo: 'BATCH-001',
      productId: row.productId,
      productName: row.productName,
      productModel: row.productModel,
      routeId: row.routeId,
      routeName: row.routeName,
      plannedQuantity: '250',
      ownerId: 'u1',
      ownerName: '张工',
      status: 'doing',
      planStartDate: row.planStartDate,
      planEndDate: row.planEndDate,
      remark: null,
    },
    {
      id: 'b2',
      workOrderId: row.id,
      batchNo: 'BATCH-002',
      productId: row.productId,
      productName: row.productName,
      productModel: row.productModel,
      routeId: row.routeId,
      routeName: row.routeName,
      plannedQuantity: '250',
      ownerId: 'u2',
      ownerName: '李工',
      status: 'pending',
      planStartDate: row.planStartDate,
      planEndDate: row.planEndDate,
      remark: null,
    },
  ];
  activeOrder.value = { ...row, batches };
  detailDialogVisible.value = true;
};

const openTasks = (row: WorkOrderListItem) => {
  taskOrder.value = row;
  taskBatches.value = [
    {
      id: 'b1',
      workOrderId: row.id,
      batchNo: 'BATCH-001',
      productId: row.productId,
      productName: row.productName,
      productModel: row.productModel,
      routeId: row.routeId,
      routeName: row.routeName,
      plannedQuantity: '250',
      ownerId: 'u1',
      ownerName: '张工',
      status: 'doing',
      planStartDate: row.planStartDate,
      planEndDate: row.planEndDate,
      remark: null,
    },
  ];
  taskDialogVisible.value = true;
};

const resetBatchForm = () => {
  const maxQuantity = batchQuantityMax.value ?? 1;
  Object.assign(batchForm, {
    batchNo: '',
    routeId: taskOrder.value?.routeId ?? '',
    plannedQuantity: Math.min(1, Math.max(maxQuantity, 0.0001)),
    ownerId: taskOrder.value?.ownerId ?? '',
    status: 'pending' as ProductionBatchStatus,
    planStartDate: taskOrder.value?.planStartDate ?? '',
    planEndDate: taskOrder.value?.planEndDate ?? '',
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
    status: row.status,
    planStartDate: row.planStartDate ?? '',
    planEndDate: row.planEndDate ?? '',
    remark: row.remark ?? '',
  });
  batchFormDialogVisible.value = true;
};

const submitBatch = () => {
  if (!taskOrder.value || batchForm.plannedQuantity <= 0) {
    EMessage.warning('请填写生产批次数量');
    return;
  }
  if (batchQuantityMax.value !== null && batchForm.plannedQuantity > batchQuantityMax.value) {
    EMessage.warning('生产批次数量不能超过工单剩余可分配数量');
    return;
  }
  EMessage.success(editingBatchId.value ? '生产批次已更新' : '生产批次已新增');
  batchFormDialogVisible.value = false;
  void loadOrders();
};

const releaseOrder = (row: WorkOrderListItem) => changeOrderStatus(row, 'released', '下达');
const closeOrder = (row: WorkOrderListItem) => changeOrderStatus(row, 'closed', '关闭');
const cancelOrder = (row: WorkOrderListItem) => changeOrderStatus(row, 'cancelled', '取消');

const changeOrderStatus = async (
  row: WorkOrderListItem,
  status: WorkOrderStatus,
  label: string,
) => {
  try {
    await ElMessageBox.confirm(`确认${label}该工单？`, `${label}工单`, {
      confirmButtonText: `确认${label}`,
      cancelButtonText: '取消',
      type: status === 'cancelled' ? 'warning' : 'info',
    });
  } catch {
    return;
  }
  EMessage.success(`工单已${label}`);
  void loadOrders();
};

const canEditOrder = (row: WorkOrderListItem) => ['draft', 'released'].includes(row.status);
const canCloseOrder = (row: WorkOrderListItem) => ['released', 'completed'].includes(row.status);
const canCancelOrder = (row: WorkOrderListItem) =>
  ['draft', 'released', 'doing'].includes(row.status);
const getOrderStatusMeta = (status: WorkOrderStatus) =>
  orderStatusOptions.find((item) => item.value === status) ?? orderStatusOptions[0];
const getBatchStatusMeta = (status: ProductionBatchStatus) =>
  batchStatusOptions.find((item) => item.value === status) ?? batchStatusOptions[0];
const formatProduct = (product: ProductListItem) =>
  `${product.productModel} / ${product.productName}`;

const formatQuantity = (value: string | number | null) => {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount)
    ? amount.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 4 })
    : '-';
};
</script>

<style scoped>
.orders-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0;
}
.page-title h2 {
  margin: 0;
  color: #283a50;
  font-size: 20px;
  font-weight: 600;
}
.page-title p {
  margin: 4px 0 0;
  color: #6b7280;
  font-size: 14px;
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

@media (max-width: 1120px) {
  .query-form,
  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(240px, 1fr));
  }

  .query-actions {
    margin-left: 0;
  }
}
</style>
