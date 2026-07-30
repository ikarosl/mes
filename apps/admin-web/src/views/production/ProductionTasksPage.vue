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
              v-for="item in taskStatusOptions"
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
              :type="getTaskStatusMeta(row.status).type"
              effect="light"
            >
              {{ getTaskStatusMeta(row.status).label }}
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
              :disabled="row.status !== 'material_pending' && row.status !== 'pending'"
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
    <el-dialog
      v-model="taskDialogVisible"
      :title="editingTaskId ? '编辑任务' : '新增任务'"
      :width="DialogWidth.lg"
      @open="refreshWorkOrders"
    >
      <el-form
        class="dialog-form"
        label-width="108px"
        :model="taskForm"
        :disabled="submitting"
      >
        <template v-if="!editingTaskId">
          <el-form-item
            label="选择工单"
            required
          >
            <el-select
              v-model="taskForm.workOrderId"
              filterable
              :loading="workOrderLoading"
              placeholder="请选择工单"
              @change="handleTaskOrderChange"
              @visible-change="(v: boolean) => v && refreshWorkOrders()"
            >
              <el-option
                v-for="choice in workOrderChoices"
                :key="choice.value"
                :label="
                  choice.option ? formatWorkOrderOption(choice.option) : `${choice.value}（已失效）`
                "
                :value="choice.value"
                :disabled="choice.isUnavailable"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="批次号">
            <el-input
              v-model="taskForm.batchNo"
              placeholder="留空自动生成"
            />
          </el-form-item>
          <el-form-item
            v-if="selectedWorkOrder"
            label="产品"
          >
            <el-input
              :model-value="selectedWorkOrder.productCode + ' / ' + selectedWorkOrder.productName"
              disabled
            />
          </el-form-item>
        </template>
        <el-form-item label="工艺路线">
          <el-select
            v-model="taskForm.routeId"
            filterable
            clearable
            placeholder="请选择工艺路线"
            @change="loadCreateStepPreview"
          >
            <el-option
              v-for="route in availableRouteOptions"
              :key="route.id"
              :label="formatRoute(route)"
              :value="route.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="负责人">
          <el-select
            v-model="taskForm.ownerId"
            filterable
            clearable
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
          label="计划数量"
          required
        >
          <el-input-number
            v-model="taskForm.plannedQuantity"
            :min="0.0001"
            :max="taskQuantityMax ?? undefined"
            :precision="4"
            :step="1"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="taskForm.remark"
            type="textarea"
            :rows="3"
          />
        </el-form-item>
      </el-form>
      <el-tabs
        v-if="!editingTaskId && taskForm.routeId"
        class="detail-tabs"
      >
        <el-tab-pane label="工序执行">
          <el-table
            :data="createStepPreview"
            class="detail-table"
          >
            <el-table-column
              prop="stepOrder"
              label="顺序"
              width="70"
            />
            <el-table-column
              prop="stepName"
              label="工序"
              min-width="150"
            />
            <el-table-column
              label="默认参考文件"
              min-width="180"
            >
              <template #default="{ row }">{{ row.sopFileName || '未配置' }}</template>
            </el-table-column>
            <el-table-column
              label="实际参考文件"
              min-width="220"
            >
              <template #default="{ row }">
                <el-select
                  v-model="row.actualSopFileId"
                  clearable
                  filterable
                  placeholder="留空则使用默认文件"
                >
                  <el-option
                    v-for="file in sopFileOptions"
                    :key="file.id"
                    :label="file.fileName"
                    :value="file.id"
                  />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column
              label="默认负责人"
              min-width="130"
            >
              <template #default="{ row }">{{ row.defaultOwnerName || '未配置' }}</template>
            </el-table-column>
            <el-table-column
              label="实际负责人"
              min-width="180"
            >
              <template #default="{ row }">
                <el-select
                  v-model="row.responsibleUserId"
                  clearable
                  filterable
                  placeholder="留空则使用默认负责人"
                >
                  <el-option
                    v-for="user in userOptions"
                    :key="user.id"
                    :label="user.displayName"
                    :value="user.id"
                  />
                </el-select>
              </template>
            </el-table-column>
          </el-table>
          <div
            v-if="!createStepPreview.length"
            class="empty-hint"
          >
            该路线没有可执行工序
          </div>
        </el-tab-pane>
      </el-tabs>
      <template #footer>
        <el-button @click="taskDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          @click="submitTask"
          >保存任务</el-button
        >
      </template>
    </el-dialog>

    <!-- 任务详情弹窗 -->
    <el-dialog
      v-model="detailDialogVisible"
      title="任务详情"
      :width="DialogWidth.xl"
    >
      <template v-if="activeBatch">
        <el-descriptions
          :column="3"
          border
        >
          <el-descriptions-item label="批次号">{{ activeBatch.batchNo }}</el-descriptions-item>
          <el-descriptions-item label="工单号">{{
            activeBatch.workOrderNo || '-'
          }}</el-descriptions-item>
          <el-descriptions-item label="产品">{{ activeBatch.productName }}</el-descriptions-item>
          <el-descriptions-item label="工艺路线">{{
            activeBatch.routeCode || '-'
          }}</el-descriptions-item>
          <el-descriptions-item label="计划数量">{{
            formatQuantity(activeBatch.plannedQuantity)
          }}</el-descriptions-item>
          <el-descriptions-item label="完成/合格"
            >{{ formatQuantity(activeBatch.completedQuantity) }} /
            {{ formatQuantity(activeBatch.qualifiedQuantity) }}</el-descriptions-item
          >
          <el-descriptions-item label="任务状态">{{
            getTaskStatusMeta(activeBatch.status).label
          }}</el-descriptions-item>
          <el-descriptions-item label="负责人">{{
            activeBatch.ownerName || '-'
          }}</el-descriptions-item>
          <el-descriptions-item label="版本号">{{ activeBatch.version }}</el-descriptions-item>
        </el-descriptions>

        <el-tabs class="detail-tabs">
          <el-tab-pane label="工序执行">
            <el-table
              v-if="activeBatch.stepRecords?.length"
              :data="activeBatch.stepRecords"
              class="detail-table"
            >
              <el-table-column
                prop="stepOrder"
                label="序号"
                width="70"
              />
              <el-table-column
                prop="stepName"
                label="工序"
                min-width="160"
              />
              <el-table-column
                label="工序编码"
                min-width="120"
              >
                <template #default="{ row }">{{ row.stepCode }}</template>
              </el-table-column>
              <el-table-column
                label="默认负责人"
                width="120"
              >
                <template #default="{ row }">{{ row.defaultResponsibleUserName || '-' }}</template>
              </el-table-column>
              <el-table-column
                label="实际负责人"
                width="130"
              >
                <template #default="{ row }">{{
                  row.responsibleUserName || row.defaultResponsibleUserName || '-'
                }}</template>
              </el-table-column>
              <el-table-column
                label="生效参考文件"
                min-width="180"
              >
                <template #default="{ row }">{{
                  row.actualSopFileName || row.defaultSopFileName || '未配置'
                }}</template>
              </el-table-column>
              <el-table-column
                label="需报工"
                width="80"
              >
                <template #default="{ row }">{{ row.needRecord ? '是' : '否' }}</template>
              </el-table-column>
              <el-table-column
                label="需检验"
                width="80"
              >
                <template #default="{ row }">{{ row.needInspection ? '是' : '否' }}</template>
              </el-table-column>
              <el-table-column
                label="状态"
                width="110"
              >
                <template #default="{ row }">{{
                  stepStatusLabels[row.status] ?? row.status
                }}</template>
              </el-table-column>
              <el-table-column
                label="产出/合格/异常"
                width="170"
              >
                <template #default="{ row }">
                  {{ formatQuantity(row.outputQuantity) }} /
                  {{ formatQuantity(row.qualifiedQuantity) }} /
                  {{ formatQuantity(row.abnormalQuantity) }}
                </template>
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
                    :disabled="row.status !== 'pending' && row.status !== 'assigned'"
                    @click="openStepExecutionOverride(row)"
                    >调整</el-button
                  >
                </template>
              </el-table-column>
            </el-table>
            <div
              v-else
              class="empty-hint"
            >
              暂无工序记录
            </div>
            <!-- TODO(api-integration): 工序报工、开工、完工仍待后端 batch_step_records 报工接口。 -->
          </el-tab-pane>
          <el-tab-pane label="物料需求">
            <!-- TODO(api-integration): 物料需求列表需要后端 production_item_demand 查询接口 -->
            <div class="empty-hint">物料需求可通过「生成物料」按钮生成</div>
          </el-tab-pane>
        </el-tabs>
      </template>
    </el-dialog>

    <el-dialog
      v-model="stepExecutionDialogVisible"
      title="调整工序执行参数"
      :width="DialogWidth.md"
    >
      <el-form
        v-if="editingStepRecord"
        label-width="110px"
        :disabled="submitting"
      >
        <el-form-item label="工序"
          ><span>{{ editingStepRecord.stepName }}</span></el-form-item
        >
        <el-form-item label="默认参考文件"
          ><span>{{ editingStepRecord.defaultSopFileName || '未配置' }}</span></el-form-item
        >
        <el-form-item label="实际参考文件">
          <el-select
            v-model="stepExecutionForm.actualSopFileId"
            clearable
            filterable
            placeholder="留空则使用默认文件"
          >
            <el-option
              v-for="file in sopFileOptions"
              :key="file.id"
              :label="file.fileName"
              :value="file.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="默认负责人"
          ><span>{{ editingStepRecord.defaultResponsibleUserName || '未配置' }}</span></el-form-item
        >
        <el-form-item label="实际负责人">
          <el-select
            v-model="stepExecutionForm.responsibleUserId"
            clearable
            filterable
            placeholder="留空则使用默认负责人"
          >
            <el-option
              v-for="user in userOptions"
              :key="user.id"
              :label="user.displayName"
              :value="user.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="stepExecutionDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          @click="submitStepExecutionOverride"
          >保存</el-button
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
  BatchStepStatus,
  BatchStepRecordItem,
  ProcessRouteStepItem,
  ProductOption,
  ProductionBatchDetail,
  ProductionBatchItem,
  ProductionBatchStatus,
  WorkOrderItem,
  TechnicalFileListItem,
} from '@company/contracts';
import { DialogWidth } from '../../utils/dialog';
import { EMessage } from '../../utils/message';
import { buildLiveOptions, hasUnavailableSelection } from '../../utils/live-options';
import { productionApi } from '../../api/production';
import { productApi } from '../../api/product';
import { resolveDefaultRouteId } from './production-route-options';

defineOptions({ name: 'ProductionTasksPage' });

/* ====== 类型定义 ====== */
interface SystemUserOption {
  id: string;
  displayName: string;
}

/** 工艺路线选项（来自 productFormOptions） */
interface RouteOption {
  id: string;
  routeName: string;
  versionNo: string;
  productId: string;
}
interface CreateStepPreview extends ProcessRouteStepItem {
  actualSopFileId: string | null;
  responsibleUserId: string | null;
}

/* ====== 状态选项 ====== */
const taskStatusOptions: Array<{
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

const stepStatusOptions: Array<{ value: BatchStepStatus; label: string }> = [
  { value: 'pending', label: '待开始' },
  { value: 'assigned', label: '已派工' },
  { value: 'doing', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'abnormal', label: '异常' },
];
const stepStatusLabels = Object.fromEntries(
  stepStatusOptions.map((item) => [item.value, item.label]),
);

/* ====== 响应式数据 ====== */
const batches = ref<ProductionBatchItem[]>([]);
const productOptions = ref<ProductOption[]>([]);
const routeOptions = ref<RouteOption[]>([]);
const userOptions = ref<SystemUserOption[]>([]);
const workOrderOptions = ref<WorkOrderItem[]>([]);
const activeBatch = ref<ProductionBatchDetail | null>(null);
const createStepPreview = ref<CreateStepPreview[]>([]);
const sopFileOptions = ref<TechnicalFileListItem[]>([]);
const editingStepRecord = ref<BatchStepRecordItem | null>(null);
const stepExecutionDialogVisible = ref(false);
const stepExecutionForm = reactive({
  actualSopFileId: null as string | null,
  responsibleUserId: null as string | null,
});
const editingTaskId = ref<string | null>(null);
const editingTaskOriginalQuantity = ref(0);
const loading = ref(false);
const workOrderLoading = ref(false);
const submitting = ref(false);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(10);
const taskDialogVisible = ref(false);
const detailDialogVisible = ref(false);

const query = reactive({ keyword: '', ownerId: '', status: '' });
const taskForm = reactive({
  workOrderId: '',
  batchNo: '',
  routeId: '',
  ownerId: '',
  plannedQuantity: 1,
  remark: '',
});

/* ====== 计算属性 ====== */
/** 候选工单：标记失效已选值 */
const workOrderChoices = computed(() =>
  buildLiveOptions(
    workOrderOptions.value.filter(
      (o) => getWorkOrderRemaining(o) > 0 || o.id === taskForm.workOrderId,
    ),
    taskForm.workOrderId ? [taskForm.workOrderId] : [],
    (o) => o.id,
  ),
);
const selectedWorkOrder = computed(
  () => workOrderOptions.value.find((o) => o.id === taskForm.workOrderId) ?? null,
);
const availableRouteOptions = computed(() => {
  if (!selectedWorkOrder.value) return routeOptions.value;
  return routeOptions.value.filter((r) => r.productId === selectedWorkOrder.value?.productId);
});
const selectedWorkOrderRemaining = computed(() => {
  if (!selectedWorkOrder.value) return null;
  return getWorkOrderRemaining(selectedWorkOrder.value);
});
const taskQuantityMax = computed(() => {
  if (selectedWorkOrderRemaining.value === null) return null;
  return editingTaskId.value
    ? selectedWorkOrderRemaining.value + editingTaskOriginalQuantity.value
    : selectedWorkOrderRemaining.value;
});

/* ====== 数据加载 ====== */
const loadOptions = async () => {
  try {
    const [formOptions, userOpts, sopFiles] = await Promise.all([
      productApi.productFormOptions(),
      productApi.userOptions(),
      productApi
        .technicalFiles({ page: 1, pageSize: 100, status: 1 })
        .catch(() => ({ items: [], total: 0, page: 1, pageSize: 100 })),
    ]);
    productOptions.value = formOptions.products.filter((p) => p.itemKind === 'finished_product');
    routeOptions.value = formOptions.routes.map((r) => ({
      id: r.id,
      routeName: r.routeName,
      versionNo: r.versionNo,
      productId: r.productId,
    }));
    userOptions.value = userOpts;
    sopFileOptions.value = sopFiles.items;
  } catch {
    productOptions.value = [];
    routeOptions.value = [];
    userOptions.value = [];
    sopFileOptions.value = [];
  }
};

const loadTasks = async () => {
  loading.value = true;
  try {
    const page = await productionApi.listBatches({
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: query.keyword || undefined,
      ownerId: query.ownerId || undefined,
      status: (query.status || undefined) as ProductionBatchStatus | undefined,
    });
    batches.value = page.items;
    total.value = page.total;
  } catch (error) {
    EMessage.error(error, '生产批次查询失败');
  } finally {
    loading.value = false;
  }
};

const loadPageData = async () => {
  loading.value = true;
  try {
    await Promise.all([loadOptions(), loadTasks(), refreshWorkOrders()]);
  } finally {
    loading.value = false;
  }
};

const searchTasks = async () => {
  currentPage.value = 1;
  await loadTasks();
};
const resetQuery = async () => {
  Object.assign(query, { keyword: '', ownerId: '', status: '' });
  currentPage.value = 1;
  await loadTasks();
};
const handlePageSizeChange = async () => {
  currentPage.value = 1;
  await loadTasks();
};

/* ====== 工单实时选项 ====== */
let workOrderRequestToken = 0;
const searchWorkOrders = async (keyword: string) => {
  workOrderLoading.value = true;
  const token = ++workOrderRequestToken;
  try {
    const kw = keyword.trim();
    const released = await productionApi.listOrders({
      page: 1,
      pageSize: 50,
      status: 'released',
      keyword: kw || undefined,
    });
    if (token !== workOrderRequestToken) return;
    const map = new Map<string, WorkOrderItem>();
    if (selectedWorkOrder.value) map.set(selectedWorkOrder.value.id, selectedWorkOrder.value);
    for (const order of released.items) {
      if (getWorkOrderRemaining(order) > 0 || order.id === selectedWorkOrder.value?.id) {
        map.set(order.id, order);
      }
    }
    workOrderOptions.value = [...map.values()];
  } catch {
    /* best-effort */
  } finally {
    if (token === workOrderRequestToken) workOrderLoading.value = false;
  }
};

/** 无参包装：供 @open / @visible-change / onActivated 调用 */
const refreshWorkOrders = () => {
  void searchWorkOrders('');
};

/* ====== 任务 CRUD ====== */
const resetTaskForm = () => {
  Object.assign(taskForm, {
    workOrderId: '',
    batchNo: '',
    routeId: '',
    ownerId: '',
    plannedQuantity: 1,
    remark: '',
  });
  createStepPreview.value = [];
};

const openCreate = () => {
  editingTaskId.value = null;
  editingTaskOriginalQuantity.value = 0;
  resetTaskForm();
  void searchWorkOrders('');
  taskDialogVisible.value = true;
};

const openEdit = (row: ProductionBatchItem) => {
  void openEditTask(row);
};

const openEditTask = async (row: ProductionBatchItem) => {
  editingTaskId.value = row.id;
  editingTaskOriginalQuantity.value = Number(row.plannedQuantity);
  Object.assign(taskForm, {
    workOrderId: row.workOrderId,
    batchNo: row.batchNo,
    routeId: row.routeId ?? '',
    ownerId: row.ownerId ?? '',
    plannedQuantity: Number(row.plannedQuantity),
    remark: row.remark ?? '',
  });
  taskDialogVisible.value = true;
};

const handleTaskOrderChange = async (workOrderId: string) => {
  const order = workOrderOptions.value.find((o) => o.id === workOrderId);
  if (!order) {
    taskForm.routeId = '';
    return;
  }
  taskForm.routeId = resolveDefaultRouteId(
    order.productId,
    productOptions.value,
    routeOptions.value,
  );
  taskForm.ownerId = '';
  taskForm.plannedQuantity = getWorkOrderRemaining(order);
  if (taskForm.plannedQuantity <= 0) {
    EMessage.warning('该工单已无可分配数量');
  }
  await loadCreateStepPreview();
};

const loadCreateStepPreview = async () => {
  if (!taskForm.routeId || editingTaskId.value) {
    createStepPreview.value = [];
    return;
  }
  try {
    const steps = await productApi.routeSteps(taskForm.routeId);
    createStepPreview.value = steps.map((step) => ({
      ...step,
      actualSopFileId: null,
      responsibleUserId: null,
    }));
  } catch (error) {
    createStepPreview.value = [];
    EMessage.error(error, '工序执行预览加载失败');
  }
};

const submitTask = async () => {
  if ((!editingTaskId.value && !taskForm.workOrderId) || taskForm.plannedQuantity <= 0) {
    EMessage.warning('请选择所属工单并填写计划数量');
    return;
  }
  if (taskQuantityMax.value !== null && taskForm.plannedQuantity > taskQuantityMax.value) {
    EMessage.warning('计划数量不能超过工单剩余数量');
    return;
  }
  if (
    hasUnavailableSelection(
      workOrderOptions.value,
      taskForm.workOrderId ? [taskForm.workOrderId] : [],
      (o) => o.id,
    )
  ) {
    EMessage.warning('所选工单已失效，请重新选择');
    return;
  }
  submitting.value = true;
  try {
    const editId = editingTaskId.value;
    if (editId) {
      const batch = batches.value.find((b) => b.id === editId);
      await productionApi.updateBatch(editId, {
        ownerId: taskForm.ownerId || null,
        remark: taskForm.remark || null,
        version: batch?.version ?? 0,
      });
      EMessage.success('任务已更新');
    } else {
      await productionApi.createOrderBatch(taskForm.workOrderId, {
        batchNo: taskForm.batchNo || '',
        routeId: taskForm.routeId || null,
        plannedQuantity: taskForm.plannedQuantity,
        ownerId: taskForm.ownerId || null,
        remark: taskForm.remark || null,
        stepOverrides: createStepPreview.value
          .filter((step) => step.actualSopFileId || step.responsibleUserId)
          .map((step) => ({
            routeStepId: step.id,
            actualSopFileId: step.actualSopFileId,
            responsibleUserId: step.responsibleUserId,
          })),
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
const openDetail = async (row: ProductionBatchItem) => {
  try {
    activeBatch.value = await productionApi.getBatch(row.id);
    detailDialogVisible.value = true;
  } catch (error) {
    EMessage.error(error, '任务详情查询失败');
  }
};

const openStepExecutionOverride = (row: BatchStepRecordItem) => {
  editingStepRecord.value = row;
  stepExecutionForm.actualSopFileId = row.actualSopFileId;
  stepExecutionForm.responsibleUserId = row.responsibleUserId;
  stepExecutionDialogVisible.value = true;
};

const submitStepExecutionOverride = async () => {
  if (!activeBatch.value || !editingStepRecord.value) return;
  submitting.value = true;
  try {
    activeBatch.value = await productionApi.updateBatchStepExecution(
      activeBatch.value.id,
      editingStepRecord.value.id,
      {
        version: editingStepRecord.value.version,
        actualSopFileId: stepExecutionForm.actualSopFileId,
        responsibleUserId: stepExecutionForm.responsibleUserId,
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
const generateMaterials = async (row: ProductionBatchItem) => {
  try {
    await productionApi.generateMaterialDemands(row.id, row.version);
    EMessage.success('物料需求已生成');
    await loadTasks();
  } catch (error) {
    EMessage.error(error, '物料需求生成失败');
  }
};

/* ====== 工具函数 ====== */
const canEditBatch = (row: ProductionBatchItem) => row.status === 'pending';
const getWorkOrderRemaining = (order: WorkOrderItem) =>
  Math.max(Number(order.plannedQuantity) - Number(order.assignedQuantity), 0);
const getTaskStatusMeta = (status: ProductionBatchStatus) =>
  taskStatusOptions.find((item) => item.value === status) ?? taskStatusOptions[0];
const formatRoute = (route: RouteOption) =>
  `${route.routeName}${route.versionNo ? ` / ${route.versionNo}` : ''}`;
const formatWorkOrderOption = (order: WorkOrderItem) =>
  `${order.workOrderNo} / ${order.productCode} / 剩余 ${formatQuantity(getWorkOrderRemaining(order))}`;
const formatQuantity = (value: string | number | null | undefined) => {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount)
    ? amount.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 4 })
    : '-';
};

onMounted(loadPageData);
onActivated(() => {
  loadOptions();
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
.tasks-table,
.detail-table {
  width: 100%;
  color: #1f2937;
  font-size: 14px;
}
.tasks-table :deep(.el-table__header th),
.detail-table :deep(.el-table__header th) {
  height: 48px;
  background: #f9fafb;
  color: #1f2937;
  font-weight: 600;
}
.tasks-table :deep(.el-table__row),
.detail-table :deep(.el-table__row) {
  height: 48px;
}
.tasks-table :deep(.el-table__row:hover),
.detail-table :deep(.el-table__row:hover) {
  background: #f3f4f6;
}
.tasks-table :deep(.el-table__cell),
.detail-table :deep(.el-table__cell) {
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
.dialog-form :deep(.el-input),
.dialog-form :deep(.el-select),
.dialog-form :deep(.el-input-number),
.dialog-form :deep(.el-textarea) {
  width: 100%;
}
.dialog-form :deep(.el-input__wrapper),
.dialog-form :deep(.el-select__wrapper) {
  border-radius: 6px;
  box-shadow: 0 0 0 1px #e5e7eb inset;
}
.detail-tabs {
  margin-top: 18px;
}
.empty-hint {
  padding: 24px;
  text-align: center;
  color: #9ca3af;
  font-size: 14px;
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
