<template>
  <el-dialog
    :model-value="visible"
    :title="editingProductId ? '编辑产品' : '新增产品'"
    :width="DialogWidth.lg"
    @update:model-value="$emit('update:visible', $event)"
    @open="$emit('refresh-options')"
    @closed="resetForm"
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
          label="产品分类"
          required
        >
          <el-select
            v-model="form.categoryId"
            placeholder="请选择产品分类"
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
          />
        </el-form-item>
        <el-form-item
          label="获取方式"
          required
        >
          <el-select v-model="form.acquireMethod">
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
        :data="form.specValues"
        class="spec-table"
      >
        <el-table-column
          label="参数名称"
          min-width="180"
        >
          <template #default="{ row }">
            <el-input
              v-model="row.key"
              placeholder="例如：频率范围"
            />
          </template>
        </el-table-column>
        <el-table-column
          label="参数值"
          min-width="180"
        >
          <template #default="{ row }">
            <el-input
              v-model="row.value"
              placeholder="例如：6-18"
            />
          </template>
        </el-table-column>
        <el-table-column
          label="单位"
          width="130"
        >
          <template #default="{ row }">
            <el-input
              v-model="row.unit"
              placeholder="GHz"
            />
          </template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="90"
          align="center"
        >
          <template #default="{ $index }">
            <el-button
              link
              type="danger"
              @click="removeSpecRow($index)"
              >删除</el-button
            >
          </template>
        </el-table-column>
      </el-table>

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
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        @click="handleSubmit"
        >保存产品</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import { Plus } from '@element-plus/icons-vue';
import type {
  ProductAcquireMethod,
  ProductCategoryListItem,
  ProductItemKind,
} from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import { buildLiveOptions, hasUnavailableSelection } from '../../../utils/live-options';
import { EMessage } from '../../../utils/message';

export type SpecRow = { key: string; value: string; unit: string };
export type ProductFormValue = {
  itemCode: string;
  productName: string;
  categoryId: string;
  unit: string;
  acquireMethod: string;
  enabled: boolean;
  remark: string;
  specValues: SpecRow[];
};

const props = defineProps<{
  visible: boolean;
  editingProductId: string | null;
  categoryOptions: ProductCategoryListItem[];
  itemKindLabels: Record<ProductItemKind, string>;
  submitting: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'refresh-options'): void;
  (e: 'save', data: ProductFormValue): void;
}>();

const initialForm = (): ProductFormValue => ({
  itemCode: '',
  productName: '',
  categoryId: '',
  unit: 'pcs' as const,
  acquireMethod: 'self_made' as ProductAcquireMethod,
  enabled: true,
  remark: '',
  specValues: [],
});

const form = reactive<ProductFormValue>(initialForm());
const categoryChoices = computed(() =>
  buildLiveOptions(
    props.categoryOptions,
    form.categoryId ? [form.categoryId] : [],
    (item) => item.id,
  ),
);

const resetForm = (): void => {
  Object.assign(form, initialForm());
};

const setForm = (row: {
  itemCode: string;
  productName: string;
  categoryId: string | null;
  unit: string;
  acquireMethod: ProductAcquireMethod;
  status: number;
  remark: string | null;
  specValues: Array<{ key: string; value: string; unit?: string }> | null;
}): void => {
  Object.assign(form, {
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
  if (!form.specValues.length) addSpecRow();
};

const addSpecRow = (): void => {
  form.specValues.push({ key: '', value: '', unit: '' });
};

const removeSpecRow = (index: number): void => {
  form.specValues.splice(index, 1);
};

const handleSubmit = (): void => {
  if (!form.itemCode.trim() || !form.productName.trim() || !form.unit.trim()) {
    EMessage.warning('请填写产品编码、产品名称和单位');
    return;
  }
  if (!form.categoryId) {
    EMessage.warning('请选择产品分类');
    return;
  }
  if (hasUnavailableSelection(props.categoryOptions, [form.categoryId], (item) => item.id)) {
    EMessage.warning('产品分类已失效，请重新选择');
    return;
  }
  emit('save', { ...form });
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
.spec-table {
  width: 100%;
}
.spec-table :deep(.el-table__header th) {
  height: 48px;
  background: #f9fafb;
  color: #1f2937;
  font-weight: 600;
}
</style>
