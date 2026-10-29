<template>
  <el-dialog
    :model-value="visible"
    :title="editingMaterialId ? '编辑物料' : '新增物料'"
    :width="DialogWidth.lg"
    :close-on-click-modal="false"
    :before-close="beforeClose"
    :show-close="!submitting"
    :close-on-press-escape="!submitting"
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
      <el-button
        :disabled="submitting"
        @click="close"
        >取消</el-button
      >
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
import { computed, reactive, ref } from 'vue';
import type {
  MaterialListItem,
  ProductAcquireMethod,
  ProductCategoryOption,
} from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import { buildLiveOptions, hasUnavailableSelection } from '../../../utils/live-options';
import { EMessage } from '../../../utils/message';
import { useDraftCloseGuard } from '../../../composables/useDraftCloseGuard';
import { normalizeJsonTable } from '@company/utils';
import type { JsonTableData } from '@company/contracts';

export type MaterialFormValue = {
  materialCode: string;
  materialName: string;
  categoryId: string;
  unit: string;
  acquireMethod: ProductAcquireMethod;
  enabled: boolean;
  // 暂停物料参数录入；新增使用空表格，编辑保留已存参数，避免保存其他资料时清空。
  specValues: JsonTableData;
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
  specValues: { columns: [], rows: [] },
  remark: '',
});
const form = reactive<MaterialFormValue>(initialForm());
const baseline = ref(JSON.stringify(form));
const { close, beforeClose } = useDraftCloseGuard({
  visible: () => props.visible,
  busy: () => props.submitting,
  dirty: () => JSON.stringify(form) !== baseline.value,
  label: '基础物料资料',
  onClose: () => emit('update:visible', false),
});
const categoryChoices = computed(() =>
  buildLiveOptions(
    props.categoryOptions.filter((item) => item.itemKind === 'material'),
    form.categoryId ? [form.categoryId] : [],
    (item) => item.id,
  ),
);
const resetForm = () => {
  Object.assign(form, initialForm());
  baseline.value = JSON.stringify(form);
};
const setForm = (row: MaterialListItem) => {
  Object.assign(form, {
    materialCode: row.materialCode,
    materialName: row.materialName,
    categoryId: row.categoryId,
    unit: row.unit,
    acquireMethod: row.acquireMethod,
    enabled: row.status === 1,
    specValues: normalizeJsonTable(row.specValues),
    remark: row.remark ?? '',
  });
  baseline.value = JSON.stringify(form);
};
const handleSubmit = () => {
  if (props.submitting) return;
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
.dialog-form :deep(.el-textarea) {
  width: 100%;
}
</style>
