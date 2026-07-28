<template>
  <el-dialog
    :model-value="visible"
    :title="editingUserId ? '编辑用户' : '新增用户'"
    :width="DialogWidth.md"
    @update:model-value="$emit('update:visible', $event)"
    @closed="resetForm"
  >
    <el-form
      class="dialog-form"
      label-width="92px"
      :model="form"
    >
      <el-form-item
        label="用户账号"
        required
      >
        <el-input v-model="form.username" />
      </el-form-item>
      <el-form-item
        v-if="!editingUserId"
        label="初始密码"
        required
      >
        <el-input
          v-model="form.password"
          show-password
        />
      </el-form-item>
      <el-form-item
        label="姓名"
        required
      >
        <el-input v-model="form.displayName" />
      </el-form-item>
      <el-form-item label="部门">
        <el-select
          v-model="form.departmentId"
          clearable
          placeholder="请选择部门"
        >
          <el-option
            v-for="department in departmentOptions"
            :key="department.id"
            :label="department.name"
            :value="department.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item
        v-if="!editingUserId"
        label="角色"
      >
        <el-select
          v-model="form.roleIds"
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
      <el-form-item label="邮箱">
        <el-input v-model="form.email" />
      </el-form-item>
      <el-form-item label="手机号">
        <el-input v-model="form.mobile" />
      </el-form-item>
      <el-form-item
        v-if="!editingUserId"
        label="状态"
      >
        <el-switch
          v-model="form.enabled"
          active-text="启用"
          inactive-text="停用"
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
import type { SystemDepartmentOption, SystemRoleOption } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';

export type UserFormValue = {
  username: string;
  password: string;
  displayName: string;
  departmentId: string | null;
  email: string;
  mobile: string;
  enabled: boolean;
  roleIds: string[];
};

const props = defineProps<{
  visible: boolean;
  editingUserId: string | null;
  departmentOptions: SystemDepartmentOption[];
  roleOptions: SystemRoleOption[];
  submitting: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'save', data: UserFormValue): void;
}>();

const initialForm = (): UserFormValue => ({
  username: '',
  password: '',
  displayName: '',
  departmentId: null,
  email: '',
  mobile: '',
  enabled: true,
  roleIds: [],
});

const form = reactive<UserFormValue>(initialForm());

const resetForm = (): void => {
  Object.assign(form, initialForm());
};

const setForm = (row: {
  username: string;
  displayName: string;
  departmentId: string | null;
  email: string | null;
  mobile: string | null;
  status: number;
  roleIds: string[];
}): void => {
  Object.assign(form, {
    username: row.username,
    password: '',
    displayName: row.displayName,
    departmentId: row.departmentId,
    email: row.email ?? '',
    mobile: row.mobile ?? '',
    enabled: row.status === SYSTEM_STATUS.enabled,
    roleIds: row.roleIds ?? [],
  });
};

const handleSubmit = async (): Promise<void> => {
  if (!form.username.trim() || !form.displayName.trim()) {
    EMessage.warning('请填写用户账号和姓名');
    return;
  }
  if (!props.editingUserId && form.password.trim().length < 6) {
    EMessage.warning('初始密码至少 6 位');
    return;
  }
  emit('save', { ...form, username: form.username.trim(), displayName: form.displayName.trim() });
};

defineExpose({ setForm, resetForm });
</script>

<style scoped>
.dialog-form :deep(.el-select),
.dialog-form :deep(.el-input) {
  width: 100%;
}
</style>
