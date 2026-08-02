<template>
  <el-dialog
    :model-value="visible"
    :title="editingProcessId ? '编辑工序' : '新增工序'"
    :width="DialogWidth.md"
    @update:model-value="$emit('update:visible', $event)"
    @closed="resetForm"
  >
    <el-form
      class="dialog-form"
      label-width="96px"
      :model="form"
    >
      <el-form-item
        label="工序编码"
        required
      >
        <el-input
          v-model="form.stepCode"
          placeholder="例如：GX-001"
        />
      </el-form-item>
      <el-form-item
        label="工序名称"
        required
      >
        <el-input
          v-model="form.stepName"
          placeholder="例如：装配、调试、检验"
        />
      </el-form-item>
      <el-form-item label="状态">
        <el-switch
          v-model="form.enabled"
          active-text="启用"
          inactive-text="停用"
        />
      </el-form-item>
      <el-form-item label="工序说明">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="3"
          placeholder="填写操作要求、检验要求或注意事项"
        />
      </el-form-item>
      <el-form-item label="备注">
        <el-input
          v-model="form.remark"
          type="textarea"
          :rows="2"
          placeholder="可填写备注"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        @click="handleSubmit"
        >保存工序</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import type { ProcessStepPayload } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';

defineProps<{
  visible: boolean;
  editingProcessId: string | null;
  submitting: boolean;
}>();
const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'save', payload: ProcessStepPayload): void;
}>();

const form = reactive({
  stepCode: '',
  stepName: '',
  description: '',
  enabled: true,
  remark: '',
});
const initialForm = () => ({
  stepCode: '',
  stepName: '',
  description: '',
  enabled: true,
  remark: '',
});
const resetForm = (): void => {
  Object.assign(form, initialForm());
};
const setForm = (row: {
  stepCode: string;
  stepName: string;
  description: string | null;
  status: number;
  remark: string | null;
}): void => {
  Object.assign(form, {
    stepCode: row.stepCode,
    stepName: row.stepName,
    description: row.description ?? '',
    enabled: row.status === 1,
    remark: row.remark ?? '',
  });
};
const handleSubmit = (): void => {
  if (!form.stepCode.trim() || !form.stepName.trim()) {
    EMessage.warning('请填写工序编码和工序名称');
    return;
  }
  emit('save', {
    stepCode: form.stepCode,
    stepName: form.stepName,
    description: form.description || null,
    status: form.enabled ? 1 : 0,
    remark: form.remark || null,
  });
};

defineExpose({ setForm, resetForm });
</script>

<style scoped>
.dialog-form :deep(.el-input),
.dialog-form :deep(.el-select),
.dialog-form :deep(.el-textarea) {
  width: 100%;
}
</style>
