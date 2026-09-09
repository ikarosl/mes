<template>
  <el-dialog
    :model-value="visible"
    :title="editingMaterialId ? '编辑物料' : '新增物料'"
    :width="DialogWidth.lg"
    :close-on-click-modal="false"
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
          label="物料编码"
          required
        >
          <el-input
            v-model="form.materialCode"
            placeholder="例如 m1.077.012"
            :disabled="Boolean(editingMaterialId)"
          />
        </el-form-item>
        <el-form-item
          label="物料名称"
          required
        >
          <el-input
            v-model="form.materialName"
            placeholder="请输入物料名称"
          />
        </el-form-item>
        <el-form-item
          label="分类"
          required
        >
          <el-select
            v-model="form.categoryId"
            placeholder="请选择物料分类"
            @visible-change="(visible: boolean) => visible && $emit('refresh-options')"
          >
            <el-option
              v-for="choice in categoryChoices"
              :key="choice.value"
              :label="choice.option?.categoryName ?? `${choice.value}（已失效）`"
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
            :disabled="Boolean(editingMaterialId)"
          />
        </el-form-item>
        <el-form-item
          label="主获取方式"
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
          <template #default="{ row }"
            ><el-input
              v-model="row.key"
              placeholder="例如：厚度"
          /></template>
        </el-table-column>
        <el-table-column
          label="参数值"
          min-width="180"
        >
          <template #default="{ row }"
            ><el-input
              v-model="row.value"
              placeholder="例如：0.254"
          /></template>
        </el-table-column>
        <el-table-column
          label="单位"
          width="130"
        >
          <template #default="{ row }"
            ><el-input
              v-model="row.unit"
              placeholder="mm"
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

      <div class="form-section-title remark-title">备注说明</div>
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
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        @click="handleSubmit"
        >保存物料</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import { Plus } from '@element-plus/icons-vue';
import type {
  MaterialListItem,
  ProductAcquireMethod,
  ProductCategoryOption,
} from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import { buildLiveOptions, hasUnavailableSelection } from '../../../utils/live-options';
import { EMessage } from '../../../utils/message';

export type MaterialFormValue = {
  materialCode: string;
  materialName: string;
  categoryId: string;
  unit: string;
  acquireMethod: ProductAcquireMethod;
  enabled: boolean;
  specValues: Array<{ key: string; value: string; unit: string }>;
  remark: string;
};

const props = defineProps<{
  visible: boolean;
  editingMaterialId: string | null;
  categoryOptions: ProductCategoryOption[];
  submitting: boolean;
}>();
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'refresh-options'): void;
  (e: 'save', value: MaterialFormValue): void;
}>();

const initialForm = (): MaterialFormValue => ({
  materialCode: '',
  materialName: '',
  categoryId: '',
  unit: 'pcs',
  acquireMethod: 'purchased',
  enabled: true,
  specValues: [],
  remark: '',
});
const form = reactive<MaterialFormValue>(initialForm());
const categoryChoices = computed(() =>
  buildLiveOptions(
    props.categoryOptions.filter((item) => item.itemKind === 'material'),
    form.categoryId ? [form.categoryId] : [],
    (item) => item.id,
  ),
);
const resetForm = () => Object.assign(form, initialForm());
const setForm = (row: MaterialListItem) =>
  Object.assign(form, {
    materialCode: row.materialCode,
    materialName: row.materialName,
    categoryId: row.categoryId,
    unit: row.unit,
    acquireMethod: row.acquireMethod,
    enabled: row.status === 1,
    specValues: row.specValues.map((item) => ({
      key: item.key,
      value: item.value,
      unit: item.unit ?? '',
    })),
    remark: row.remark ?? '',
  });
const addSpecRow = () => form.specValues.push({ key: '', value: '', unit: '' });
const removeSpecRow = (index: number) => form.specValues.splice(index, 1);
const handleSubmit = () => {
  if (!form.materialCode.trim() || !form.materialName.trim() || !form.unit.trim()) {
    EMessage.warning('请填写基础物料编码、物料名称和单位');
    return;
  }
  if (!form.categoryId) {
    EMessage.warning('请选择物料分类');
    return;
  }
  if (hasUnavailableSelection(props.categoryOptions, [form.categoryId], (item) => item.id)) {
    EMessage.warning('物料分类已失效，请重新选择');
    return;
  }
  emit('save', { ...form });
};
defineExpose({ resetForm, setForm });
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
.remark-title {
  margin-top: 20px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 20px;
}
.dialog-form :deep(.el-input),
.dialog-form :deep(.el-select),
.dialog-form :deep(.el-textarea),
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
