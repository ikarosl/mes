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
    <section class="table-panel">
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
        ><template #tools
          ><el-tooltip content="刷新"
            ><el-button
              :icon="Refresh"
              text
              circle
              :loading="activeLoading"
              @click="loadActive" /></el-tooltip></template
      ></TableToolbar>

      <el-table
        v-if="viewMode === 'products'"
        v-loading="productGroups.loading.value"
        :data="productGroups.groups.value"
        row-key="groupKey"
        default-expand-all
        class="data-table"
        empty-text="暂无成品"
      >
        <el-table-column type="expand"
          ><template #default="{ row: group }"
            ><div class="expanded-panel">
              <el-table
                :data="group.codes"
                class="nested-table"
              >
                <el-table-column
                  label="成品编码"
                  min-width="170"
                  ><template #default="{ row }"
                    ><el-button
                      link
                      type="primary"
                      class="code-link"
                      @click="openDetail(row)"
                      >{{ row.itemCode }}</el-button
                    ></template
                  ></el-table-column
                >
                <el-table-column
                  label="规格摘要"
                  min-width="210"
                  show-overflow-tooltip
                  ><template #default="{ row }">{{
                    formatSpecSummary(row.specValues)
                  }}</template></el-table-column
                >
                <el-table-column
                  label="BOM"
                  width="140"
                  ><template #default="{ row }"
                    ><el-tag
                      :type="bomTag(row).type"
                      effect="light"
                      >{{ bomTag(row).label }}</el-tag
                    ></template
                  ></el-table-column
                >
                <el-table-column
                  label="默认工艺路线"
                  min-width="170"
                  ><template #default="{ row }">{{
                    row.defaultRouteName || '未设置'
                  }}</template></el-table-column
                >
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
                  width="225"
                  fixed="right"
                  ><template #default="{ row }">
                    <el-button
                      v-if="auth.can(PERMISSIONS.product.products.update)"
                      link
                      type="primary"
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
                    <el-dropdown
                      trigger="click"
                      @command="(c: string) => handleProductCommand(c, row)"
                      ><el-button
                        link
                        type="primary"
                        >更多<el-icon><ArrowDown /></el-icon></el-button
                      ><template #dropdown
                        ><el-dropdown-menu>
                          <el-dropdown-item
                            v-if="auth.can(PERMISSIONS.product.products.setDefaultRoute)"
                            command="route"
                            >设置默认路线</el-dropdown-item
                          >
                          <el-dropdown-item
                            v-if="auth.can(PERMISSIONS.product.products.changeStatus)"
                            command="status"
                            >{{ row.status === 1 ? '停用' : '启用' }}</el-dropdown-item
                          >
                        </el-dropdown-menu></template
                      ></el-dropdown
                    >
                  </template></el-table-column
                >
              </el-table>
            </div></template
          ></el-table-column
        >
        <el-table-column
          prop="productName"
          label="成品名称"
          min-width="260"
          ><template #default="{ row }"
            ><strong>{{ row.productName }}</strong></template
          ></el-table-column
        >
        <el-table-column
          prop="categoryName"
          label="分类"
          min-width="180"
        /><el-table-column
          prop="codeCount"
          label="编码数"
          width="110"
        />
        <el-table-column
          label="操作"
          width="130"
          fixed="right"
          ><template #default="{ row }"
            ><el-button
              v-if="auth.can(PERMISSIONS.product.products.create)"
              link
              type="primary"
              @click="openCreateCode(row)"
              >新增编码</el-button
            ></template
          ></el-table-column
        >
      </el-table>

      <el-table
        v-else
        v-loading="materials.loading.value"
        :data="materials.materials.value"
        row-key="id"
        default-expand-all
        class="data-table"
        empty-text="暂无物料"
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
      :creating-in-group="creatingInGroup"
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
    />
    <ProductDefaultRouteDialog
      :visible="routeVisible"
      :product="activeProduct"
      :current-route-id="activeProduct?.defaultRouteId ?? null"
      :submitting="submitting"
      @update:visible="routeVisible = $event"
      @confirm="saveDefaultRoute"
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
import { ArrowDown, Plus, Refresh } from '@element-plus/icons-vue';
import { PERMISSIONS } from '@company/constants';
import type {
  MaterialListItem,
  MaterialPayload,
  MaterialVariantItem,
  ProductAcquireMethod,
  ProductGroupItem,
  ProductItemKind,
  ProductListItem,
} from '@company/contracts';
import { productApi } from '../../api/product';
import TableToolbar from '../../components/TableToolbar.vue';
import PaginationFooter from '../../components/PaginationFooter.vue';
import { useAuthStore } from '../../stores/auth';
import { EMessage } from '../../utils/message';
import { RouteMessageBox } from '../../utils/route-message-box';
import { useProductCategoryOptions } from '../../composables/options/useProductCategoryOptions';
import { useProductGroupsList } from './composables/useProductGroupsList';
import { useMaterialsList } from './composables/useMaterialsList';
import ProductFormDialog, { type ProductFormValue } from './components/ProductFormDialog.vue';
import ProductDetailDialog from './components/ProductDetailDialog.vue';
import ProductMaterialDialog, { type MaterialRow } from './components/ProductMaterialDialog.vue';
import ProductDefaultRouteDialog from './components/ProductDefaultRouteDialog.vue';
import MaterialFormDialog, { type MaterialFormValue } from './components/MaterialFormDialog.vue';
import MaterialVariantFormDialog from './components/MaterialVariantFormDialog.vue';

defineOptions({ name: 'ProductsPage' });
type ViewMode = 'products' | 'materials';
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const categorySource = useProductCategoryOptions();
const productGroups = useProductGroupsList();
const materials = useMaterialsList();
const viewMode = ref<ViewMode>(route.query.tab === 'materials' ? 'materials' : 'products');
const activeQuery = computed(() =>
  viewMode.value === 'products' ? productGroups.query : materials.query,
);
const activeCategories = computed(() =>
  categorySource.options.value.filter(
    (i) => i.itemKind === (viewMode.value === 'products' ? 'finished_product' : 'material'),
  ),
);
const activeLoading = computed(() =>
  viewMode.value === 'products' ? productGroups.loading.value : materials.loading.value,
);
const activeTotal = computed(() =>
  viewMode.value === 'products' ? productGroups.total.value : materials.total.value,
);
const activePage = computed(() =>
  viewMode.value === 'products' ? productGroups.currentPage.value : materials.currentPage.value,
);
const activePageSize = computed(() =>
  viewMode.value === 'products' ? productGroups.pageSize.value : materials.pageSize.value,
);
const itemKindLabels: Record<ProductItemKind, string> = {
  material: '物料',
  finished_product: '成品',
};
const acquireMethodLabels = { self_made: '自制', outsourced: '委外', purchased: '外购' };
const loadActive = () => (viewMode.value === 'products' ? productGroups.load() : materials.load());
const searchActive = () =>
  viewMode.value === 'products' ? productGroups.search() : materials.search();
const resetActive = () =>
  viewMode.value === 'products' ? productGroups.reset() : materials.reset();
const changeActivePageSize = (v: number) =>
  viewMode.value === 'products' ? productGroups.changePageSize(v) : materials.changePageSize(v);
const changeActivePage = (v: number) =>
  viewMode.value === 'products' ? productGroups.changePage(v) : materials.changePage(v);
watch(viewMode, async (mode) => {
  await router.replace({ query: mode === 'materials' ? { tab: 'materials' } : {} });
  await loadActive();
});

const productDialogVisible = ref(false);
const materialDialogVisible = ref(false);
const variantDialogVisible = ref(false);
const detailVisible = ref(false);
const bomVisible = ref(false);
const routeVisible = ref(false);
const submitting = ref(false);
const editingProductId = ref<string | null>(null);
const editingProductLocked = ref(false);
const creatingInGroup = ref(false);
const editingMaterialId = ref<string | null>(null);
const activeProduct = ref<ProductListItem | null>(null);
const activeMaterial = ref<MaterialListItem | null>(null);
const detailRow = ref<ProductListItem | null>(null);
const productFormRef = ref<InstanceType<typeof ProductFormDialog>>();
const materialFormRef = ref<InstanceType<typeof MaterialFormDialog>>();
const formatSpecItem = (i: { key: string; value: string; unit?: string }) =>
  `${i.key}：${i.value}${i.unit ? ` ${i.unit}` : ''}`;
const formatSpecSummary = (items: ProductListItem['specValues']) =>
  items.length ? items.map(formatSpecItem).join('，') : '—';
const bomTag = (r: ProductListItem): { label: string; type: 'info' | 'success' | 'warning' } =>
  r.bomLockedAt
    ? { label: `已锁定 · ${r.materialCount}项`, type: 'info' }
    : r.materialCount
      ? { label: `可编辑 · ${r.materialCount}项`, type: 'success' }
      : { label: '未配置', type: 'warning' };
const openCreateProduct = () => {
  editingProductId.value = null;
  creatingInGroup.value = false;
  editingProductLocked.value = false;
  productFormRef.value?.resetForm();
  productDialogVisible.value = true;
};
const openCreateCode = (g: ProductGroupItem) => {
  editingProductId.value = null;
  creatingInGroup.value = true;
  editingProductLocked.value = false;
  productFormRef.value?.setCreateDefaults(g);
  productDialogVisible.value = true;
};
const openEditProduct = (r: ProductListItem) => {
  editingProductId.value = r.id;
  creatingInGroup.value = false;
  editingProductLocked.value = Boolean(r.bomLockedAt);
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
const handleProductCommand = (c: string, r: ProductListItem) => {
  if (c === 'route') {
    activeProduct.value = r;
    routeVisible.value = true;
  } else void toggleProductStatus(r);
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
      await productGroups.load();
    },
    '成品已保存',
    '成品保存失败',
  );
const saveBom = (rows: MaterialRow[]) =>
  activeProduct.value
    ? runSave(
        async () => {
          await productApi.replaceMaterials(activeProduct.value!.id, rows);
          bomVisible.value = false;
          await productGroups.load();
        },
        'BOM 已保存',
        'BOM 保存失败',
      )
    : undefined;
const saveDefaultRoute = (id: string | null) =>
  activeProduct.value
    ? runSave(
        async () => {
          await productApi.setDefaultRoute(activeProduct.value!.id, id);
          routeVisible.value = false;
          await productGroups.load();
        },
        '默认工艺路线已保存',
        '默认工艺路线保存失败',
      )
    : undefined;
const toggleProductStatus = (r: ProductListItem) =>
  confirmStatus(r.productName, r.status, async () => {
    await productApi.setProductStatus(r.id, r.status === 1 ? 0 : 1);
    await productGroups.load();
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
onMounted(async () => {
  await Promise.all([loadActive(), categorySource.refresh()]);
});
onActivated(() => {
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
.code-link {
  font-weight: 600;
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
