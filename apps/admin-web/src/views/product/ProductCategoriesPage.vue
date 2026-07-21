<template>
  <section>
    <PageHeader
      title="产品分类管理"
      description="管理产品分类的属性与类型组合"
    >
      <template #actions>
        <el-button
          type="primary"
          :icon="Plus"
          @click="openCreate"
          >新增分类</el-button
        >
      </template>
    </PageHeader>

    <div class="query-panel">
      <el-form
        class="query-form"
        :inline="true"
        :model="query"
      >
        <el-form-item label="产品属性">
          <el-input
            v-model="query.productAttribute"
            clearable
            placeholder="请输入产品属性"
          />
        </el-form-item>
        <el-form-item label="产品类型">
          <el-input
            v-model="query.productType"
            clearable
            placeholder="请输入产品类型"
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
            >新增分类</el-button
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
        :data="pagedCategories"
        class="data-table"
      >
        <el-table-column
          prop="productAttribute"
          label="产品属性"
          min-width="140"
        />
        <el-table-column
          prop="productType"
          label="产品类型"
          min-width="160"
        />
        <el-table-column
          label="状态"
          width="100"
        >
          <template #default="{ row }">
            <el-tag
              :type="row.status === 1 ? 'success' : 'info'"
              effect="light"
            >
              {{ row.status === 1 ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          label="更新时间"
          min-width="180"
        >
          <template #default="{ row }">{{ row.updatedAt || '-' }}</template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="200"
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
              :type="row.status === 1 ? 'danger' : 'success'"
              @click="toggleStatus(row)"
            >
              {{ row.status === 1 ? '停用' : '启用' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <PaginationFooter
        :total="filteredCategories.length"
        :current-page="currentPage"
        :page-size="pageSize"
        @update:page-size="handlePageSizeChange"
        @page-change="currentPage = $event"
      />
    </div>

    <el-dialog
      v-model="categoryDialogVisible"
      :title="editingCategoryId ? '编辑分类' : '新增分类'"
      :width="DialogWidth.md"
      @closed="resetCategoryForm"
    >
      <el-form
        class="dialog-form"
        label-width="96px"
        :model="categoryForm"
      >
        <el-form-item
          label="产品属性"
          required
        >
          <el-input
            v-model="categoryForm.productAttribute"
            placeholder="例如：成品、半成品、外购件"
          />
        </el-form-item>
        <el-form-item
          label="产品类型"
          required
        >
          <el-input
            v-model="categoryForm.productType"
            placeholder="例如：环形器、PCB、腔体"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch
            v-model="categoryForm.enabled"
            active-text="启用"
            inactive-text="停用"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="categoryForm.remark"
            type="textarea"
            :rows="3"
            placeholder="可填写分类说明"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="categoryDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          @click="submitCategory"
          >保存分类</el-button
        >
      </template>
    </el-dialog>

    <el-dialog
      v-model="detailDialogVisible"
      title="分类详情"
      :width="DialogWidth.md"
    >
      <el-descriptions
        v-if="detailRow"
        :column="2"
        border
      >
        <el-descriptions-item label="产品属性">{{
          detailRow.productAttribute
        }}</el-descriptions-item>
        <el-descriptions-item label="产品类型">{{ detailRow.productType }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{
          detailRow.status === 1 ? '启用' : '停用'
        }}</el-descriptions-item>
        <el-descriptions-item label="更新时间">{{
          detailRow.updatedAt || '-'
        }}</el-descriptions-item>
        <el-descriptions-item
          label="备注"
          :span="2"
          >{{ detailRow.remark || '-' }}</el-descriptions-item
        >
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

defineOptions({ name: 'ProductCategoriesPage' });

const demoData = [
  {
    id: '1',
    productAttribute: '成品',
    productType: '环形器',
    status: 1,
    updatedAt: '2026-07-20 10:00:00',
    remark: '标准成品分类',
  },
  {
    id: '2',
    productAttribute: '半成品',
    productType: 'PCB组件',
    status: 1,
    updatedAt: '2026-07-19 14:30:00',
    remark: null,
  },
  {
    id: '3',
    productAttribute: '外购件',
    productType: '标准件',
    status: 0,
    updatedAt: '2026-07-18 09:00:00',
    remark: '停用分类',
  },
];

const filteredCategories = computed(() =>
  demoData.filter((c: any) => {
    const pa = query.productAttribute.trim().toLowerCase();
    const pt = query.productType.trim().toLowerCase();
    return (
      (!pa || c.productAttribute.toLowerCase().includes(pa)) &&
      (!pt || c.productType.toLowerCase().includes(pt)) &&
      (!query.status ||
        (query.status === 'enabled' && c.status === 1) ||
        (query.status === 'disabled' && c.status !== 1))
    );
  }),
);

const pagedCategories = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredCategories.value.slice(start, start + pageSize.value);
});

const currentPage = ref(1);
const pageSize = ref(10);
const categoryDialogVisible = ref(false);
const detailDialogVisible = ref(false);
const editingCategoryId = ref<string | null>(null);
const detailRow = ref<any>(null);
const query = reactive({ productAttribute: '', productType: '', status: '' });
const categoryForm = reactive({ productAttribute: '', productType: '', enabled: true, remark: '' });

const resetCategoryForm = () => {
  Object.assign(categoryForm, { productAttribute: '', productType: '', enabled: true, remark: '' });
};
const handleSearch = () => {
  currentPage.value = 1;
};
const resetQuery = () => {
  Object.assign(query, { productAttribute: '', productType: '', status: '' });
  currentPage.value = 1;
};
const handlePageSizeChange = (val: number) => {
  pageSize.value = val;
  currentPage.value = 1;
};

const openCreate = () => {
  editingCategoryId.value = null;
  resetCategoryForm();
  categoryDialogVisible.value = true;
};
const openEdit = (row: any) => {
  editingCategoryId.value = row.id;
  Object.assign(categoryForm, {
    productAttribute: row.productAttribute,
    productType: row.productType,
    enabled: row.status === 1,
    remark: row.remark ?? '',
  });
  categoryDialogVisible.value = true;
};
const openDetail = (row: any) => {
  detailRow.value = row;
  detailDialogVisible.value = true;
};

const submitCategory = () => {
  if (!categoryForm.productAttribute.trim() || !categoryForm.productType.trim()) {
    EMessage.warning('请填写产品属性和产品类型');
    return;
  }
  EMessage.success(editingCategoryId.value ? '分类已更新' : '分类已新增');
  categoryDialogVisible.value = false;
};

const toggleStatus = (row: any) => {
  const text = row.status === 1 ? '停用' : '启用';
  EMessage.success(`分类已${text}`);
};
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
  width: 180px;
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

.dialog-form :deep(.el-input),
.dialog-form :deep(.el-select),
.dialog-form :deep(.el-textarea) {
  width: 100%;
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
