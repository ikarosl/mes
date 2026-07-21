<template>
  <section>
    <PageHeader
      title="工艺路线管理"
      description="管理产品工艺路线与工序顺序配置"
    >
      <template #actions>
        <el-button
          type="primary"
          :icon="Plus"
          @click="openCreate"
          >新增路线</el-button
        >
      </template>
    </PageHeader>

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
              label="启用"
              value="enabled"
            />
            <el-option
              label="停用"
              value="disabled"
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
            />
          </el-tooltip>
        </template>
      </TableToolbar>

      <el-table
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
          label="使用产品类型"
          min-width="160"
        >
          <template #default="{ row }">{{
            row.productAttribute && row.productType
              ? `${row.productAttribute} / ${row.productType}`
              : '-'
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
          <template #default="{ row }">{{ row.version || '-' }}</template>
        </el-table-column>
        <el-table-column
          label="状态"
          width="100"
        >
          <template #default="{ row }">
            <el-tag
              :type="row.status === 1 ? 'success' : 'info'"
              effect="light"
              >{{ row.status === 1 ? '启用' : '停用' }}</el-tag
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
              link
              type="primary"
              @click="openEdit(row)"
              >编辑</el-button
            >
            <el-button
              link
              type="primary"
              @click="openSteps(row)"
              >配置工序</el-button
            >
            <el-button
              link
              :type="row.status === 1 ? 'danger' : 'success'"
              @click="toggleStatus(row)"
            >
              {{ row.status === 1 ? '停用' : '启用' }}
            </el-button>
            <el-button
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
        <el-form-item label="使用产品类型">
          <el-select
            v-model="routeForm.productCategoryId"
            filterable
            placeholder="请选择产品分类"
          >
            <el-option
              v-for="cat in categoryOptions"
              :key="cat.id"
              :label="`${cat.productAttribute} / ${cat.productType}`"
              :value="cat.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="版本">
          <el-input
            v-model="routeForm.version"
            placeholder="例如：V1.0"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch
            v-model="routeForm.enabled"
            active-text="启用"
            inactive-text="停用"
          />
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
              v-model="row.processId"
              filterable
              placeholder="请选择已有工序"
            >
              <el-option
                v-for="p in processOptions"
                :key="p.id"
                :label="`${p.processCode} / ${p.processName}`"
                :value="p.id"
              />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column
          label="技术文件"
          min-width="180"
        >
          <template #default="{ row }">{{ getProcessSop(row.processId) || '-' }}</template>
        </el-table-column>
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
        <el-descriptions-item label="使用产品类型">{{
          detailRow.productAttribute && detailRow.productType
            ? `${detailRow.productAttribute} / ${detailRow.productType}`
            : '-'
        }}</el-descriptions-item>
        <el-descriptions-item label="版本">{{ detailRow.version || '-' }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{
          detailRow.status === 1 ? '启用' : '停用'
        }}</el-descriptions-item>
        <el-descriptions-item label="备注">{{ detailRow.remark || '-' }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { Plus, Refresh } from '@element-plus/icons-vue';
import PageHeader from '../../components/PageHeader.vue';
import TableToolbar from '../../components/TableToolbar.vue';
import PaginationFooter from '../../components/PaginationFooter.vue';
import { DialogWidth } from '../../utils/dialog';
import { EMessage } from '../../utils/message';

defineOptions({ name: 'ProcessRoutesPage' });

const demoRoutes = [
  {
    id: '1',
    routeCode: 'ROUTE-CIR-STD',
    routeName: '环形器标准工艺路线',
    productAttribute: '成品',
    productType: '环形器',
    processSummary: '来料检验 → SMT贴片 → 波峰焊 → 调试 → 老化测试 → 最终检验',
    version: 'V1.0',
    status: 1,
    remark: null,
  },
  {
    id: '2',
    routeCode: 'ROUTE-PCB-SMT',
    routeName: 'PCB贴片工艺路线',
    productAttribute: '半成品',
    productType: 'PCB组件',
    processSummary: '来料检验 → SMT贴片 → AOI检测',
    version: 'V1.2',
    status: 1,
    remark: '标准贴片路线',
  },
  {
    id: '3',
    routeCode: 'ROUTE-ISO-TEST',
    routeName: '隔离器测试路线',
    productAttribute: '成品',
    productType: '隔离器',
    processSummary: null,
    version: 'V0.9',
    status: 0,
    remark: '待验证',
  },
];

const categoryOptions = ref([
  { id: 'c1', productAttribute: '成品', productType: '环形器' },
  { id: 'c2', productAttribute: '成品', productType: '隔离器' },
  { id: 'c3', productAttribute: '半成品', productType: 'PCB组件' },
]);

const processOptions = ref([
  { id: 'p1', processCode: 'GX-001', processName: '来料检验', sopFileName: '来料检验SOP.pdf' },
  { id: 'p2', processCode: 'GX-002', processName: 'SMT贴片', sopFileName: null },
  { id: 'p3', processCode: 'GX-003', processName: '波峰焊', sopFileName: '波峰焊操作规范.pdf' },
  { id: 'p4', processCode: 'GX-004', processName: '调试', sopFileName: null },
  { id: 'p5', processCode: 'GX-005', processName: '老化测试', sopFileName: null },
]);

const userOptions = ref([
  { id: 'u1', displayName: '张三' },
  { id: 'u2', displayName: '李四' },
  { id: 'u3', displayName: '王五' },
]);

const filteredRoutes = computed(() =>
  demoRoutes.filter((r: any) => {
    const kw = query.keyword.trim().toLowerCase();
    return (
      (!kw || r.routeCode.toLowerCase().includes(kw) || r.routeName.toLowerCase().includes(kw)) &&
      (!query.status ||
        (query.status === 'enabled' && r.status === 1) ||
        (query.status === 'disabled' && r.status !== 1))
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
const editingRouteId = ref<string | null>(null);
const detailRow = ref<any>(null);
const query = reactive({ keyword: '', status: '' });
const routeForm = reactive({
  routeCode: '',
  routeName: '',
  productCategoryId: '',
  version: 'V1.0',
  enabled: true,
  remark: '',
});

type StepRow = { processId: string; stepOrder: number; defaultOwnerId: string; remark: string };
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
    productCategoryId: '',
    version: 'V1.0',
    enabled: true,
    remark: '',
  });
  routeDialogVisible.value = true;
};
const openEdit = (row: any) => {
  editingRouteId.value = row.id;
  Object.assign(routeForm, {
    routeCode: row.routeCode,
    routeName: row.routeName,
    productCategoryId: '',
    version: row.version ?? '',
    enabled: row.status === 1,
    remark: row.remark ?? '',
  });
  routeDialogVisible.value = true;
};
const openSteps = (row: any) => {
  editingRouteId.value = row.id;
  stepForm.steps = [];
  stepsDialogVisible.value = true;
};
const openDetail = (row: any) => {
  detailRow.value = row;
  detailDialogVisible.value = true;
};

const submitRoute = () => {
  if (!routeForm.routeCode.trim() || !routeForm.routeName.trim()) {
    EMessage.warning('请填写路线编号和路线名称');
    return;
  }
  EMessage.success(editingRouteId.value ? '工艺路线已更新' : '工艺路线已新增');
  routeDialogVisible.value = false;
};

const addStep = () => {
  stepForm.steps.push({
    processId: '',
    stepOrder: stepForm.steps.length + 1,
    defaultOwnerId: '',
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
  EMessage.success('工序列表已刷新');
};
const submitSteps = () => {
  if (!stepForm.steps.length || stepForm.steps.some((s) => !s.processId)) {
    EMessage.warning('请选择每一道路线步骤对应的工序');
    return;
  }
  EMessage.success('工序顺序已保存');
  stepsDialogVisible.value = false;
};
const toggleStatus = (row: any) => {
  EMessage.success(`工艺路线已${row.status === 1 ? '停用' : '启用'}`);
};
const deleteRoute = (_row?: any) => {
  EMessage.warning('工艺路线删除接口尚未接入');
};

const getProcessSop = (processId: string) =>
  processOptions.value.find((p: any) => p.id === processId)?.sopFileName || '-';
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
