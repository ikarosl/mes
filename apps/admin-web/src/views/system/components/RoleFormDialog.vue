<template>
  <el-dialog
    :model-value="visible"
    :title="editingRoleId ? '编辑角色' : '新增角色'"
    :width="DialogWidth.md"
    @update:model-value="$emit('update:visible', $event)"
    @closed="resetForm"
  >
    <el-form
      class="dialog-form"
      label-width="104px"
      :model="form"
    >
      <el-form-item
        label="角色名称"
        required
      >
        <el-input
          v-model="form.name"
          placeholder="请输入角色名称"
        />
      </el-form-item>
      <el-form-item
        label="角色编码"
        required
      >
        <el-input
          v-model="form.code"
          placeholder="请输入角色编码"
        />
      </el-form-item>
      <el-form-item label="状态">
        <el-switch
          v-model="form.enabled"
          active-text="启用"
          inactive-text="停用"
        />
      </el-form-item>
      <el-form-item label="角色说明">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="3"
          maxlength="255"
        />
      </el-form-item>
      <el-form-item
        v-if="editingRoleId"
        label="关联用户数"
      >
        <el-input
          :model-value="form.associatedUserCount"
          disabled
          class="readonly-field"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        @click="handleSubmit"
        >保存</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import { SYSTEM_STATUS } from '@company/constants';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';

export type RoleFormValue = {
  name: string;
  code: string;
  description: string;
  enabled: boolean;
  associatedUserCount: string;
};

defineProps<{
  visible: boolean;
  editingRoleId: string | null;
  submitting: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'save', data: RoleFormValue): void;
}>();

const initialForm = (): RoleFormValue => ({
  name: '',
  code: '',
  description: '',
  enabled: true,
  associatedUserCount: '0',
});

const form = reactive<RoleFormValue>(initialForm());

const resetForm = (): void => {
  Object.assign(form, initialForm());
};

const setForm = (row: {
  name: string;
  code: string;
  description: string | null;
  status: number;
  userCount: number;
}): void => {
  Object.assign(form, {
    name: row.name,
    code: row.code,
    description: row.description ?? '',
    enabled: row.status === SYSTEM_STATUS.enabled,
    associatedUserCount: String(row.userCount),
  });
};

const handleSubmit = async (): Promise<void> => {
  if (!form.name.trim() || !form.code.trim()) {
    EMessage.warning('请填写角色名称和角色编码');
    return;
  }
  emit('save', { ...form, name: form.name.trim(), code: form.code.trim() });
};

defineExpose({ setForm, resetForm });
</script>

<style scoped>
.dialog-form :deep(.el-input),
.dialog-form :deep(.el-select) {
  width: 100%;
}
.readonly-field :deep(.el-input__wrapper) {
  background: #f9fafb;
  box-shadow: 0 0 0 1px #e5e7eb inset;
}
</style>
