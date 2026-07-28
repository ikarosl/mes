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
            placeholder="编码或名称"
          />
        </el-form-item>
        <el-form-item label="产品分类">
          <el-select
            v-model="query.categoryId"
            clearable
            placeholder="全部"
          >
            <el-option
              v-for="cat in categoryOptions"
              :key="cat.id"
              :label="`${itemKindLabels[cat.itemKind]} / ${cat.categoryName}`"
              :value="cat.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="获取方式">
          <el-select
            v-model="query.acquireMethod"
            clearable
            placeholder="全部"
          >
            <el-option
              label="自制"
              value="self_made"
            />
            <el-option
              label="委外"
              value="outsourced"
            />
            <el-option
              label="外购"
              value="purchased"
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
            v-if="auth.can(PERMISSIONS.product.products.create)"
            type="primary"
            :icon="Plus"
            @click="openCreate"
            >新增产品</el-button
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
        :data="products"
        class="data-table"
      >
        <el-table-column
          label="产品编码"
          min-width="170"
        >
          <template #default="{ row }"
            ><span class="item-code">{{ row.itemCode }}</span></template
          >
        </el-table-column>
        <el-table-column
          prop="productName"
          label="产品名称"
          min-width="160"
        />
        <el-table-column
          label="对象类型"
          width="100"
        >
          <template #default="{ row }">{{ itemKindLabel(row.itemKind) }}</template>
        </el-table-column>
        <el-table-column
          label="分类"
          width="120"
        >
          <template #default="{ row }">{{ row.categoryName || '-' }}</template>
        </el-table-column>
        <el-table-column
          label="规格参数"
          min-width="220"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ formatSpecSummary(row.specValues) }}</template>
        </el-table-column>
        <el-table-column
          label="物料清单"
          width="120"
        >
          <template #default="{ row }">
            <el-tag
              v-if="!canConfigureProduction(row)"
              type="info"
              effect="light"
              >无</el-tag
            >
            <el-tag
              v-else-if="row.materialCount > 0"
              type="success"
              effect="light"
              >{{ row.materialCount }} 项</el-tag
            >
            <el-tag
              v-else
              type="warning"
              effect="light"
              >未配置</el-tag
            >
          </template>
        </el-table-column>
        <el-table-column
          label="获取方式"
          width="110"
        >
          <template #default="{ row }">{{ acquireMethodLabels[row.acquireMethod] }}</template>
        </el-table-column>
        <el-table-column
          prop="unit"
          label="单位"
          width="90"
        />
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
              v-if="auth.can(PERMISSIONS.product.products.update)"
              link
              type="primary"
              @click="openEdit(row)"
              >编辑</el-button
            >
            <el-button
              v-if="canConfigureProduction(row) && auth.can(PERMISSIONS.product.products.manageBom)"
              link
              :type="row.materialCount > 0 ? 'primary' : 'warning'"
              @click="openMaterials(row)"
              >物料清单</el-button
            >
            <el-button
              v-if="
                canConfigureProduction(row) &&
                auth.can(PERMISSIONS.product.products.setDefaultRoute)
              "
              link
              type="primary"
              @click="openDefaultRoute(row)"
              >默认路线</el-button
            >
            <el-button
              v-if="auth.can(PERMISSIONS.product.products.changeStatus)"
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
        :total="total"
        :current-page="currentPage"
        :page-size="pageSize"
        @update:page-size="handlePageSizeChange"
        @page-change="handlePageChange"
      />
    </div>

    <!-- 新增/编辑产品弹窗 -->
    <ProductFormDialog
      ref="productFormDialogRef"
      :visible="productDialogVisible"
      :editing-product-id="editingProductId"
      :category-options="categoryOptions"
      :item-kind-labels="itemKindLabels"
      :submitting="submittingProduct"
      @update:visible="productDialogVisible = $event"
      @save="submitProduct"
    />

    <!-- 产品详情弹窗 -->
    <ProductDetailDialog
      :visible="detailDialogVisible"
      :row="detailRow"
      :item-kind-label="itemKindLabel"
      :acquire-method-labels="acquireMethodLabels"
      :format-spec-item="formatSpecItem"
      @update:visible="detailDialogVisible = $event"
    />

    <!-- 物料清单弹窗 -->
    <ProductMaterialDialog
      ref="materialDialogRef"
      :visible="materialDialogVisible"
      :product="materialProduct"
      :material-options="materialOptions"
      :loading="materialLoading"
      :submitting="submittingMaterials"
      @update:visible="materialDialogVisible = $event"
      @save="submitMaterials"
      @refresh="refreshMaterials"
    />

    <!-- 默认路线弹窗 -->
    <ProductDefaultRouteDialog
      :visible="defaultRouteDialogVisible"
      :product="defaultRouteProduct"
      :available-routes="availableDefaultRoutes"
      :current-route-id="defaultRouteProduct?.defaultRouteId ?? null"
      :submitting="submittingDefaultRoute"
      @update:visible="defaultRouteDialogVisible = $event"
      @confirm="submitDefaultRoute"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { ElMessageBox } from 'element-plus';
import { PERMISSIONS } from '@company/constants';
import type { ProductAcquireMethod, ProductListItem } from '@company/contracts';
import { productApi } from '../../api/product';
import TableToolbar from '../../components/TableToolbar.vue';
import PaginationFooter from '../../components/PaginationFooter.vue';
import { EMessage } from '../../utils/message';
import { useAuthStore } from '../../stores/auth';
import { useProducts } from './composables/useProducts';
import ProductFormDialog from './components/ProductFormDialog.vue';
import type { ProductFormValue } from './components/ProductFormDialog.vue';
import ProductDetailDialog from './components/ProductDetailDialog.vue';
import ProductMaterialDialog from './components/ProductMaterialDialog.vue';
import type { MaterialRow } from './components/ProductMaterialDialog.vue';
import ProductDefaultRouteDialog from './components/ProductDefaultRouteDialog.vue';

defineOptions({ name: 'ProductsPage' });

const acquireMethodLabels: Record<string, string> = {
  self_made: '自制',
  outsourced: '委外',
  purchased: '外购',
};
const auth = useAuthStore();
const {
  products,
  categoryOptions,
  materialOptions,
  routes,
  loading,
  total,
  currentPage,
  pageSize,
  query,
  itemKindLabels,
  itemKindLabel,
  canConfigureProduction,
  loadData,
  handleSearch,
  resetQuery,
  handlePageSizeChange,
  handlePageChange,
  formatSpecItem,
  formatSpecSummary,
} = useProducts();

/* ----- dialog state ----- */
const productDialogVisible = ref(false);
const detailDialogVisible = ref(false);
const materialDialogVisible = ref(false);
const defaultRouteDialogVisible = ref(false);
const editingProductId = ref<string | null>(null);
const detailRow = ref<ProductListItem | null>(null);
const materialProduct = ref<ProductListItem | null>(null);
const defaultRouteProduct = ref<ProductListItem | null>(null);
const materialLoading = ref(false);
const submittingMaterials = ref(false);
const productFormDialogRef = ref();
const materialDialogRef = ref();
const submittingProduct = ref(false);
const submittingDefaultRoute = ref(false);

const availableDefaultRoutes = computed(() =>
  routes.value.filter(
    (route) => route.productId === defaultRouteProduct.value?.id && route.status === 'enabled',
  ),
);

/* ----- product CRUD ----- */
const openCreate = (): void => {
  editingProductId.value = null;
  productFormDialogRef.value?.resetForm();
  productDialogVisible.value = true;
};

const openEdit = (row: ProductListItem): void => {
  editingProductId.value = row.id;
  productFormDialogRef.value?.setForm(row);
  productDialogVisible.value = true;
};

const openDetail = (row: ProductListItem): void => {
  detailRow.value = row;
  detailDialogVisible.value = true;
};

const submitProduct = async (data: ProductFormValue): Promise<void> => {
  const payload = {
    itemCode: data.itemCode,
    productName: data.productName,
    categoryId: data.categoryId,
    unit: data.unit,
    acquireMethod: data.acquireMethod as ProductAcquireMethod,
    specValues: data.specValues,
    status: data.enabled ? 1 : 0,
    remark: data.remark || null,
  };
  submittingProduct.value = true;
  try {
    if (editingProductId.value) await productApi.updateProduct(editingProductId.value, payload);
    else await productApi.createProduct(payload);
    EMessage.success(editingProductId.value ? '产品已更新' : '产品已新增');
    productDialogVisible.value = false;
    await loadData();
  } catch (error) {
    EMessage.error(error, '产品保存失败');
  } finally {
    submittingProduct.value = false;
  }
};

const toggleStatus = async (row: ProductListItem): Promise<void> => {
  const text = row.status === 1 ? '停用' : '启用';
  try {
    await ElMessageBox.confirm(`确定${text}"${row.productName}"吗？`, `${text}产品资料`, {
      type: row.status === 1 ? 'warning' : 'info',
    });
    await productApi.setProductStatus(row.id, row.status === 1 ? 0 : 1);
    EMessage.success(`产品已${text}`);
    await loadData();
  } catch (error: unknown) {
    if (error !== 'cancel' && error !== 'close') EMessage.error(error, `${text}产品失败`);
  }
};

/* ----- BOM materials ----- */
const openMaterials = async (row: ProductListItem): Promise<void> => {
  materialProduct.value = row;
  materialDialogVisible.value = true;
  await refreshMaterials();
};

const refreshMaterials = async (): Promise<void> => {
  if (!materialProduct.value) return;
  materialLoading.value = true;
  try {
    const [items, options] = await Promise.all([
      productApi.materials(materialProduct.value.id),
      productApi.productOptions(),
    ]);
    materialDialogRef.value?.setRows(
      items.map((item) => ({
        materialProductId: item.materialProductId,
        quantityPerUnit: Number(item.quantityPerUnit),
        unit: item.unit,
        isKeyMaterial: item.isKeyMaterial,
        needBatchRecord: item.needBatchRecord,
        remark: item.remark ?? '',
      })),
    );
    materialOptions.value = options.filter(
      (item) =>
        (item.itemKind === 'material' || item.itemKind === 'semi_finished') &&
        item.id !== materialProduct.value?.id,
    );
  } catch (error) {
    EMessage.error(error, '物料清单加载失败');
  } finally {
    materialLoading.value = false;
  }
};

const submitMaterials = async (rows: MaterialRow[]): Promise<void> => {
  if (!materialProduct.value) return;
  submittingMaterials.value = true;
  try {
    await productApi.replaceMaterials(materialProduct.value.id, rows);
    EMessage.success('物料清单已保存');
    materialDialogVisible.value = false;
    await loadData();
  } catch (error) {
    EMessage.error(error, '物料清单保存失败');
  } finally {
    submittingMaterials.value = false;
  }
};

/* ----- default route ----- */
const openDefaultRoute = (row: ProductListItem): void => {
  defaultRouteProduct.value = row;
  defaultRouteDialogVisible.value = true;
};

const submitDefaultRoute = async (routeId: string | null): Promise<void> => {
  if (!defaultRouteProduct.value) return;
  submittingDefaultRoute.value = true;
  try {
    await productApi.setDefaultRoute(defaultRouteProduct.value.id, routeId);
    EMessage.success('默认工艺路线已保存');
    defaultRouteDialogVisible.value = false;
    await loadData();
  } catch (error) {
    EMessage.error(error, '默认路线保存失败');
  } finally {
    submittingDefaultRoute.value = false;
  }
};

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
  gap: 12px 22px;
}
.query-form :deep(.el-form-item) {
  margin-right: 0;
  margin-bottom: 16px;
}
.query-form :deep(.el-input) {
  width: 180px;
}
.query-form :deep(.el-select) {
  width: 160px;
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
.data-table :deep(.el-tag--warning) {
  background: #fef3c7;
  color: #f59e0b;
}
.data-table :deep(.el-button.is-link) {
  padding: 0;
  font-weight: 500;
}

.item-code {
  font-weight: 600;
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
