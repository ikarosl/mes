<template>
  <section>
    <div class="page-title">
      <div>
        <h2>角色管理</h2>
        <p>维护角色与权限的多对多关系</p>
      </div>
      <el-button
        v-if="auth.can(PERMISSIONS.system.roles.create)"
        type="primary"
        @click="createVisible = true"
        >新增角色</el-button
      >
    </div>
    <el-card
      ><el-table :data="roles"
        ><el-table-column prop="name" label="角色名称" /><el-table-column
          prop="code"
          label="角色编码"
        /><el-table-column prop="description" label="说明" /><el-table-column
          label="权限数量"
          width="100"
          ><template #default="{ row }">{{ row.permissionIds.length }}</template></el-table-column
        ><el-table-column label="操作" width="140"
          ><template #default="{ row }"
            ><el-button
              v-if="auth.can(PERMISSIONS.system.roles.assignPermissions)"
              link
              type="primary"
              @click="openPermissions(row)"
              >分配权限</el-button
            ></template
          ></el-table-column
        ></el-table
      ></el-card
    >
    <el-dialog v-model="createVisible" title="新增角色" width="640px"
      ><el-form label-width="90px"
        ><el-form-item label="名称"><el-input v-model="createForm.name" /></el-form-item
        ><el-form-item label="编码"><el-input v-model="createForm.code" /></el-form-item
        ><el-form-item label="说明"
          ><el-input v-model="createForm.description" /></el-form-item></el-form
      ><template #footer
        ><el-button @click="createVisible = false">取消</el-button
        ><el-button type="primary" @click="createRole">保存</el-button></template
      ></el-dialog
    >
    <el-dialog v-model="permissionVisible" title="分配权限" width="720px"
      ><el-checkbox-group v-model="selected"
        ><div v-for="item in permissions" :key="item.id" class="permission-row">
          <el-checkbox :value="item.id">{{ item.name }}（{{ item.code }}）</el-checkbox>
        </div></el-checkbox-group
      ><template #footer
        ><el-button @click="permissionVisible = false">取消</el-button
        ><el-button type="primary" @click="savePermissions">保存</el-button></template
      ></el-dialog
    >
  </section>
</template>
<script setup lang="ts">
import { onActivated, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { PERMISSIONS } from '@company/constants';
import type { PermissionListItem, RoleListItem } from '@company/contracts';
import { systemApi } from '../../api/system';
import { useAuthStore } from '../../stores/auth';
defineOptions({ name: 'RolesPage' });
const auth = useAuthStore();
const roles = ref<RoleListItem[]>([]);
const permissions = ref<PermissionListItem[]>([]);
const createVisible = ref(false);
const permissionVisible = ref(false);
const active = ref<RoleListItem | null>(null);
const selected = ref<string[]>([]);
const createForm = reactive({ name: '', code: '', description: '' });
const load = async () => {
  [roles.value, permissions.value] = await Promise.all([
    systemApi.roles(),
    systemApi.permissions(),
  ]);
};
const createRole = async () => {
  await systemApi.createRole(createForm);
  createVisible.value = false;
  ElMessage.success('角色已创建');
  await load();
};
const openPermissions = (row: RoleListItem) => {
  active.value = row;
  selected.value = [...row.permissionIds];
  permissionVisible.value = true;
};
const savePermissions = async () => {
  if (!active.value) return;
  await systemApi.setRolePermissions(active.value.id, selected.value);
  permissionVisible.value = false;
  ElMessage.success('权限已保存');
  await load();
};
onMounted(load);
onActivated(load);
</script>
