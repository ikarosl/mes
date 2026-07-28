<template>
  <el-dialog
    :model-value="visible"
    title="分配角色"
    :width="DialogWidth.md"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-form
      class="dialog-form"
      label-width="92px"
    >
      <el-form-item label="用户">
        <el-input
          :model-value="userName"
          disabled
        />
      </el-form-item>
      <el-form-item
        label="角色"
        required
      >
        <el-select
          v-model="roleIds"
          multiple
          clearable
          placeholder="请选择角色"
        >
          <el-option
            v-for="role in roleOptions"
            :key="role.id"
            :label="role.name"
            :value="role.id"
          />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        @click="handleConfirm"
        >保存</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { SystemRoleOption } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';

const props = defineProps<{
  visible: boolean;
  userName: string;
  roleOptions: SystemRoleOption[];
  initialRoleIds: string[];
  submitting: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'confirm', roleIds: string[]): void;
}>();

const roleIds = ref<string[]>([]);

watch(
  () => props.visible,
  (val) => {
    if (val) {
      roleIds.value = [...props.initialRoleIds];
    }
  },
);

const handleConfirm = (): void => {
  emit('confirm', roleIds.value);
};
</script>

<style scoped>
.dialog-form :deep(.el-select),
.dialog-form :deep(.el-input) {
  width: 100%;
}
</style>
