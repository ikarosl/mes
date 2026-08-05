<template>
  <el-dialog
    :model-value="visible"
    title="分配角色"
    :width="DialogWidth.md"
    @update:model-value="$emit('update:visible', $event)"
    @open="$emit('refresh-roles')"
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
          @visible-change="(visible: boolean) => visible && $emit('refresh-roles')"
        >
          <el-option
            v-for="choice in roleChoices"
            :key="choice.value"
            :label="choice.option?.name ?? `${choice.value}（已失效）`"
            :value="choice.value"
            :disabled="choice.isUnavailable"
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
import { computed, ref, watch } from 'vue';
import type { SystemRoleOption } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import { buildLiveOptions, hasUnavailableSelection } from '../../../utils/live-options';
import { EMessage } from '../../../utils/message';

const props = defineProps<{
  visible: boolean;
  userName: string;
  roleOptions: SystemRoleOption[];
  initialRoleIds: string[];
  submitting: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'refresh-roles'): void;
  (e: 'confirm', roleIds: string[]): void;
}>();

const roleIds = ref<string[]>([]);
const roleChoices = computed(() =>
  buildLiveOptions(props.roleOptions, roleIds.value, (option) => option.id),
);

watch(
  () => props.visible,
  (val) => {
    if (val) {
      roleIds.value = [...props.initialRoleIds];
    }
  },
);

const handleConfirm = (): void => {
  if (hasUnavailableSelection(props.roleOptions, roleIds.value, (option) => option.id)) {
    EMessage.warning('角色已失效，请重新选择');
    return;
  }
  emit('confirm', roleIds.value);
};
</script>

<style scoped>
.dialog-form :deep(.el-select),
.dialog-form :deep(.el-input) {
  width: 100%;
}
</style>
