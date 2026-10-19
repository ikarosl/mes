<template>
  <main class="catalog-page">
    <el-tabs v-model="viewMode"
      ><el-tab-pane
        label="成品"
        name="products" /><el-tab-pane
        label="物料"
        name="materials"
    /></el-tabs>
    <section class="query-panel">
      <el-form
        class="query-form"
        :inline="true"
        :model="activeQuery"
      >
        <el-form-item label="关键字"
          ><el-input
            v-model="activeQuery.keyword"
            clearable
            :placeholder="viewMode === 'products' ? '名称或成品编码' : '名称、基础编码或版本编码'"
        /></el-form-item>
        <el-form-item label="分类"
          ><el-select
            v-model="activeQuery.categoryId"
            clearable
            placeholder="全部"
            @visible-change="(v: boolean) => v && categorySource.refresh()"
            ><el-option
              v-for="item in activeCategories"
              :key="item.id"
              :label="item.categoryName"
              :value="item.id" /></el-select
        ></el-form-item>
        <el-form-item label="状态"
          ><el-select
            v-model="activeQuery.status"
            clearable
            placeholder="全部"
            ><el-option
              label="启用"
              value="enabled" /><el-option
              label="停用"
              value="disabled" /></el-select
        ></el-form-item>
        <el-form-item class="query-actions"
          ><el-button
            type="primary"
            @click="searchActive"
            >查询</el-button
          ><el-button @click="resetActive">重置</el-button></el-form-item
        >
      </el-form>
    </section>
    <section
      ref="productTablePanel"
      class="table-panel"
    >
      <TableToolbar :total="activeTotal"
        ><template #actions>
          <el-button
            v-if="viewMode === 'products' && auth.can(PERMISSIONS.product.products.create)"
            type="primary"
            :icon="Plus"
            @click="openCreateProduct"
            >新增成品</el-button
          >
          <el-button
            v-if="viewMode === 'materials' && auth.can(PERMISSIONS.product.materials.create)"
            type="primary"
            :icon="Plus"
            @click="openCreateMaterial"
            >新增物料</el-button
          > </template
        ><template #tools>
          <el-button
            v-if="viewMode === 'materials'"
            text
            :disabled="materials.loading.value || materialRowKeys.length === 0"
            @click="collapseAllRows"
            >收起全部</el-button
          >
          <el-button
            v-if="viewMode === 'materials'"
            text
            :disabled="materials.loading.value || materialRowKeys.length === 0"
            @click="expandAllRows"
            >展开所有</el-button
          >
          <el-tooltip content="刷新"
            ><el-button
              :icon="Refresh"
              text
              circle
              :loading="activeLoading"
              @click="loadActive" /></el-tooltip></template
      ></TableToolbar>

      <el-table
        v-if="viewMode === 'products'"
        v-loading="products.loading.value"
        :data="products.products.value"
        row-key="id"
        class="data-table"
        empty-text="暂无成品"
      >
        <!-- 数据列按最小宽度的比例分摊余宽，操作列按实际按钮宽度保留。 -->
        <el-table-column
          label="成品"
          min-width="220"
          ><template #default="{ row }"
            ><div class="product-identity">
              <strong>{{ row.productName }}</strong>
              <span class="product-code">{{ row.itemCode }}</span>
            </div></template
          ></el-table-column
        >
        <el-table-column
          label="规格摘要"
          min-width="200"
          ><template #default="{ row }"
            ><el-tooltip
              :content="formatSpecSummary(row.specValues)"
              :disabled="!row.specValues.length"
              :show-after="300"
              :popper-style="{ maxWidth: '480px', whiteSpace: 'normal', overflowWrap: 'anywhere' }"
              placement="top"
              ><div class="product-spec-summary">{{ formatSpecSummary(row.specValues) }}</div>
            </el-tooltip></template
          ></el-table-column
        >
        <el-table-column
          prop="categoryName"
          label="分类"
          min-width="180"
          show-overflow-tooltip
        /><el-table-column
          prop="unit"
          label="单位"
          min-width="80"
          show-overflow-tooltip
        />
        <el-table-column
          label="BOM"
          min-width="140"
          ><template #default="{ row }"
            ><el-tag
              :type="bomTag(row).type"
              effect="light"
              >{{ bomTag(row).label }}</el-tag
            ></template
          ></el-table-column
        >
        <el-table-column
          label="状态"
          min-width="100"
          ><template #default="{ row }"
            ><el-tag :type="row.status === 1 ? 'success' : 'info'">{{
              row.status === 1 ? '启用' : '停用'
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column
          label="操作"
          :width="productActionColumnWidth"
          fixed="right"
          ><template #header><span class="product-actions-heading">操作</span></template>
          <template #default="{ row }"
            ><div class="product-row-actions">
              <el-button
                link
                type="primary"
                @click="openDetail(row)"
                >详情</el-button
              >
              <el-button
                v-if="auth.can(PERMISSIONS.product.products.update)"
                link
                type="primary"
                :disabled="row.bomStatus === 'pending_approval'"
                @click="openEditProduct(row)"
                >编辑</el-button
              >
              <el-button
                v-if="auth.can(PERMISSIONS.product.products.manageBom)"
                link
                type="primary"
                @click="openBom(row)"
                >BOM</el-button
              >
              <el-button
                v-if="auth.can(PERMISSIONS.product.products.changeStatus)"
                link
                :type="row.status === 1 ? 'danger' : 'success'"
                :disabled="row.bomStatus === 'pending_approval'"
                @click="toggleProductStatus(row)"
                >{{ row.status === 1 ? '停用' : '启用' }}</el-button
              >
            </div></template
          ></el-table-column
        >
      </el-table>

      <el-table
        v-else
        v-loading="materials.loading.value"
        :data="materials.materials.value"
        row-key="id"
        :expand-row-keys="expandedMaterialRowKeys"
        class="data-table"
        empty-text="暂无物料"
        @expand-change="handleMaterialExpandChange"
      >
        <el-table-column type="expand"
          ><template #default="{ row: material }"
            ><div class="expanded-panel">
              <el-table
                :data="material.variants"
                class="nested-table"
                empty-text="暂无物料版本"
              >
                <el-table-column
                  prop="variantCode"
                  label="完整版本编码"
                  min-width="240"
                /><el-table-column
                  prop="majorVersion"
                  label="大版本"
                  width="120"
                /><el-table-column
                  prop="minorVersion"
                  label="小版本"
                  width="120"
                />
                <el-table-column
                  label="状态"
                  width="100"
                  ><template #default="{ row }"
                    ><el-tag :type="row.status === 1 ? 'success' : 'info'">{{
                      row.status === 1 ? '启用' : '停用'
                    }}</el-tag></template
                  ></el-table-column
                >
                <el-table-column
                  prop="remark"
                  label="备注"
                  min-width="180"
                  ><template #default="{ row }">{{ row.remark || '—' }}</template></el-table-column
                >
                <el-table-column
                  label="操作"
                  width="110"
                  ><template #default="{ row }"
                    ><el-button
                      v-if="auth.can(PERMISSIONS.product.materialVariants.changeStatus)"
                      link
                      :type="row.status === 1 ? 'danger' : 'success'"
                      @click="toggleVariantStatus(row)"
                      >{{ row.status === 1 ? '停用' : '启用' }}</el-button
                    ></template
                  ></el-table-column
                >
              </el-table>
            </div></template
          ></el-table-column
        >
        <el-table-column
          label="基础物料"
          min-width="250"
          ><template #default="{ row }"
            ><strong>{{ row.materialCode }}</strong>
            <div class="secondary">{{ row.materialName }}</div></template
          ></el-table-column
        >
        <el-table-column
          prop="categoryName"
          label="分类"
          min-width="170"
        /><el-table-column
          prop="variantCount"
          label="版本数"
          width="100"
        /><el-table-column
          prop="unit"
          label="单位"
          width="90"
        />
        <el-table-column
          label="状态"
          width="90"
          ><template #default="{ row }"
            ><el-tag :type="row.status === 1 ? 'success' : 'info'">{{
              row.status === 1 ? '启用' : '停用'
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column
          label="操作"
          width="250"
          fixed="right"
          ><template #default="{ row }"
            ><el-button
              v-if="auth.can(PERMISSIONS.product.materials.update)"
              link
              type="primary"
              @click="openEditMaterial(row)"
              >编辑</el-button
            ><el-button
              v-if="auth.can(PERMISSIONS.product.materialVariants.create)"
              link
              type="primary"
              @click="openCreateVariant(row)"
              >新增版本</el-button
            ><el-button
              v-if="auth.can(PERMISSIONS.product.materials.changeStatus)"
              link
              :type="row.status === 1 ? 'danger' : 'success'"
              @click="toggleMaterialStatus(row)"
              >{{ row.status === 1 ? '停用' : '启用' }}</el-button
            ></template
          ></el-table-column
        >
      </el-table>
      <PaginationFooter
        :total="activeTotal"
        :current-page="activePage"
        :page-size="activePageSize"
        @update:page-size="changeActivePageSize"
        @page-change="changeActivePage"
      />
    </section>

    <ProductFormDialog
      ref="productFormRef"
      :visible="productDialogVisible"
      :editing-product-id="editingProductId"
      :editing-product-locked="editingProductLocked"
      :category-options="categorySource.options.value"
      :item-kind-labels="itemKindLabels"
      :submitting="submitting"
      @update:visible="productDialogVisible = $event"
      @refresh-options="categorySource.refresh"
      @save="saveProduct"
    />
    <ProductDetailDialog
      :visible="detailVisible"
      :row="detailRow"
      :item-kind-label="() => '成品'"
      :acquire-method-labels="acquireMethodLabels"
      :format-spec-item="formatSpecItem"
      @update:visible="detailVisible = $event"
    />
    <ProductMaterialDialog
      :visible="bomVisible"
      :product="activeProduct"
      :submitting="submitting"
      @update:visible="bomVisible = $event"
      @save="saveBom"
      @submit-approval="submitBomApproval"
      @view-approval="viewBomApproval"
    />
    <MaterialFormDialog
      ref="materialFormRef"
      :visible="materialDialogVisible"
      :editing-material-id="editingMaterialId"
      :category-options="categorySource.options.value"
      :submitting="submitting"
      @update:visible="materialDialogVisible = $event"
      @refresh-options="categorySource.refresh"
      @save="saveMaterial"
    />
    <MaterialVariantFormDialog
      :visible="variantDialogVisible"
      :material="activeMaterial"
      :submitting="submitting"
      @update:visible="variantDialogVisible = $event"
      @save="saveVariant"
    />
  </main>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { PERMISSIONS, PRODUCT_BOM_STATUS_LABELS } from '@company/constants';
import type {
  MaterialListItem,
  MaterialPayload,
  MaterialVariantItem,
  ProductAcquireMethod,
  ProductItemKind,
  ProductListItem,
} from '@company/contracts';
import { productApi } from '../../api/product';
import { approvalApi } from '../../api/approval';
import TableToolbar from '../../components/TableToolbar.vue';
import PaginationFooter from '../../components/PaginationFooter.vue';
import { useAuthStore } from '../../stores/auth';
import { EMessage } from '../../utils/message';
import { RouteMessageBox } from '../../utils/route-message-box';
import { useProductCategoryOptions } from '../../composables/options/useProductCategoryOptions';
import { useTableActionColumn } from '../../composables/useTableActionColumn';
import { useProductsList } from './composables/useProductsList';
import { useMaterialsList } from './composables/useMaterialsList';
import ProductFormDialog, { type ProductFormValue } from './components/ProductFormDialog.vue';
import ProductDetailDialog from './components/ProductDetailDialog.vue';
import ProductMaterialDialog, { type MaterialRow } from './components/ProductMaterialDialog.vue';
import MaterialFormDialog, { type MaterialFormValue } from './components/MaterialFormDialog.vue';
import MaterialVariantFormDialog from './components/MaterialVariantFormDialog.vue';

defineOptions({ name: 'ProductsPage' });
type ViewMode = 'products' | 'materials';
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const categorySource = useProductCategoryOptions();
const products = useProductsList();
const materials = useMaterialsList();
const viewMode = ref<ViewMode>(route.query.tab === 'materials' ? 'materials' : 'products');
const { tablePanel: productTablePanel, actionColumnWidth: productActionColumnWidth } =
  useTableActionColumn(
    () => (viewMode.value === 'products' ? products.products.value : null),
    '.product-row-actions, .product-actions-heading',
  );
const expandedMaterialRowKeys = ref<string[]>([]);
let shouldInitializeMaterialExpansion = true;
const materialRowKeys = computed(() => materials.materials.value.map((material) => material.id));
watch(materials.materials, (rows) => {
  const rowKeys = rows.map((material) => material.id);
  expandedMaterialRowKeys.value = shouldInitializeMaterialExpansion
    ? rowKeys.slice(0, 1)
    : expandedMaterialRowKeys.value.filter((key) => rowKeys.includes(key));
  if (rowKeys.length) shouldInitializeMaterialExpansion = false;
});
const handleMaterialExpandChange = (_row: MaterialListItem, rows: MaterialListItem[]) => {
  expandedMaterialRowKeys.value = rows.map((material) => material.id);
};
const collapseAllRows = () => {
  expandedMaterialRowKeys.value = [];
};
const expandAllRows = () => {
  expandedMaterialRowKeys.value = materialRowKeys.value;
};
const activeQuery = computed(() =>
  viewMode.value === 'products' ? products.query : materials.query,
);
const activeCategories = computed(() =>
  categorySource.options.value.filter(
    (i) => i.itemKind === (viewMode.value === 'products' ? 'finished_product' : 'material'),
  ),
);
const activeLoading = computed(() =>
  viewMode.value === 'products' ? products.loading.value : materials.loading.value,
);
const activeTotal = computed(() =>
  viewMode.value === 'products' ? products.total.value : materials.total.value,
);
const activePage = computed(() =>
  viewMode.value === 'products' ? products.currentPage.value : materials.currentPage.value,
);
const activePageSize = computed(() =>
  viewMode.value === 'products' ? products.pageSize.value : materials.pageSize.value,
);
const itemKindLabels: Record<ProductItemKind, string> = {
  material: '物料',
  finished_product: '成品',
};
const acquireMethodLabels = { self_made: '自制', outsourced: '委外', purchased: '外购' };
const loadActive = () => (viewMode.value === 'products' ? products.load() : materials.load());
const searchActive = () => {
  if (viewMode.value === 'products') return products.search();
  shouldInitializeMaterialExpansion = true;
  return materials.search();
};
const resetActive = () => {
  if (viewMode.value === 'products') return products.reset();
  shouldInitializeMaterialExpansion = true;
  return materials.reset();
};
const changeActivePageSize = (v: number) => {
  if (viewMode.value === 'products') return products.changePageSize(v);
  shouldInitializeMaterialExpansion = true;
  return materials.changePageSize(v);
};
const changeActivePage = (v: number) => {
  if (viewMode.value === 'products') return products.changePage(v);
  shouldInitializeMaterialExpansion = true;
  return materials.changePage(v);
};
watch(viewMode, async (mode) => {
  await router.replace({ query: mode === 'materials' ? { tab: 'materials' } : {} });
  await loadActive();
});

const productDialogVisible = ref(false);
const materialDialogVisible = ref(false);
const variantDialogVisible = ref(false);
const detailVisible = ref(false);
const bomVisible = ref(false);
const submitting = ref(false);
const editingProductId = ref<string | null>(null);
const editingProductLocked = ref(false);
const editingMaterialId = ref<string | null>(null);
const activeProduct = ref<ProductListItem | null>(null);
const activeMaterial = ref<MaterialListItem | null>(null);
const detailRow = ref<ProductListItem | null>(null);
// 列表刷新会替换行对象；弹窗不能继续持有审批前的旧状态和版本。
watch(products.products, (rows) => {
  const current = rows.find((product) => product.id === activeProduct.value?.id);
  if (current) activeProduct.value = current;
  const detail = rows.find((product) => product.id === detailRow.value?.id);
  if (detail) detailRow.value = detail;
});
const productFormRef = ref<InstanceType<typeof ProductFormDialog>>();
const materialFormRef = ref<InstanceType<typeof MaterialFormDialog>>();
const formatSpecItem = (i: { key: string; value: string; unit?: string }) =>
  `${i.key}：${i.value}${i.unit ? ` ${i.unit}` : ''}`;
const formatSpecSummary = (items: ProductListItem['specValues']) =>
  items.length ? items.map(formatSpecItem).join('，') : '—';
const bomTag = (r: ProductListItem): { label: string; type: 'info' | 'success' | 'warning' } => {
  if (r.bomStatus === 'pending_approval') return { label: '审批中', type: 'warning' };
  if (r.bomStatus === 'approved' || r.bomLockedAt) {
    return { label: `${PRODUCT_BOM_STATUS_LABELS.approved} · ${r.materialCount}项`, type: 'info' };
  }
  return r.materialCount
    ? { label: `可编辑 · ${r.materialCount}项`, type: 'success' }
    : { label: PRODUCT_BOM_STATUS_LABELS.draft, type: 'warning' };
};
const openCreateProduct = () => {
  editingProductId.value = null;
  editingProductLocked.value = false;
  productFormRef.value?.resetForm();
  productDialogVisible.value = true;
};
const openEditProduct = (r: ProductListItem) => {
  editingProductId.value = r.id;
  editingProductLocked.value = r.bomStatus ? r.bomStatus !== 'draft' : Boolean(r.bomLockedAt);
  productFormRef.value?.setForm(r);
  productDialogVisible.value = true;
};
const openDetail = (r: ProductListItem) => {
  detailRow.value = r;
  detailVisible.value = true;
};
const openBom = (r: ProductListItem) => {
  activeProduct.value = r;
  bomVisible.value = true;
};
const runSave = async (action: () => Promise<void>, success: string, failure: string) => {
  submitting.value = true;
  try {
    await action();
    EMessage.success(success);
  } catch (e) {
    EMessage.error(e, failure);
  } finally {
    submitting.value = false;
  }
};
const confirmStatus = async (name: string, status: number, action: () => Promise<void>) => {
  const verb = status === 1 ? '停用' : '启用';
  try {
    await RouteMessageBox.confirm(`确定${verb}“${name}”吗？`, `${verb}资料`, {
      type: status === 1 ? 'warning' : 'info',
      confirmButtonText: verb,
    });
    await action();
    EMessage.success(`已${verb}`);
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') EMessage.error(e, `${verb}失败`);
  }
};
const saveProduct = (d: ProductFormValue) =>
  runSave(
    async () => {
      const p = {
        itemCode: d.itemCode,
        productName: d.productName,
        categoryId: d.categoryId,
        unit: d.unit,
        acquireMethod: d.acquireMethod as ProductAcquireMethod,
        specValues: d.specValues,
        status: d.enabled ? 1 : 0,
        remark: d.remark || null,
      };
      if (editingProductId.value) await productApi.updateProduct(editingProductId.value, p);
      else await productApi.createProduct(p);
      productDialogVisible.value = false;
      await products.load();
    },
    '成品已保存',
    '成品保存失败',
  );
const saveBom = (rows: MaterialRow[]) =>
  activeProduct.value
    ? runSave(
        async () => {
          await productApi.replaceMaterials(
            activeProduct.value!.id,
            rows,
            activeProduct.value!.version,
          );
          bomVisible.value = false;
          await products.load();
        },
        'BOM 已保存',
        'BOM 保存失败',
      )
    : undefined;
const submitBomApproval = () =>
  activeProduct.value
    ? runSave(
        async () => {
          await approvalApi.submitBom(activeProduct.value!.id, activeProduct.value!.version);
          bomVisible.value = false;
          await products.load();
        },
        'BOM 已提交审批',
        'BOM 提交审批失败',
      )
    : undefined;
const viewBomApproval = (): void => {
  if (!activeProduct.value) return;
  bomVisible.value = false;
  void router.push({
    name: 'approval-inbox',
    query: {
      subjectId: activeProduct.value.id,
      ...(activeProduct.value.bomApprovalInstanceId
        ? { instanceId: activeProduct.value.bomApprovalInstanceId }
        : {}),
    },
  });
};
const toggleProductStatus = (r: ProductListItem) =>
  confirmStatus(`${r.productName}（${r.itemCode}）`, r.status, async () => {
    await productApi.setProductStatus(r.id, r.status === 1 ? 0 : 1);
    await products.load();
  });
const openCreateMaterial = () => {
  editingMaterialId.value = null;
  materialFormRef.value?.resetForm();
  materialDialogVisible.value = true;
};
const openEditMaterial = (r: MaterialListItem) => {
  editingMaterialId.value = r.id;
  materialFormRef.value?.setForm(r);
  materialDialogVisible.value = true;
};
const openCreateVariant = (r: MaterialListItem) => {
  activeMaterial.value = r;
  variantDialogVisible.value = true;
};
const saveMaterial = (d: MaterialFormValue) =>
  runSave(
    async () => {
      const p: MaterialPayload = {
        materialCode: d.materialCode,
        materialName: d.materialName,
        categoryId: d.categoryId,
        unit: d.unit,
        acquireMethod: d.acquireMethod,
        specValues: d.specValues,
        status: d.enabled ? 1 : 0,
        remark: d.remark || null,
      };
      if (editingMaterialId.value) await productApi.updateMaterial(editingMaterialId.value, p);
      else await productApi.createMaterial(p);
      materialDialogVisible.value = false;
      await materials.load();
    },
    '物料已保存',
    '物料保存失败',
  );
const saveVariant = (d: { majorVersion: string; minorVersion: string; remark: string | null }) =>
  activeMaterial.value
    ? runSave(
        async () => {
          await productApi.createMaterialVariant({ materialId: activeMaterial.value!.id, ...d });
          variantDialogVisible.value = false;
          await materials.load();
        },
        '物料版本已新增',
        '物料版本新增失败',
      )
    : undefined;
const toggleMaterialStatus = (r: MaterialListItem) =>
  confirmStatus(`${r.materialCode} / ${r.materialName}`, r.status, async () => {
    await productApi.setMaterialStatus(r.id, r.status === 1 ? 0 : 1);
    await materials.load();
  });
const toggleVariantStatus = (r: MaterialVariantItem) =>
  confirmStatus(r.variantCode, r.status, async () => {
    await productApi.setMaterialVariantStatus(r.id, r.status === 1 ? 0 : 1);
    await materials.load();
  });
onMounted(() => {
  void loadActive();
  void categorySource.refresh();
});
let hasActivated = false;
onActivated(() => {
  // KeepAlive 首次挂载也会激活；初次加载由 onMounted 负责。
  if (!hasActivated) {
    hasActivated = true;
    return;
  }
  void loadActive();
  void categorySource.refresh();
});
</script>

<style scoped>
.catalog-page {
  min-width: 0;
}
.query-panel,
.table-panel {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}
.query-panel {
  padding: 20px 20px 4px;
  margin-bottom: 16px;
}
.query-form {
  display: flex;
  gap: 12px 22px;
  align-items: flex-start;
}
.query-form :deep(.el-form-item) {
  margin-right: 0;
  margin-bottom: 16px;
}
.query-form :deep(.el-input) {
  width: 240px;
}
.query-form :deep(.el-select) {
  width: 170px;
}
.query-actions {
  margin-left: auto;
}
.table-panel {
  overflow: hidden;
}
.data-table {
  width: 100%;
}
.data-table :deep(.el-table__header th),
.nested-table :deep(.el-table__header th) {
  height: 48px;
  background: #f9fafb;
  color: #1f2937;
  font-weight: 600;
}
.expanded-panel {
  margin: 0 18px 16px 58px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fafbfc;
}
.nested-table {
  border-radius: 6px;
}
.product-identity {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.product-identity,
.product-spec-summary {
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: 20px;
}
.product-code {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.product-spec-summary {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.product-row-actions {
  display: inline-flex;
  width: max-content;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.product-actions-heading {
  display: inline-block;
  white-space: nowrap;
}
.product-row-actions :deep(.el-button) {
  margin-left: 0;
  padding: 0;
}
.secondary {
  margin-top: 4px;
  color: #6b7280;
  font-size: 12px;
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
