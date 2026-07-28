<template>
  <el-dialog
    :model-value="visible"
    :title="isBatch ? '批量重置密码' : '重置密码'"
    :width="DialogWidth.sm"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-form
      class="dialog-form"
      label-width="92px"
      :model="form"
    >
      <el-form-item
        label="新密码"
        required
      >
        <el-input
          v-model="form.password"
          show-password
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        @click="handleConfirm"
        >确定</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';

defineProps<{
  visible: boolean;
  isBatch: boolean;
  submitting: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'confirm', password: string): void;
}>();

const form = reactive({ password: '' });

const handleConfirm = (): void => {
  if (form.password.trim().length < 6) {
    EMessage.warning('新密码至少 6 位');
    return;
  }
  emit('confirm', form.password);
};
</script>

<style scoped>
.dialog-form :deep(.el-input) {
  width: 100%;
}
</style>
