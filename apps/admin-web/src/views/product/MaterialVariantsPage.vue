<template>
  <main class="material-variants-page">
    <section class="query-panel">
      <el-form
        class="query-form"
        :inline="true"
        :model="query"
        @submit.prevent="search"
      >
        <el-form-item label="基础物料">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="基础编码或名称"
          />
        </el-form-item>
        <el-form-item label="指定物料">
          <el-select
            v-model="query.materialProductId"
            clearable
            filterable
            placeholder="全部基础物料"
            @visible-change="(visible: boolean) => visible && productSource.refresh()"
          >
            <el-option
              v-for="choice in materialChoices"
              :key="choice.value"
              :label="
                choice.option
                  ? `${choice.option.itemCode} · ${choice.option.productName}`
                  : `${choice.value}（已失效）`
              "
              :value="choice.value"
              :disabled="choice.isUnavailable"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="query.status"
            clearable
            placeholder="全部状态"
          >
            <el-option
              label="启用"
              :value="1"
            />
            <el-option
              label="停用"
              :value="0"
            />
          </el-select>
        </el-form-item>
        <el-form-item class="query-actions">
          <el-button
            type="primary"
            :loading="loading"
            @click="search"
            >查询</el-button
          >
          <el-button @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </section>

    <section class="table-panel">
      <TableToolbar :total="total">
        <template #actions>
          <el-button
            v-if="auth.can(PERMISSIONS.product.materialVariants.create)"
            type="primary"
            :icon="Plus"
            @click="openCreate"
          >
            新增物料版本
          </el-button>
        </template>
        <template #tools>
          <el-button
            :icon="Refresh"
            text
            circle
            :loading="loading"
            @click="load"
          />
        </template>
      </TableToolbar>
      <el-table
        v-loading="loading"
        :data="rows"
        class="data-table"
        empty-text="暂无物料版本"
      >
        <el-table-column
          label="版本编码"
          min-width="220"
        >
          <template #default="{ row }">
            <strong class="variant-code">{{ row.variantCode }}</strong>
            <div class="secondary">由系统生成，不可修改</div>
          </template>
        </el-table-column>
        <el-table-column
          label="基础物料"
          min-width="230"
        >
          <template #default="{ row }">
            <div>{{ row.materialCode }}</div>
            <div class="secondary">{{ row.materialName }}</div>
          </template>
        </el-table-column>
        <el-table-column
          prop="majorVersion"
          label="大版本"
          width="110"
        />
        <el-table-column
          prop="minorVersion"
          label="小版本"
          width="110"
        />
        <el-table-column
          label="状态"
          width="100"
        >
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'">
              {{ row.status === 1 ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          label="更新时间"
          width="180"
        >
          <template #default="{ row }">{{ formatDateTimeForDisplay(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column
          label="备注"
          min-width="170"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ row.remark || '-' }}</template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="130"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button
              v-if="auth.can(PERMISSIONS.product.materialVariants.changeStatus)"
              link
              :type="row.status === 1 ? 'danger' : 'success'"
              :disabled="pendingIds.has(row.id)"
              :loading="pendingIds.has(row.id)"
              @click="toggleStatus(row)"
            >
              {{ row.status === 1 ? '停用' : '启用' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <PaginationFooter
        :total="total"
        :current-page="query.page ?? 1"
        :page-size="query.pageSize ?? 20"
        @update:page-size="pageSizeChanged"
        @page-change="pageChanged"
      />
    </section>

    <el-dialog
      v-model="createVisible"
      title="新增物料版本"
      :width="DialogWidth.md"
      :close-on-click-modal="false"
      @closed="resetForm"
    >
      <el-alert
        title="版本属于基础物料的精确库存身份；基础物料编码和版本编码均由系统维护，保存后不可修改。"
        type="info"
        :closable="false"
        show-icon
      />
      <el-form
        class="variant-form"
        label-width="96px"
      >
        <el-form-item
          label="基础物料"
          required
        >
          <el-select
            v-model="form.materialProductId"
            filterable
            placeholder="请选择基础物料"
            @visible-change="(visible: boolean) => visible && productSource.refresh()"
          >
            <el-option
              v-for="option in materialOptions"
              :key="option.id"
              :label="`${option.itemCode} · ${option.productName}`"
              :value="option.id"
            />
          </el-select>
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item
              label="大版本"
              required
            >
              <el-input
                v-model="form.majorVersion"
                maxlength="32"
                placeholder="例如 v1"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item
              label="小版本"
              required
            >
              <el-input
                v-model="form.minorVersion"
                maxlength="32"
                placeholder="例如 A"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="版本编码">
          <el-input
            :model-value="variantCodePreview"
            disabled
          />
          <div class="field-tip">仅为预览，最终编码由后端按基础编码生成。</div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="3"
            maxlength="5000"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="creating"
          :disabled="!canCreate"
          @click="submitCreate"
        >
          保存版本
        </el-button>
      </template>
    </el-dialog>
  </main>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, reactive, ref } from 'vue';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { PERMISSIONS } from '@company/constants';
import type {
  MaterialVariantItem,
  MaterialVariantListQuery,
  MaterialVariantPayload,
} from '@company/contracts';
import TableToolbar from '../../components/TableToolbar.vue';
import PaginationFooter from '../../components/PaginationFooter.vue';
import { productApi } from '../../api/product';
import { useProductOptions } from '../../composables/options/useProductOptions';
import { useAuthStore } from '../../stores/auth';
import { DialogWidth } from '../../utils/dialog';
import { EMessage } from '../../utils/message';
import { RouteMessageBox } from '../../utils/route-message-box';
import { formatDateTimeForDisplay } from '../../utils/date';
import { buildLiveOptions } from '../../utils/live-options';

defineOptions({ name: 'MaterialVariantsPage' });

const auth = useAuthStore();
const productSource = useProductOptions();
const materialOptions = computed(() =>
  productSource.options.value.filter((item) => item.itemKind === 'material'),
);
const query = reactive<MaterialVariantListQuery>({ page: 1, pageSize: 20, keyword: '' });
const rows = ref<MaterialVariantItem[]>([]);
const total = ref(0);
const loading = ref(false);
const creating = ref(false);
const createVisible = ref(false);
const pendingIds = ref(new Set<string>());
const form = reactive<MaterialVariantPayload>({
  materialProductId: '',
  majorVersion: '',
  minorVersion: '',
  remark: null,
});
let listToken = 0;

const materialChoices = computed(() =>
  buildLiveOptions(
    materialOptions.value,
    query.materialProductId ? [query.materialProductId] : [],
    (item) => item.id,
  ),
);

const selectedMaterial = computed(() =>
  materialOptions.value.find((item) => item.id === form.materialProductId),
);
const variantCodePreview = computed(() => {
  if (!selectedMaterial.value || !form.majorVersion.trim() || !form.minorVersion.trim())
    return '保存后生成';
  return `${selectedMaterial.value.itemCode}-${form.majorVersion.trim()}-${form.minorVersion.trim()}`;
});
const canCreate = computed(
  () =>
    Boolean(form.materialProductId) &&
    Boolean(form.majorVersion.trim()) &&
    Boolean(form.minorVersion.trim()) &&
    !creating.value,
);

const load = async (): Promise<void> => {
  const token = ++listToken;
  loading.value = true;
  try {
    const result = await productApi.materialVariants({
      ...query,
      keyword: query.keyword?.trim() || undefined,
    });
    if (token !== listToken) return;
    rows.value = result.items;
    total.value = result.total;
  } catch (error) {
    if (token === listToken) EMessage.error(error, '物料版本加载失败');
  } finally {
    if (token === listToken) loading.value = false;
  }
};
const search = (): void => {
  query.page = 1;
  void load();
};
const resetQuery = (): void => {
  query.keyword = '';
  query.materialProductId = undefined;
  query.status = undefined;
  query.page = 1;
  void load();
};
const pageSizeChanged = (value: number): void => {
  query.pageSize = value;
  query.page = 1;
  void load();
};
const pageChanged = (value: number): void => {
  query.page = value;
  void load();
};
const resetForm = (): void => {
  form.materialProductId = '';
  form.majorVersion = '';
  form.minorVersion = '';
  form.remark = null;
};
const openCreate = async (): Promise<void> => {
  resetForm();
  createVisible.value = true;
  await productSource.refresh();
};
const submitCreate = async (): Promise<void> => {
  if (!canCreate.value) return;
  creating.value = true;
  try {
    const result = await productApi.createMaterialVariant({
      materialProductId: form.materialProductId,
      majorVersion: form.majorVersion.trim(),
      minorVersion: form.minorVersion.trim(),
      remark: form.remark?.trim() || null,
    });
    EMessage.success(`物料版本 ${result.variantCode} 已创建`);
    createVisible.value = false;
    await load();
  } catch (error) {
    EMessage.error(error, '物料版本创建失败');
  } finally {
    creating.value = false;
  }
};
const toggleStatus = async (row: MaterialVariantItem): Promise<void> => {
  if (pendingIds.value.has(row.id)) return;
  pendingIds.value = new Set(pendingIds.value).add(row.id);
  const nextStatus = row.status === 1 ? 0 : 1;
  try {
    await RouteMessageBox.confirm(
      `确定${nextStatus === 1 ? '启用' : '停用'}物料版本“${row.variantCode}”吗？${nextStatus === 0 ? '停用后不能作为新需求版本候选。' : ''}`,
      `${nextStatus === 1 ? '启用' : '停用'}物料版本`,
      { type: nextStatus === 1 ? 'info' : 'warning' },
    );
    await productApi.setMaterialVariantStatus(row.id, nextStatus);
    EMessage.success(`物料版本已${nextStatus === 1 ? '启用' : '停用'}`);
    await load();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') EMessage.error(error, '物料版本状态更新失败');
  } finally {
    const next = new Set(pendingIds.value);
    next.delete(row.id);
    pendingIds.value = next;
  }
};

onMounted(() => {
  void load();
});
onActivated(() => {
  void productSource.refresh();
});
</script>

<style scoped>
.material-variants-page {
  display: grid;
  gap: 16px;
}
.query-panel,
.table-panel {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
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
.query-form :deep(.el-input),
.query-form :deep(.el-select) {
  width: 220px;
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
.data-table :deep(.el-table__header th) {
  background: #f9fafb;
}
.variant-code {
  color: #1d4ed8;
}
.secondary,
.field-tip {
  color: #909399;
  font-size: 12px;
}
.variant-form {
  margin-top: 18px;
}
.variant-form :deep(.el-select),
.variant-form :deep(.el-input) {
  width: 100%;
}
.field-tip {
  margin-top: 4px;
}
</style>
