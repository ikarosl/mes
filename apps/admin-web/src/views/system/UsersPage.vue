<template>
  <section>
    <div class="page-title">
      <div>
        <h2>用户管理</h2>
        <p>维护账号、状态与角色关系</p>
      </div>
      <el-button v-if="auth.can(PERMISSIONS.system.users.create)" type="primary" @click="openCreate"
        >新增用户</el-button
      >
    </div>
    <el-card
      ><el-table v-loading="loading" :data="rows"
        ><el-table-column prop="username" label="账号" /><el-table-column
          prop="displayName"
          label="姓名"
        /><el-table-column prop="departmentName" label="部门" /><el-table-column label="角色"
          ><template #default="{ row }">{{
            row.roles.join('、') || '-'
          }}</template></el-table-column
        ><el-table-column label="状态" width="100"
          ><template #default="{ row }"
            ><el-tag :type="row.status === 1 ? 'success' : 'info'">{{
              row.status === 1 ? '启用' : '停用'
            }}</el-tag></template
          ></el-table-column
        ><el-table-column label="操作" width="130"
          ><template #default="{ row }"
            ><el-button
              v-if="auth.can(PERMISSIONS.system.users.update)"
              link
              type="primary"
              @click="toggle(row)"
              >{{ row.status === 1 ? '停用' : '启用' }}</el-button
            ></template
          ></el-table-column
        ></el-table
      ></el-card
    >
    <el-dialog v-model="visible" title="新增用户" width="640px"
      ><el-form label-width="90px"
        ><el-form-item label="账号"><el-input v-model="form.username" /></el-form-item
        ><el-form-item label="姓名"><el-input v-model="form.displayName" /></el-form-item
        ><el-form-item label="密码"
          ><el-input v-model="form.password" type="password" show-password /></el-form-item
        ><el-form-item label="角色"
          ><el-select v-model="form.roleIds" multiple
            ><el-option
              v-for="role in roles"
              :key="role.id"
              :label="role.name"
              :value="role.id" /></el-select></el-form-item></el-form
      ><template #footer
        ><el-button @click="visible = false">取消</el-button
        ><el-button type="primary" @click="save">保存</el-button></template
      ></el-dialog
    >
  </section>
</template>
<script setup lang="ts">
import { onActivated, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { PERMISSIONS } from '@company/constants';
import type { RoleListItem, UserListItem } from '@company/contracts';
import { systemApi } from '../../api/system';
import { useAuthStore } from '../../stores/auth';
defineOptions({ name: 'UsersPage' });
const auth = useAuthStore();
const rows = ref<UserListItem[]>([]);
const roles = ref<RoleListItem[]>([]);
const loading = ref(false);
const visible = ref(false);
const form = reactive({ username: '', displayName: '', password: '', roleIds: [] as string[] });
const load = async () => {
  loading.value = true;
  try {
    [rows.value, roles.value] = await Promise.all([systemApi.users(), systemApi.roles()]);
  } finally {
    loading.value = false;
  }
};
const openCreate = () => {
  Object.assign(form, { username: '', displayName: '', password: '', roleIds: [] });
  visible.value = true;
};
const save = async () => {
  await systemApi.createUser(form);
  visible.value = false;
  ElMessage.success('用户已创建');
  await load();
};
const toggle = async (row: UserListItem) => {
  await systemApi.setUserStatus(row.id, row.status === 1 ? 0 : 1);
  await load();
};
onMounted(load);
onActivated(load);
</script>
