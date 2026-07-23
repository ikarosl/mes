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
            v-if="auth.can(PERMISSIONS.product.products.create)"
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
        :data="pagedProducts"
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
          ><template #default="{ row }">{{
            itemKindLabel(row.itemKind)
          }}</template></el-table-column
        >
        <el-table-column
          label="分类"
          width="120"
          ><template #default="{ row }">{{ row.categoryName || '-' }}</template></el-table-column
        >
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
          <template #default="{ row }">{{
            acquireMethodLabels[row.acquireMethod as keyof typeof acquireMethodLabels] ||
            row.acquireMethod
          }}</template>
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
        :total="filteredProducts.length"
        :current-page="currentPage"
        :page-size="pageSize"
        @update:page-size="handlePageSizeChange"
        @page-change="currentPage = $event"
      />
    </div>

    <el-dialog
      v-model="productDialogVisible"
      :title="editingProductId ? '编辑产品' : '新增产品'"
      :width="DialogWidth.lg"
    >
      <el-form
        class="dialog-form"
        label-width="104px"
        :model="productForm"
      >
        <div class="form-section-title">基础信息</div>
        <div class="form-grid">
          <el-form-item
            label="产品编码"
            required
          >
            <el-input
              v-model="productForm.itemCode"
              placeholder="请输入产品编码"
            />
          </el-form-item>
          <el-form-item
            label="产品名称"
            required
          >
            <el-input
              v-model="productForm.productName"
              placeholder="请输入产品名称"
            />
          </el-form-item>
          <el-form-item
            label="产品分类"
            required
          >
            <el-select
              v-model="productForm.categoryId"
              placeholder="请选择产品分类"
            >
              <el-option
                v-for="cat in categoryOptions"
                :key="cat.id"
                :label="`${itemKindLabels[cat.itemKind]} / ${cat.categoryName}`"
                :value="cat.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item
            label="单位"
            required
          >
            <el-input
              v-model="productForm.unit"
              placeholder="pcs"
            />
          </el-form-item>
          <el-form-item
            label="获取方式"
            required
          >
            <el-select v-model="productForm.acquireMethod">
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
            <el-switch
              v-model="productForm.enabled"
              active-text="启用"
              inactive-text="停用"
            />
          </el-form-item>
        </div>

        <div class="form-section-title">规格参数</div>
        <div class="spec-toolbar">
          <el-button
            type="primary"
            :icon="Plus"
            @click="addSpecRow"
            >新增参数</el-button
          >
        </div>
        <el-table
          :data="productForm.specValues"
          class="spec-table"
        >
          <el-table-column
            label="参数名称"
            min-width="180"
          >
            <template #default="{ row }"
              ><el-input
                v-model="row.key"
                placeholder="例如：频率范围"
            /></template>
          </el-table-column>
          <el-table-column
            label="参数值"
            min-width="180"
          >
            <template #default="{ row }"
              ><el-input
                v-model="row.value"
                placeholder="例如：6-18"
            /></template>
          </el-table-column>
          <el-table-column
            label="单位"
            width="130"
          >
            <template #default="{ row }"
              ><el-input
                v-model="row.unit"
                placeholder="GHz"
            /></template>
          </el-table-column>
          <el-table-column
            label="操作"
            width="90"
            align="center"
          >
            <template #default="{ $index }"
              ><el-button
                link
                type="danger"
                @click="removeSpecRow($index)"
                >删除</el-button
              ></template
            >
          </el-table-column>
        </el-table>

        <div class="form-section-title">备注说明</div>
        <el-form-item label="备注">
          <el-input
            v-model="productForm.remark"
            type="textarea"
            :rows="3"
            placeholder="可填写产品说明"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="productDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          @click="submitProduct"
          >保存产品</el-button
        >
      </template>
    </el-dialog>

    <el-dialog
      v-model="detailDialogVisible"
      title="产品详情"
      :width="DialogWidth.lg"
    >
      <el-descriptions
        v-if="detailRow"
        :column="2"
        border
      >
        <el-descriptions-item label="产品编码">{{ detailRow.itemCode }}</el-descriptions-item>
        <el-descriptions-item label="产品名称">{{ detailRow.productName }}</el-descriptions-item>
        <el-descriptions-item label="对象类型">{{
          itemKindLabel(detailRow.itemKind)
        }}</el-descriptions-item>
        <el-descriptions-item label="产品分类">{{
          detailRow.categoryName || '-'
        }}</el-descriptions-item>
        <el-descriptions-item label="获取方式">{{
          acquireMethodLabels[detailRow.acquireMethod as keyof typeof acquireMethodLabels]
        }}</el-descriptions-item>
        <el-descriptions-item label="单位">{{ detailRow.unit }}</el-descriptions-item>
        <el-descriptions-item label="物料清单">{{
          detailRow.materialCount > 0 ? `${detailRow.materialCount} 项` : '未配置'
        }}</el-descriptions-item>
        <el-descriptions-item label="默认路线">{{
          detailRow.defaultRouteName || '未设置'
        }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{
          detailRow.status === 1 ? '启用' : '停用'
        }}</el-descriptions-item>
        <el-descriptions-item
          label="规格参数"
          :span="2"
        >
          <div
            v-if="detailRow.specValues?.length"
            class="spec-tags"
          >
            <el-tag
              v-for="item in detailRow.specValues"
              :key="item.key"
              effect="plain"
              >{{ formatSpecItem(item) }}</el-tag
            >
          </div>
          <span v-else>-</span>
        </el-descriptions-item>
        <el-descriptions-item
          label="备注"
          :span="2"
          >{{ detailRow.remark || '-' }}</el-descriptions-item
        >
      </el-descriptions>
    </el-dialog>

    <el-dialog
      v-model="materialDialogVisible"
      title="配置产品物料清单"
      :width="DialogWidth.xl"
    >
      <template v-if="materialProduct">
        <el-alert
          v-if="!materialRows.length"
          title="当前产品尚未配置物料清单。生产任务生成物料需求前，需要先维护这里的用料。"
          type="warning"
          :closable="false"
          show-icon
          class="bom-alert"
        />
        <div class="bom-header">
          <div>
            <span class="item-code">{{ materialProduct.itemCode }}</span>
            <span class="sub-text">{{ materialProduct.productName }}</span>
          </div>
          <div class="bom-actions">
            <el-button
              :icon="Refresh"
              :loading="materialLoading"
              @click="refreshMaterials"
              >刷新物料</el-button
            >
            <el-button
              v-if="auth.can(PERMISSIONS.product.products.manageBom)"
              type="primary"
              :icon="Plus"
              @click="addMaterialRow"
              >添加已有物料</el-button
            >
          </div>
        </div>
        <el-table
          :data="materialRows"
          class="material-table"
        >
          <el-table-column
            label="物料"
            min-width="260"
          >
            <template #default="{ row }">
              <el-select
                v-model="row.materialProductId"
                filterable
                placeholder="请选择物料"
              >
                <el-option
                  v-for="item in materialOptions"
                  :key="item.id"
                  :label="`${item.itemCode} / ${item.productName}`"
                  :value="item.id"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column
            label="单位"
            width="120"
          >
            <template #default="{ row }"
              ><el-input
                v-model="row.unit"
                placeholder="pcs"
            /></template>
          </el-table-column>
          <el-table-column
            label="单位用量"
            width="150"
          >
            <template #default="{ row }">
              <el-input-number
                v-model="row.quantityPerUnit"
                :min="0.0001"
                :precision="4"
                :step="1"
                controls-position="right"
              />
            </template>
          </el-table-column>
          <el-table-column
            label="关键物料"
            width="110"
            align="center"
          >
            <template #default="{ row }"><el-switch v-model="row.isKeyMaterial" /></template>
          </el-table-column>
          <el-table-column
            label="记录批次"
            width="110"
            align="center"
          >
            <template #default="{ row }"><el-switch v-model="row.needBatchRecord" /></template>
          </el-table-column>
          <el-table-column
            label="备注"
            min-width="160"
          >
            <template #default="{ row }"
              ><el-input
                v-model="row.remark"
                placeholder="可选"
            /></template>
          </el-table-column>
          <el-table-column
            label="操作"
            width="90"
            align="center"
          >
            <template #default="{ $index }"
              ><el-button
                link
                type="danger"
                @click="removeMaterialRow($index)"
                >删除</el-button
              ></template
            >
          </el-table-column>
        </el-table>
      </template>
      <template #footer>
        <el-button @click="materialDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          @click="submitMaterials"
          >保存物料清单</el-button
        >
      </template>
    </el-dialog>

    <el-dialog
      v-model="defaultRouteDialogVisible"
      title="设置默认工艺路线"
      :width="DialogWidth.md"
    >
      <el-form label-width="96px">
        <el-form-item label="产品"
          ><span
            >{{ defaultRouteProduct?.itemCode }} / {{ defaultRouteProduct?.productName }}</span
          ></el-form-item
        >
        <el-form-item label="默认路线">
          <el-select
            v-model="selectedDefaultRouteId"
            clearable
            placeholder="不设置默认路线"
          >
            <el-option
              v-for="route in availableDefaultRoutes"
              :key="route.id"
              :label="`${route.routeCode} / ${route.routeName} / ${route.versionNo}`"
              :value="route.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="defaultRouteDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          @click="submitDefaultRoute"
          >保存默认路线</el-button
        >
      </template>
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
  ProductCategoryListItem,
  ProductItemKind,
  ProductListItem,
  ProductMaterialPayload,
  ProductOption,
} from '@company/contracts';
import TableToolbar from '../../components/TableToolbar.vue';
import PaginationFooter from '../../components/PaginationFooter.vue';
import { DialogWidth } from '../../utils/dialog';
import { EMessage } from '../../utils/message';
import { productApi } from '../../api/product';
import { useAuthStore } from '../../stores/auth';

defineOptions({ name: 'ProductsPage' });

type SpecRow = { key: string; value: string; unit: string };
type MaterialRow = {
  materialProductId: string;
  quantityPerUnit: number;
  unit: string;
  isKeyMaterial: boolean;
  needBatchRecord: boolean;
  remark: string;
};

const acquireMethodLabels = { self_made: '自制', outsourced: '委外', purchased: '外购' };

const auth = useAuthStore();
const products = ref<ProductListItem[]>([]);
const categoryOptions = ref<ProductCategoryListItem[]>([]);
const materialOptions = ref<ProductOption[]>([]);
const routes = ref<ProcessRouteListItem[]>([]);
const itemKindLabels: Record<ProductItemKind, string> = {
  material: '物料',
  semi_finished: '半成品',
  finished_product: '成品',
};
const itemKindLabel = (kind: ProductItemKind) => itemKindLabels[kind];

const filteredProducts = computed(() =>
  products.value.filter((p) => {
    const kw = query.keyword.trim().toLowerCase();
    return (
      (!kw || p.itemCode.toLowerCase().includes(kw) || p.productName.toLowerCase().includes(kw)) &&
      (!query.categoryId || p.categoryId === query.categoryId) &&
      (!query.acquireMethod || p.acquireMethod === query.acquireMethod) &&
      (!query.status ||
        (query.status === 'enabled' && p.status === 1) ||
        (query.status === 'disabled' && p.status !== 1))
    );
  }),
);
const pagedProducts = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredProducts.value.slice(start, start + pageSize.value);
});

const currentPage = ref(1);
const pageSize = ref(10);
const productDialogVisible = ref(false);
const detailDialogVisible = ref(false);
const materialDialogVisible = ref(false);
const defaultRouteDialogVisible = ref(false);
const loading = ref(false);
const materialLoading = ref(false);
const submitting = ref(false);
const editingProductId = ref<string | null>(null);
const detailRow = ref<ProductListItem | null>(null);
const materialProduct = ref<ProductListItem | null>(null);
const defaultRouteProduct = ref<ProductListItem | null>(null);
const selectedDefaultRouteId = ref('');
const materialRows = ref<MaterialRow[]>([]);
const query = reactive({ keyword: '', categoryId: '', acquireMethod: '', status: '' });
const productForm = reactive({
  itemCode: '',
  productName: '',
  categoryId: '',
  unit: 'pcs',
  acquireMethod: 'self_made',
  enabled: true,
  remark: '',
  specValues: [] as SpecRow[],
});
const canConfigureProduction = (row: Pick<ProductListItem, 'acquireMethod' | 'itemKind'>) =>
  row.acquireMethod === 'self_made' && row.itemKind !== 'material';
const availableDefaultRoutes = computed(() =>
  routes.value.filter(
    (route) => route.productId === defaultRouteProduct.value?.id && route.status === 'enabled',
  ),
);

const handleSearch = () => {
  currentPage.value = 1;
};
const resetQuery = () => {
  Object.assign(query, { keyword: '', categoryId: '', acquireMethod: '', status: '' });
  currentPage.value = 1;
};
const handlePageSizeChange = (val: number) => {
  pageSize.value = val;
  currentPage.value = 1;
};

const resetProductForm = () => {
  Object.assign(productForm, {
    itemCode: '',
    productName: '',
    categoryId: '',
    unit: 'pcs',
    acquireMethod: 'self_made',
    enabled: true,
    remark: '',
    specValues: [],
  });
};
const openCreate = () => {
  editingProductId.value = null;
  resetProductForm();
  addSpecRow();
  productDialogVisible.value = true;
};
const openEdit = (row: ProductListItem) => {
  editingProductId.value = row.id;
  Object.assign(productForm, {
    itemCode: row.itemCode,
    productName: row.productName,
    categoryId: row.categoryId ?? '',
    unit: row.unit,
    acquireMethod: row.acquireMethod,
    enabled: row.status === 1,
    remark: row.remark ?? '',
    specValues: (row.specValues || []).map((s) => ({
      key: s.key,
      value: s.value ?? '',
      unit: s.unit ?? '',
    })),
  });
  if (!productForm.specValues.length) addSpecRow();
  productDialogVisible.value = true;
};
const openDetail = (row: ProductListItem) => {
  detailRow.value = row;
  detailDialogVisible.value = true;
};
const openMaterials = async (row: ProductListItem) => {
  materialProduct.value = row;
  materialDialogVisible.value = true;
  await refreshMaterials();
};
const openDefaultRoute = (row: ProductListItem) => {
  defaultRouteProduct.value = row;
  selectedDefaultRouteId.value = row.defaultRouteId ?? '';
  defaultRouteDialogVisible.value = true;
};

const addSpecRow = () => {
  productForm.specValues.push({ key: '', value: '', unit: '' });
};
const removeSpecRow = (index: number) => {
  productForm.specValues.splice(index, 1);
};

const loadData = async () => {
  loading.value = true;
  try {
    const [productRows, options] = await Promise.all([
      productApi.products(),
      productApi.productFormOptions(),
    ]);
    products.value = productRows;
    categoryOptions.value = options.categories.filter((item) => item.status === 1);
    materialOptions.value = options.products.filter(
      (item) => item.itemKind === 'material' || item.itemKind === 'semi_finished',
    );
    routes.value = options.routes;
  } catch (error) {
    EMessage.error(error, '产品资料加载失败');
  } finally {
    loading.value = false;
  }
};
const submitProduct = async () => {
  if (!productForm.itemCode.trim() || !productForm.productName.trim() || !productForm.unit.trim()) {
    EMessage.warning('请填写产品编码、产品名称和单位');
    return;
  }
  if (!productForm.categoryId) {
    EMessage.warning('请选择产品分类');
    return;
  }
  submitting.value = true;
  const payload = {
    itemCode: productForm.itemCode,
    productName: productForm.productName,
    categoryId: productForm.categoryId,
    unit: productForm.unit,
    acquireMethod: productForm.acquireMethod as ProductListItem['acquireMethod'],
    specValues: productForm.specValues,
    status: productForm.enabled ? 1 : 0,
    remark: productForm.remark || null,
  };
  try {
    if (editingProductId.value) await productApi.updateProduct(editingProductId.value, payload);
    else await productApi.createProduct(payload);
    EMessage.success(editingProductId.value ? '产品已更新' : '产品已新增');
    productDialogVisible.value = false;
    await loadData();
  } catch (error) {
    EMessage.error(error, '产品保存失败');
  } finally {
    submitting.value = false;
  }
};

const addMaterialRow = () => {
  materialRows.value.push({
    materialProductId: '',
    quantityPerUnit: 1,
    unit: materialProduct.value?.unit ?? 'pcs',
    isKeyMaterial: true,
    needBatchRecord: true,
    remark: '',
  });
};
const removeMaterialRow = (index: number) => {
  materialRows.value.splice(index, 1);
};
const refreshMaterials = async () => {
  if (!materialProduct.value) return;
  materialLoading.value = true;
  try {
    const [items, options] = await Promise.all([
      productApi.materials(materialProduct.value.id),
      productApi.productOptions(),
    ]);
    materialRows.value = items.map((item) => ({
      materialProductId: item.materialProductId,
      quantityPerUnit: Number(item.quantityPerUnit),
      unit: item.unit,
      isKeyMaterial: item.isKeyMaterial,
      needBatchRecord: item.needBatchRecord,
      remark: item.remark ?? '',
    }));
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
const submitMaterials = async () => {
  if (materialRows.value.some((r) => !r.materialProductId)) {
    EMessage.warning('请选择物料');
    return;
  }
  if (
    new Set(materialRows.value.map((row) => row.materialProductId)).size !==
    materialRows.value.length
  ) {
    EMessage.warning('同一物料不能重复添加');
    return;
  }
  if (!materialProduct.value) return;
  submitting.value = true;
  try {
    await productApi.replaceMaterials(
      materialProduct.value.id,
      materialRows.value as ProductMaterialPayload[],
    );
    EMessage.success('物料清单已保存');
    materialDialogVisible.value = false;
    await loadData();
  } catch (error) {
    EMessage.error(error, '物料清单保存失败');
  } finally {
    submitting.value = false;
  }
};

const submitDefaultRoute = async () => {
  if (!defaultRouteProduct.value) return;
  submitting.value = true;
  try {
    await productApi.setDefaultRoute(
      defaultRouteProduct.value.id,
      selectedDefaultRouteId.value || null,
    );
    EMessage.success('默认工艺路线已保存');
    defaultRouteDialogVisible.value = false;
    await loadData();
  } catch (error) {
    EMessage.error(error, '默认路线保存失败');
  } finally {
    submitting.value = false;
  }
};
const toggleStatus = async (row: ProductListItem) => {
  const text = row.status === 1 ? '停用' : '启用';
  try {
    await ElMessageBox.confirm(`确定${text}“${row.productName}”吗？`, `${text}产品资料`, {
      type: row.status === 1 ? 'warning' : 'info',
    });
    await productApi.setProductStatus(row.id, row.status === 1 ? 0 : 1);
    EMessage.success(`产品已${text}`);
    await loadData();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') EMessage.error(error, `${text}产品失败`);
  }
};

const formatSpecItem = (item: { key: string; value: string; unit?: string }) =>
  `${item.key}: ${item.value ?? '-'}${item.unit ? ` ${item.unit}` : ''}`;
const formatSpecSummary = (items: Array<{ key: string; value: string; unit?: string }>) =>
  !items?.length ? '-' : items.map(formatSpecItem).join('；');
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

.dialog-form {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.form-section-title {
  margin: 4px 0 12px;
  color: #1f2937;
  font-size: 16px;
  font-weight: 600;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 20px;
}
.dialog-form :deep(.el-input),
.dialog-form :deep(.el-select),
.dialog-form :deep(.el-textarea),
.dialog-form :deep(.el-input-number),
.spec-table :deep(.el-input) {
  width: 100%;
}

.spec-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}
.bom-alert {
  margin-bottom: 14px;
}
.bom-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.bom-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sub-text {
  margin-left: 8px;
  color: #6b7280;
  font-size: 13px;
}

.spec-table,
.material-table {
  width: 100%;
}
.spec-table :deep(.el-table__header th),
.material-table :deep(.el-table__header th) {
  height: 48px;
  background: #f9fafb;
  color: #1f2937;
  font-weight: 600;
}
.spec-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
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
