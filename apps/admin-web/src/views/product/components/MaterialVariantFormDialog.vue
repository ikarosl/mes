<template>
  <el-dialog
    :model-value="visible"
    title="新增物料版本"
    :width="DialogWidth.md"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:visible', $event)"
    @closed="resetForm"
  >
    <el-alert
      title="版本编码由基础物料编码和大小版本自动生成，保存后不可修改。"
      type="info"
      :closable="false"
      show-icon
    />
    <el-form
      class="variant-form"
      label-width="96px"
    >
      <el-form-item label="基础物料"
        ><strong>{{ material?.materialCode }} · {{ material?.materialName }}</strong></el-form-item
      >
      <el-row :gutter="16">
        <el-col :span="12"
          ><el-form-item
            label="大版本"
            required
            ><el-input
              v-model="form.majorVersion"
              maxlength="32"
              placeholder="例如 v1" /></el-form-item
        ></el-col>
        <el-col :span="12"
          ><el-form-item
            label="小版本"
            required
            ><el-input
              v-model="form.minorVersion"
              maxlength="32"
              placeholder="例如 A" /></el-form-item
        ></el-col>
      </el-row>
      <el-form-item label="版本编码"
        ><el-input
          :model-value="variantCodePreview"
          disabled
      /></el-form-item>
      <el-form-item label="备注"
        ><el-input
          v-model="form.remark"
          type="textarea"
          :rows="3"
          maxlength="5000"
      /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="!canSubmit"
        @click="submit"
        >保存版本</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import type { MaterialListItem } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';

const props = defineProps<{
  visible: boolean;
  material: MaterialListItem | null;
  submitting: boolean;
}>();
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'save', value: { majorVersion: string; minorVersion: string; remark: string | null }): void;
}>();
const form = reactive({ majorVersion: '', minorVersion: '', remark: '' });
const canSubmit = computed(
  () =>
    Boolean(props.material && form.majorVersion.trim() && form.minorVersion.trim()) &&
    !props.submitting,
);
const variantCodePreview = computed(() =>
  props.material && form.majorVersion.trim() && form.minorVersion.trim()
    ? `${props.material.materialCode}-${form.majorVersion.trim()}-${form.minorVersion.trim()}`
    : '填写大小版本后生成',
);
const resetForm = () => Object.assign(form, { majorVersion: '', minorVersion: '', remark: '' });
const submit = () => {
  if (!canSubmit.value) return;
  emit('save', {
    majorVersion: form.majorVersion.trim(),
    minorVersion: form.minorVersion.trim(),
    remark: form.remark.trim() || null,
  });
};
</script>

<style scoped>
.variant-form {
  margin-top: 18px;
}
.variant-form :deep(.el-input),
.variant-form :deep(.el-textarea) {
  width: 100%;
}
</style>
