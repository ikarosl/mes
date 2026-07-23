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
            v-if="auth.can(PERMISSIONS.product.routes.create)"
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
              @click="loadData"
            />
          </el-tooltip>
        </template>
      </TableToolbar>

      <el-table
        v-loading="loading"
        :data="pagedRoutes"
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
              @click="toggleStatus(row)"
            >
              {{ row.status === 'enabled' ? '停用' : '启用' }}
            </el-button>
            <el-button
              v-if="row.status === 'draft' && auth.can(PERMISSIONS.product.routes.delete)"
              link
              type="danger"
              @click="deleteRoute(row)"
              >删除</el-button
            >
          </template>
        </el-table-column>
      </el-table>

      <PaginationFooter
        :total="filteredRoutes.length"
        :current-page="currentPage"
        :page-size="pageSize"
        @update:page-size="handlePageSizeChange"
        @page-change="currentPage = $event"
      />
    </div>

    <el-dialog
      v-model="routeDialogVisible"
      :title="editingRouteId ? '编辑工艺路线' : '新增工艺路线'"
      :width="DialogWidth.md"
    >
      <el-form
        class="dialog-form"
        label-width="112px"
        :model="routeForm"
      >
        <el-form-item
          label="路线编号"
          required
        >
          <el-input
            v-model="routeForm.routeCode"
            placeholder="例如：ROUTE-CIR-STD"
          />
        </el-form-item>
        <el-form-item
          label="路线名称"
          required
        >
          <el-input
            v-model="routeForm.routeName"
            placeholder="例如：环形器标准工艺路线"
          />
        </el-form-item>
        <el-form-item
          label="适用产品"
          required
        >
          <el-select
            v-model="routeForm.productId"
            filterable
            placeholder="请选择产品"
          >
            <el-option
              v-for="product in productOptions"
              :key="product.id"
              :label="`${product.itemCode} / ${product.productName}`"
              :value="product.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="版本">
          <el-input
            v-model="routeForm.versionNo"
            placeholder="例如：V1.0"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-tag type="info">新路线以草稿保存，配置工序后再启用</el-tag>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="routeForm.remark"
            type="textarea"
            :rows="3"
            placeholder="可填写路线说明"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="routeDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          @click="submitRoute"
          >保存路线</el-button
        >
      </template>
    </el-dialog>

    <el-dialog
      v-model="stepsDialogVisible"
      title="配置工序顺序"
      :width="DialogWidth.xl"
    >
      <div class="step-toolbar">
        <div class="toolbar-left">
          <el-button
            :icon="Refresh"
            @click="refreshSteps"
            >刷新工序</el-button
          >
        </div>
        <el-button
          v-if="auth.can(PERMISSIONS.product.routes.manageSteps)"
          type="primary"
          :icon="Plus"
          @click="addStep"
          >添加路线步骤</el-button
        >
      </div>
      <el-table
        :data="stepForm.steps"
        class="step-table"
      >
        <el-table-column
          label="顺序"
          width="100"
        >
          <template #default="{ row }">
            <el-input-number
              v-model="row.stepOrder"
              :min="1"
              :step="1"
              controls-position="right"
            />
          </template>
        </el-table-column>
        <el-table-column
          label="工序"
          min-width="250"
        >
          <template #default="{ row }">
            <el-select
              v-model="row.processStepId"
              filterable
              placeholder="请选择已有工序"
            >
              <el-option
                v-for="p in processOptions"
                :key="p.id"
                :label="`${p.stepCode} / ${p.stepName}`"
                :value="p.id"
              />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column
          label="技术文件"
          min-width="180"
        >
          <template #default="{ row }">{{ getProcessSop(row.processStepId) || '-' }}</template>
        </el-table-column>
        <el-table-column
          label="使用BOM明细"
          min-width="240"
        >
          <template #default="{ row }">
            <el-select
              v-model="row.productMaterialIds"
              multiple
              clearable
              collapse-tags
              placeholder="可选"
            >
              <el-option
                v-for="item in routeMaterialOptions"
                :key="item.id"
                :label="`${item.itemCode} / ${item.productName}`"
                :value="item.id"
              />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column
          label="需报工"
          width="90"
          align="center"
          ><template #default="{ row }"><el-switch v-model="row.needRecord" /></template
        ></el-table-column>
        <el-table-column
          label="需检验"
          width="90"
          align="center"
          ><template #default="{ row }"><el-switch v-model="row.needInspection" /></template
        ></el-table-column>
        <el-table-column
          label="默认负责人"
          min-width="150"
        >
          <template #default="{ row }">
            <el-select
              v-model="row.defaultOwnerId"
              clearable
              placeholder="请选择"
            >
              <el-option
                v-for="u in userOptions"
                :key="u.id"
                :label="u.displayName"
                :value="u.id"
              />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column
          label="备注"
          min-width="160"
        >
          <template #default="{ row }"
            ><el-input
              v-model="row.remark"
              placeholder="可填写路线内备注"
          /></template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="150"
          fixed="right"
        >
          <template #default="{ $index }">
            <el-button
              link
              type="primary"
              @click="moveStep($index, -1)"
              >上移</el-button
            >
            <el-button
              link
              type="primary"
              @click="moveStep($index, 1)"
              >下移</el-button
            >
            <el-button
              link
              type="danger"
              @click="removeStep($index)"
              >删除</el-button
            >
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="stepsDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          @click="submitSteps"
          >保存工序顺序</el-button
        >
      </template>
    </el-dialog>

    <el-dialog
      v-model="detailDialogVisible"
      title="工艺路线详情"
      :width="DialogWidth.lg"
    >
      <el-descriptions
        v-if="detailRow"
        :column="2"
        border
      >
        <el-descriptions-item label="路线编号">{{ detailRow.routeCode }}</el-descriptions-item>
        <el-descriptions-item label="路线名称">{{ detailRow.routeName }}</el-descriptions-item>
        <el-descriptions-item label="适用产品">{{
          detailRow.itemCode && detailRow.productName
            ? `${detailRow.itemCode} / ${detailRow.productName}`
            : '-'
        }}</el-descriptions-item>
        <el-descriptions-item label="版本">{{ detailRow.versionNo || '-' }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{
          routeStatusLabels[detailRow.status]
        }}</el-descriptions-item>
        <el-descriptions-item label="备注">{{ detailRow.remark || '-' }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { ElMessageBox } from 'element-plus';
import { PERMISSIONS } from '@company/constants';
import type {
  ProcessRouteListItem,
  ProcessRouteStatus,
  ProcessStepListItem,
  ProductMaterialItem,
  ProductOption,
  UserOption,
} from '@company/contracts';
import TableToolbar from '../../components/TableToolbar.vue';
import PaginationFooter from '../../components/PaginationFooter.vue';
import { DialogWidth } from '../../utils/dialog';
import { EMessage } from '../../utils/message';
import { productApi } from '../../api/product';
import { useAuthStore } from '../../stores/auth';

defineOptions({ name: 'ProcessRoutesPage' });

const auth = useAuthStore();
const routes = ref<ProcessRouteListItem[]>([]);
const productOptions = ref<ProductOption[]>([]);
const processOptions = ref<ProcessStepListItem[]>([]);
const userOptions = ref<UserOption[]>([]);
const routeMaterialOptions = ref<ProductMaterialItem[]>([]);
const routeStatusLabels: Record<ProcessRouteStatus, string> = {
  draft: '草稿',
  enabled: '启用',
  disabled: '停用',
  archived: '已归档',
};
const routeStatusTypes: Record<ProcessRouteStatus, 'info' | 'success' | 'warning'> = {
  draft: 'info',
  enabled: 'success',
  disabled: 'warning',
  archived: 'info',
};
const routeStatusLabel = (status: ProcessRouteStatus) => routeStatusLabels[status];
const routeStatusType = (status: ProcessRouteStatus) => routeStatusTypes[status];

const filteredRoutes = computed(() =>
  routes.value.filter((r) => {
    const kw = query.keyword.trim().toLowerCase();
    return (
      (!kw || r.routeCode.toLowerCase().includes(kw) || r.routeName.toLowerCase().includes(kw)) &&
      (!query.status || r.status === query.status)
    );
  }),
);
const pagedRoutes = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredRoutes.value.slice(start, start + pageSize.value);
});

const currentPage = ref(1);
const pageSize = ref(10);
const routeDialogVisible = ref(false);
const stepsDialogVisible = ref(false);
const detailDialogVisible = ref(false);
const loading = ref(false);
const submitting = ref(false);
const editingRouteId = ref<string | null>(null);
const detailRow = ref<ProcessRouteListItem | null>(null);
const query = reactive({ keyword: '', status: '' });
const routeForm = reactive({
  routeCode: '',
  routeName: '',
  productId: '',
  versionNo: 'V1.0',
  remark: '',
});

type StepRow = {
  processStepId: string;
  stepOrder: number;
  defaultOwnerId: string;
  sopFileId: string;
  needInspection: boolean;
  needRecord: boolean;
  status: number;
  remark: string;
  productMaterialIds: string[];
};
const stepForm = reactive<{ steps: StepRow[] }>({ steps: [] });

const handleSearch = () => {
  currentPage.value = 1;
};
const resetQuery = () => {
  Object.assign(query, { keyword: '', status: '' });
  currentPage.value = 1;
};
const handlePageSizeChange = (val: number) => {
  pageSize.value = val;
  currentPage.value = 1;
};

const openCreate = () => {
  editingRouteId.value = null;
  Object.assign(routeForm, {
    routeCode: '',
    routeName: '',
    productId: '',
    versionNo: 'V1.0',
    remark: '',
  });
  routeDialogVisible.value = true;
};
const openEdit = (row: ProcessRouteListItem) => {
  editingRouteId.value = row.id;
  Object.assign(routeForm, {
    routeCode: row.routeCode,
    routeName: row.routeName,
    productId: row.productId ?? '',
    versionNo: row.versionNo,
    remark: row.remark ?? '',
  });
  routeDialogVisible.value = true;
};
const openSteps = async (row: ProcessRouteListItem) => {
  editingRouteId.value = row.id;
  stepsDialogVisible.value = true;
  try {
    const [steps, materials] = await Promise.all([
      productApi.routeSteps(row.id),
      productApi.materials(row.productId),
    ]);
    stepForm.steps = steps.map((step) => ({
      processStepId: step.processStepId,
      stepOrder: step.stepOrder,
      defaultOwnerId: step.defaultOwnerId ?? '',
      sopFileId: step.sopFileId ?? '',
      needInspection: step.needInspection,
      needRecord: step.needRecord,
      status: step.status,
      remark: step.remark ?? '',
      productMaterialIds: step.productMaterialIds,
    }));
    routeMaterialOptions.value = materials.filter((item) => item.status === 1);
  } catch (error) {
    EMessage.error(error, '路线步骤加载失败');
  }
};
const openDetail = (row: ProcessRouteListItem) => {
  detailRow.value = row;
  detailDialogVisible.value = true;
};

const loadData = async () => {
  loading.value = true;
  try {
    const [routeRows, options] = await Promise.all([
      productApi.routes(),
      productApi.routeFormOptions(),
    ]);
    routes.value = routeRows;
    productOptions.value = options.products.filter(
      (item) => item.acquireMethod === 'self_made' && item.itemKind !== 'material',
    );
    processOptions.value = options.processSteps.filter((item) => item.status === 1);
    userOptions.value = options.users;
  } catch (error) {
    EMessage.error(error, '工艺路线资料加载失败');
  } finally {
    loading.value = false;
  }
};
const submitRoute = async () => {
  if (!routeForm.routeCode.trim() || !routeForm.routeName.trim() || !routeForm.productId) {
    EMessage.warning('请填写路线编号、路线名称并选择适用产品');
    return;
  }
  submitting.value = true;
  const payload = {
    routeCode: routeForm.routeCode,
    routeName: routeForm.routeName,
    productId: routeForm.productId,
    versionNo: routeForm.versionNo,
    remark: routeForm.remark || null,
  };
  try {
    if (editingRouteId.value) await productApi.updateRoute(editingRouteId.value, payload);
    else await productApi.createRoute(payload);
    EMessage.success(editingRouteId.value ? '工艺路线已更新' : '工艺路线已新增');
    routeDialogVisible.value = false;
    await loadData();
  } catch (error) {
    EMessage.error(error, '工艺路线保存失败');
  } finally {
    submitting.value = false;
  }
};

const addStep = () => {
  stepForm.steps.push({
    processStepId: '',
    stepOrder: stepForm.steps.length + 1,
    defaultOwnerId: '',
    sopFileId: '',
    needInspection: false,
    needRecord: true,
    status: 1,
    productMaterialIds: [],
    remark: '',
  });
};
const removeStep = (index: number) => {
  stepForm.steps.splice(index, 1);
  normalizeStepOrders();
};
const moveStep = (index: number, offset: number) => {
  const ni = index + offset;
  if (ni < 0 || ni >= stepForm.steps.length) return;
  const [s] = stepForm.steps.splice(index, 1);
  if (s) {
    stepForm.steps.splice(ni, 0, s);
  }
  normalizeStepOrders();
};
const normalizeStepOrders = () => {
  stepForm.steps.forEach((s, i) => {
    s.stepOrder = i + 1;
  });
};
const refreshSteps = () => {
  loadData().then(() => EMessage.success('工序列表已刷新'));
};
const submitSteps = async () => {
  if (!stepForm.steps.length || stepForm.steps.some((s) => !s.processStepId)) {
    EMessage.warning('请选择每一道路线步骤对应的工序');
    return;
  }
  if (!editingRouteId.value) return;
  normalizeStepOrders();
  submitting.value = true;
  try {
    await productApi.replaceRouteSteps(
      editingRouteId.value,
      stepForm.steps.map((step) => ({
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
    await loadData();
  } catch (error) {
    EMessage.error(error, '工序顺序保存失败');
  } finally {
    submitting.value = false;
  }
};
const toggleStatus = async (row: ProcessRouteListItem) => {
  const next: ProcessRouteStatus = row.status === 'enabled' ? 'disabled' : 'enabled';
  const text = next === 'enabled' ? '启用' : '停用';
  try {
    await ElMessageBox.confirm(
      `确定${text}路线“${row.routeName}（${row.versionNo}）”吗？${next === 'enabled' ? '启用后该版本的步骤、SOP 和规则快照将不可修改。' : ''}`,
      `${text}工艺路线`,
      { type: 'warning' },
    );
    await productApi.setRouteStatus(row.id, next);
    EMessage.success(`工艺路线已${text}`);
    await loadData();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') EMessage.error(error, `${text}路线失败`);
  }
};
const deleteRoute = async (row: ProcessRouteListItem) => {
  try {
    await ElMessageBox.confirm(
      `确定删除草稿路线“${row.routeName}（${row.versionNo}）”吗？`,
      '删除工艺路线',
      { type: 'warning', confirmButtonText: '删除' },
    );
    await productApi.deleteRoute(row.id);
    EMessage.success('草稿路线已删除');
    await loadData();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') EMessage.error(error, '删除路线失败');
  }
};

const getProcessSop = (processId: string) =>
  processOptions.value.find((p) => p.id === processId)?.sopFileName || '-';
onMounted(loadData);
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

.data-table,
.step-table {
  width: 100%;
  color: #1f2937;
  font-size: 14px;
}
.data-table :deep(.el-table__header th),
.step-table :deep(.el-table__header th) {
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

.dialog-form :deep(.el-input),
.dialog-form :deep(.el-select),
.dialog-form :deep(.el-textarea),
.step-table :deep(.el-input),
.step-table :deep(.el-select),
.step-table :deep(.el-input-number) {
  width: 100%;
}

.step-toolbar {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
}
.toolbar-left {
  display: flex;
  gap: 8px;
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
