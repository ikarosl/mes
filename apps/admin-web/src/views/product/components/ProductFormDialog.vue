<template>
  <el-dialog
    :model-value="visible"
    :title="editingProductId ? '编辑产品' : '新增产品'"
    :width="DialogWidth.lg"
    :before-close="beforeClose"
    :close-on-press-escape="!busy"
    :show-close="!busy"
    @update:model-value="$emit('update:visible', $event)"
    @open="$emit('refresh-options')"
    @closed="visible || resetForm()"
  >
    <el-form
      class="dialog-form"
      label-width="104px"
      :model="form"
    >
      <div class="form-section-title">基础信息</div>
      <div class="form-grid">
        <el-form-item
          label="产品编码"
          required
        >
          <el-input
            v-model="form.itemCode"
            placeholder="请输入产品编码"
            :disabled="Boolean(editingProductId)"
          />
        </el-form-item>
        <el-form-item
          label="产品名称"
          required
        >
          <el-input
            v-model="form.productName"
            placeholder="请输入产品名称"
          />
        </el-form-item>
        <el-form-item
          label="分类"
          required
        >
          <el-select
            v-model="form.categoryId"
            placeholder="请选择分类"
            :disabled="editingProductLocked"
            @visible-change="(visible: boolean) => visible && $emit('refresh-options')"
          >
            <el-option
              v-for="choice in categoryChoices"
              :key="choice.value"
              :label="
                choice.option
                  ? `${itemKindLabels[choice.option.itemKind]} / ${choice.option.categoryName}`
                  : `${choice.value}（已失效）`
              "
              :value="choice.value"
              :disabled="choice.isUnavailable"
            />
          </el-select>
        </el-form-item>
        <el-form-item
          label="单位"
          required
        >
          <el-input
            v-model="form.unit"
            placeholder="pcs"
            :disabled="Boolean(editingProductId)"
          />
        </el-form-item>
        <el-form-item
          label="获取方式"
          required
        >
          <el-select
            v-model="form.acquireMethod"
            :disabled="editingProductLocked"
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
          <el-switch
            v-model="form.enabled"
            active-text="启用"
            inactive-text="停用"
          />
        </el-form-item>
      </div>

      <el-alert
        v-if="stale"
        title="规格书关联已发生变化，请重新加载产品后再保存。"
        type="warning"
        :closable="false"
        show-icon
      />
      <el-button
        v-if="stale && currentProduct"
        class="reload-button"
        @click="reloadProduct"
        >重新加载产品</el-button
      >
      <el-form-item
        label="规格书"
        required
      >
        <SpecificationUpload
          :key="editingProductId ?? 'new'"
          v-model="specificationFile"
          :active="visible"
          :disabled="submitting"
          @uploading="uploading = $event"
        />
      </el-form-item>

      <div class="form-section-title">规格参数</div>
      <JsonTableEditor
        v-if="visible"
        v-model="form.specValues"
        :disabled="submitting"
      >
        <template #actions
          ><el-button
            :disabled="submitting"
            @click="templatesVisible = true"
            >应用模板</el-button
          ></template
        >
      </JsonTableEditor>

      <div class="form-section-title">备注说明</div>
      <el-form-item label="备注">
        <el-input
          v-model="form.remark"
          type="textarea"
          :rows="3"
          placeholder="可填写产品说明"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button
        :disabled="busy"
        @click="close"
        >取消</el-button
      >
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="busy || stale || !specificationFile"
        @click="handleSubmit"
        >保存产品</el-button
      >
    </template>
  </el-dialog>
  <BusinessTemplatePicker
    v-model:visible="templatesVisible"
    @apply="applyTemplate"
  />
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type {
  ProductAcquireMethod,
  ProductCategoryOption,
  ProductItemKind,
  ProductListItem,
  TechnicalFileListItem,
} from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import { buildLiveOptions, hasUnavailableSelection } from '../../../utils/live-options';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { useDraftCloseGuard } from '../../../composables/useDraftCloseGuard';
import JsonTableEditor from '../../../components/JsonTableEditor.vue';
import BusinessTemplatePicker from '../../../components/BusinessTemplatePicker.vue';
import { normalizeJsonTable } from '@company/utils';
import SpecificationUpload from './SpecificationUpload.vue';
import type { JsonTableData } from '@company/contracts';

export type ProductFormValue = {
  itemCode: string;
  productName: string;
  categoryId: string;
  unit: string;
  acquireMethod: string;
  enabled: boolean;
  remark: string;
  specValues: JsonTableData;
  specificationFileId: string;
  expectedSpecificationFileId: string | null;
};
type ProductFormDraft = Omit<ProductFormValue, 'specificationFileId'>;

const props = defineProps<{
  visible: boolean;
  editingProductId: string | null;
  editingProductLocked: boolean;
  currentProduct: ProductListItem | null;
  categoryOptions: ProductCategoryOption[];
  itemKindLabels: Record<ProductItemKind, string>;
  submitting: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'refresh-options'): void;
  (e: 'save', data: ProductFormValue): void;
}>();

const initialForm = (): ProductFormDraft => ({
  itemCode: '',
  productName: '',
  categoryId: '',
  unit: 'pcs' as const,
  acquireMethod: 'self_made' as ProductAcquireMethod,
  enabled: true,
  remark: '',
  specValues: { columns: [], rows: [] },
  expectedSpecificationFileId: null,
});

const form = reactive<ProductFormDraft>(initialForm());
const specificationFile = ref<Pick<TechnicalFileListItem, 'id' | 'originalName'> | null>(null);
const uploading = ref(false);
const busy = computed(() => props.submitting || uploading.value);
const templatesVisible = ref(false);
const applyTemplate = async (content: JsonTableData): Promise<void> => {
  const previous = form.specValues;
  if (form.specValues.columns.length) {
    try {
      await RouteMessageBox.confirm('应用模板会替换当前所有列及内容，确认继续？', '应用模板', {
        type: 'warning',
        confirmButtonText: '替换内容',
      });
    } catch {
      return;
    }
  }
  if (props.visible && !props.submitting && form.specValues === previous)
    form.specValues = normalizeJsonTable(content);
};
const signature = () =>
  JSON.stringify({
    form,
    fileId: specificationFile.value?.id ?? '',
  });
const baseline = ref(signature());
const stale = computed(
  () =>
    Boolean(props.editingProductId) &&
    (!props.currentProduct ||
      props.currentProduct.specificationFileId !== form.expectedSpecificationFileId),
);
const { close, beforeClose } = useDraftCloseGuard({
  visible: () => props.visible,
  busy: () => busy.value,
  dirty: () => signature() !== baseline.value,
  label: '产品资料',
  onClose: () => emit('update:visible', false),
});
const categoryChoices = computed(() =>
  buildLiveOptions(
    props.categoryOptions.filter((item) => item.itemKind === 'finished_product'),
    form.categoryId ? [form.categoryId] : [],
    (item) => item.id,
  ),
);

const resetForm = (): void => {
  specificationFile.value = null;
  Object.assign(form, initialForm());
  templatesVisible.value = false;
  baseline.value = signature();
};

const setForm = (row: ProductListItem): void => {
  specificationFile.value = row.specificationFile;
  Object.assign(form, {
    itemCode: row.itemCode,
    expectedSpecificationFileId: row.specificationFileId,
    productName: row.productName,
    categoryId: row.categoryId ?? '',
    unit: row.unit,
    acquireMethod: row.acquireMethod,
    enabled: row.status === 1,
    remark: row.remark ?? '',
    specValues: normalizeJsonTable(row.specValues),
  });
  baseline.value = signature();
};
const reloadProduct = async (): Promise<void> => {
  if (!props.currentProduct || busy.value) return;
  try {
    await RouteMessageBox.confirm('重新加载会放弃当前产品草稿，确认继续？', '重新加载产品', {
      type: 'warning',
    });
    if (props.currentProduct && props.visible) setForm(props.currentProduct);
  } catch {
    /* 取消时保留草稿。 */
  }
};

const handleSubmit = (): void => {
  if (busy.value || stale.value) return;
  if (!(specificationFile.value?.id ?? '')) {
    EMessage.warning('请完成规格书上传后再保存');
    return;
  }
  if (!form.itemCode.trim() || !form.productName.trim() || !form.unit.trim()) {
    EMessage.warning('请填写产品编码、产品名称和单位');
    return;
  }
  if (!form.categoryId) {
    EMessage.warning('请选择分类');
    return;
  }
  if (hasUnavailableSelection(props.categoryOptions, [form.categoryId], (item) => item.id)) {
    EMessage.warning('分类已失效，请重新选择');
    return;
  }
  let specValues: JsonTableData;
  try {
    specValues = normalizeJsonTable(form.specValues);
  } catch (error) {
    EMessage.warning(error instanceof Error ? error.message : '请检查规格参数');
    return;
  }
  emit('save', {
    ...form,
    specificationFileId: specificationFile.value?.id ?? '',
    specValues,
  });
};

defineExpose({ setForm, resetForm });
</script>

<style scoped>
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
.dialog-form :deep(.el-textarea) {
  width: 100%;
}
</style>
