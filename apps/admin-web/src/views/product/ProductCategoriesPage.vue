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
        :data="pagedCategories"
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
          label="分类编码"
          required
        >
          <el-input
            v-model="categoryForm.categoryCode"
            placeholder="例如：MAT-ELECTRONIC"
          />
        </el-form-item>
        <el-form-item
          label="分类名称"
          required
        >
          <el-input
            v-model="categoryForm.categoryName"
            placeholder="例如：电子物料"
          />
        </el-form-item>
        <el-form-item
          label="对象类型"
          required
        >
          <el-select
            v-model="categoryForm.itemKind"
            :disabled="Boolean(editingCategoryId)"
          >
            <el-option
              v-for="(label, value) in itemKindLabels"
              :key="value"
              :label="label"
              :value="value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="父分类">
          <el-select
            v-model="categoryForm.parentId"
            clearable
            placeholder="顶级分类"
          >
            <el-option
              v-for="item in parentOptions"
              :key="item.id"
              :label="`${item.categoryCode} / ${item.categoryName}`"
              :value="item.id"
            />
          </el-select>
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
          :loading="submitting"
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
        <el-descriptions-item label="分类编码">{{ detailRow.categoryCode }}</el-descriptions-item>
        <el-descriptions-item label="分类名称">{{ detailRow.categoryName }}</el-descriptions-item>
        <el-descriptions-item label="对象类型">{{
          itemKindLabels[detailRow.itemKind]
        }}</el-descriptions-item>
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
import { computed, onMounted, reactive, ref } from 'vue';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { ElMessageBox } from 'element-plus';
import { PERMISSIONS } from '@company/constants';
import type { ProductCategoryListItem, ProductItemKind } from '@company/contracts';
import TableToolbar from '../../components/TableToolbar.vue';
import PaginationFooter from '../../components/PaginationFooter.vue';
import { DialogWidth } from '../../utils/dialog';
import { EMessage } from '../../utils/message';
import { productApi } from '../../api/product';
import { useAuthStore } from '../../stores/auth';

defineOptions({ name: 'ProductCategoriesPage' });

const auth = useAuthStore();
const categories = ref<ProductCategoryListItem[]>([]);
const loading = ref(false);
const submitting = ref(false);
const itemKindLabels: Record<ProductItemKind, string> = {
  material: '物料',
  semi_finished: '半成品',
  finished_product: '成品',
};
const itemKindLabel = (kind: ProductItemKind) => itemKindLabels[kind];

const filteredCategories = computed(() =>
  categories.value.filter((c) => {
    const code = query.categoryCode.trim().toLowerCase();
    const name = query.categoryName.trim().toLowerCase();
    return (
      (!code || c.categoryCode.toLowerCase().includes(code)) &&
      (!name || c.categoryName.toLowerCase().includes(name)) &&
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
const detailRow = ref<ProductCategoryListItem | null>(null);
const query = reactive({ categoryCode: '', categoryName: '', status: '' });
const categoryForm = reactive({
  parentId: '' as string,
  categoryCode: '',
  categoryName: '',
  itemKind: 'material' as ProductItemKind,
  enabled: true,
  remark: '',
});
const parentOptions = computed(() =>
  categories.value.filter(
    (item) =>
      item.id !== editingCategoryId.value &&
      item.itemKind === categoryForm.itemKind &&
      item.status === 1,
  ),
);

const resetCategoryForm = () => {
  Object.assign(categoryForm, {
    parentId: '',
    categoryCode: '',
    categoryName: '',
    itemKind: 'material',
    enabled: true,
    remark: '',
  });
};
const handleSearch = () => {
  currentPage.value = 1;
};
const resetQuery = () => {
  Object.assign(query, { categoryCode: '', categoryName: '', status: '' });
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
const openEdit = (row: ProductCategoryListItem) => {
  editingCategoryId.value = row.id;
  Object.assign(categoryForm, {
    parentId: row.parentId ?? '',
    categoryCode: row.categoryCode,
    categoryName: row.categoryName,
    itemKind: row.itemKind,
    enabled: row.status === 1,
    remark: row.remark ?? '',
  });
  categoryDialogVisible.value = true;
};
const openDetail = (row: ProductCategoryListItem) => {
  detailRow.value = row;
  detailDialogVisible.value = true;
};

const loadCategories = async () => {
  loading.value = true;
  try {
    categories.value = await productApi.categories();
  } catch (error) {
    EMessage.error(error, '产品分类加载失败');
  } finally {
    loading.value = false;
  }
};
const submitCategory = async () => {
  if (!categoryForm.categoryCode.trim() || !categoryForm.categoryName.trim()) {
    EMessage.warning('请填写分类编码和分类名称');
    return;
  }
  submitting.value = true;
  const payload = {
    parentId: categoryForm.parentId || null,
    categoryCode: categoryForm.categoryCode,
    categoryName: categoryForm.categoryName,
    itemKind: categoryForm.itemKind,
    status: categoryForm.enabled ? 1 : 0,
    remark: categoryForm.remark || null,
  };
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
