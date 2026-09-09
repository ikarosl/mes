<template>
  <section>
    <div class="query-panel">
      <el-form
        class="query-form"
        :inline="true"
        :model="query"
      >
        <el-form-item label="分类编码">
          <el-input
            v-model="query.categoryCode"
            clearable
            placeholder="请输入分类编码"
          />
        </el-form-item>
        <el-form-item label="分类名称">
          <el-input
            v-model="query.categoryName"
            clearable
            placeholder="请输入分类名称"
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
            v-if="auth.can(PERMISSIONS.product.categories.create)"
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
              :loading="loading"
              @click="loadCategories"
            />
          </el-tooltip>
        </template>
      </TableToolbar>

      <el-table
        v-loading="loading"
        :data="categories"
        class="data-table"
      >
        <el-table-column
          prop="categoryCode"
          label="分类编码"
          min-width="140"
        />
        <el-table-column
          prop="categoryName"
          label="分类名称"
          min-width="160"
        />
        <el-table-column
          label="对象类型"
          width="120"
        >
          <template #default="{ row }">{{ itemKindLabel(row.itemKind) }}</template>
        </el-table-column>
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
          <template #default="{ row }">{{ formatDateTimeForDisplay(row.updatedAt) }}</template>
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
              v-if="auth.can(PERMISSIONS.product.categories.update)"
              link
              type="primary"
              @click="openEdit(row)"
              >编辑</el-button
            >
            <el-button
              v-if="auth.can(PERMISSIONS.product.categories.changeStatus)"
              link
              :type="row.status === 1 ? 'danger' : 'success'"
              :disabled="isRowPending(row.id)"
              @click="toggleStatus(row)"
            >
              {{ row.status === 1 ? '停用' : '启用' }}
            </el-button>
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
    </div>

    <ProductCategoryFormDialog
      ref="categoryFormDialogRef"
      :visible="categoryDialogVisible"
      :editing-category-id="editingCategoryId"
      :item-kind-labels="itemKindLabels"
      :submitting="submitting"
      @update:visible="categoryDialogVisible = $event"
      @save="submitCategory"
    />

    <ProductCategoryDetailDialog
      :visible="detailDialogVisible"
      :detail-row="detailRow"
      :item-kind-labels="itemKindLabels"
      @update:visible="detailDialogVisible = $event"
    />
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { PERMISSIONS } from '@company/constants';
import type {
  ProductCategoryListItem,
  ProductCategoryPayload,
  ProductItemKind,
} from '@company/contracts';
import TableToolbar from '../../components/TableToolbar.vue';
import PaginationFooter from '../../components/PaginationFooter.vue';
import { EMessage } from '../../utils/message';
import { RouteMessageBox as ElMessageBox } from '../../utils/route-message-box';
import { useRowPending } from '../../utils/useRowPending';
import { productApi } from '../../api/product';
import { useAuthStore } from '../../stores/auth';
import { formatDateTimeForDisplay } from '../../utils/date';
import { useProductCategories } from './composables/useProductCategories';
import ProductCategoryDetailDialog from './components/ProductCategoryDetailDialog.vue';
import ProductCategoryFormDialog from './components/ProductCategoryFormDialog.vue';

defineOptions({ name: 'ProductCategoriesPage' });

const auth = useAuthStore();
const {
  categories,
  loading,
  total,
  currentPage,
  pageSize,
  query,
  loadCategories,
  handleSearch,
  resetQuery,
  handlePageSizeChange,
  handlePageChange,
} = useProductCategories();
const submitting = ref(false);
/** 行内写操作守卫（启停分类），同一行只允许一个在途（todo 3.5） */
const { isRowPending, beginRow, endRow } = useRowPending();
const itemKindLabels: Record<ProductItemKind, string> = {
  // 分类名称仍可为“半成品”；这里只表达它与物料共用同一业务语义。
  material: '物料（含半成品）',
  finished_product: '成品',
};
const itemKindLabel = (kind: ProductItemKind) => itemKindLabels[kind];

const categoryDialogVisible = ref(false);
const detailDialogVisible = ref(false);
const editingCategoryId = ref<string | null>(null);
const detailRow = ref<ProductCategoryListItem | null>(null);
const categoryFormDialogRef = ref<InstanceType<typeof ProductCategoryFormDialog> | null>(null);

const openCreate = () => {
  editingCategoryId.value = null;
  categoryFormDialogRef.value?.resetForm();
  categoryDialogVisible.value = true;
};
const openEdit = (row: ProductCategoryListItem) => {
  editingCategoryId.value = row.id;
  categoryFormDialogRef.value?.setForm(row);
  categoryDialogVisible.value = true;
};
const openDetail = (row: ProductCategoryListItem) => {
  detailRow.value = row;
  detailDialogVisible.value = true;
};

const submitCategory = async (payload: ProductCategoryPayload) => {
  submitting.value = true;
  try {
    if (editingCategoryId.value) await productApi.updateCategory(editingCategoryId.value, payload);
    else await productApi.createCategory(payload);
    EMessage.success(editingCategoryId.value ? '分类已更新' : '分类已新增');
    categoryDialogVisible.value = false;
    await loadCategories();
  } catch (error) {
    EMessage.error(error, '分类保存失败');
  } finally {
    submitting.value = false;
  }
};

const toggleStatus = async (row: ProductCategoryListItem) => {
  if (!beginRow(row.id)) return;
  const text = row.status === 1 ? '停用' : '启用';
  try {
    await ElMessageBox.confirm(`确定${text}分类“${row.categoryName}”吗？`, `${text}分类`, {
      type: row.status === 1 ? 'warning' : 'info',
    });
    await productApi.setCategoryStatus(row.id, row.status === 1 ? 0 : 1);
    EMessage.success(`分类已${text}`);
    await loadCategories();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') EMessage.error(error, `${text}分类失败`);
  } finally {
    endRow(row.id);
  }
};
onMounted(loadCategories);
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
