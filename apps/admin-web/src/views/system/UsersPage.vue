<template>
  <section>
    <div class="page-title">
      <div>
        <h2>用户管理</h2>
        <p>维护账号、状态与角色关系</p>
      </div>
      <el-button
        v-if="auth.can(PERMISSIONS.system.users.create)"
        type="primary"
        :icon="Plus"
        @click="openCreate"
      >
        新增用户
      </el-button>
    </div>

    <div class="query-panel">
      <el-form
        class="query-form"
        :inline="true"
        :model="query"
      >
        <el-form-item label="关键字：">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="账号、姓名、部门、角色、邮箱或手机号"
          />
        </el-form-item>
        <el-form-item label="用户账号：">
          <el-input
            v-model="query.username"
            clearable
            placeholder="请输入用户账号"
          />
        </el-form-item>
        <el-form-item label="姓名：">
          <el-input
            v-model="query.displayName"
            clearable
            placeholder="请输入姓名"
          />
        </el-form-item>
        <el-form-item label="岗位：">
          <el-select
            v-model="query.roleId"
            clearable
            placeholder="请选择岗位"
          >
            <el-option
              v-for="role in roleOptions"
              :key="role.id"
              :label="role.name"
              :value="role.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态：">
          <el-select
            v-model="query.status"
            clearable
            placeholder="请选择状态"
          >
            <el-option
              label="启用"
              value="enabled"
            />
            <el-option
              label="停用"
              value="disabled"
            />
          </el-select>
        </el-form-item>
        <el-form-item class="query-actions">
          <el-button
            type="primary"
            @click="handleSearch"
            >查询</el-button
          >
          <el-button @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="table-panel">
      <div class="table-toolbar">
        <div class="batch-actions">
          <el-button
            type="primary"
            :icon="Plus"
            @click="openCreate"
            >新增用户</el-button
          >
          <el-button
            :icon="Key"
            @click="openBatchResetPassword"
            >重置密码</el-button
          >
        </div>
        <div class="table-tools">
          <el-tooltip
            content="刷新"
            placement="top"
          >
            <el-button
              :icon="Refresh"
              text
              circle
            />
          </el-tooltip>
          <el-tooltip
            content="筛选"
            placement="top"
          >
            <el-button
              :icon="Filter"
              text
              circle
              @click="focusFirstFilter"
            />
          </el-tooltip>
        </div>
      </div>

      <el-table
        :data="pagedUsers"
        class="data-table"
        @selection-change="handleSelectionChange"
      >
        <el-table-column
          type="selection"
          width="56"
        />
        <el-table-column
          prop="username"
          label="用户账号"
          min-width="110"
        />
        <el-table-column
          prop="displayName"
          label="姓名"
          min-width="90"
        />
        <el-table-column
          label="岗位"
          min-width="120"
        >
          <template #default="{ row }">{{ getPrimaryRoleName(row) }}</template>
        </el-table-column>
        <el-table-column
          label="角色"
          min-width="140"
        >
          <template #default="{ row }">{{ formatUserRoles(row) }}</template>
        </el-table-column>
        <el-table-column
          label="部门"
          min-width="120"
        >
          <template #default="{ row }">{{ row.departmentName ?? '-' }}</template>
        </el-table-column>
        <el-table-column
          label="状态"
          width="90"
        >
          <template #default="{ row }">
            <el-tag
              :type="row.status === 1 ? 'success' : 'info'"
              effect="light"
            >
              {{ row.status === 1 ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          label="最近登录"
          min-width="170"
        >
          <template #default="{ row }">{{ row.lastLoginAt ?? '-' }}</template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="250"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              @click="openEdit(row)"
              >编辑</el-button
            >
            <el-button
              link
              type="primary"
              @click="toggleStatus(row)"
            >
              {{ row.status === 1 ? '停用' : '启用' }}
            </el-button>
            <el-button
              link
              type="primary"
              @click="openResetPassword(row)"
              >重置密码</el-button
            >
            <el-button
              link
              type="primary"
              @click="openAssignRoles(row)"
              >分配角色</el-button
            >
          </template>
        </el-table-column>
      </el-table>

      <div class="table-footer">
        <span class="total-text">共 {{ filteredUsers.length }} 条</span>
        <el-select
          v-model="pageSize"
          class="page-size-select"
          @change="handlePageSizeChange"
        >
          <el-option
            label="10条/页"
            :value="10"
          />
          <el-option
            label="20条/页"
            :value="20"
          />
          <el-option
            label="50条/页"
            :value="50"
          />
        </el-select>
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="filteredUsers.length"
          layout="prev, pager, next"
        />
      </div>
    </div>

    <!-- 新增/编辑用户弹窗 -->
    <el-dialog
      v-model="userDialogVisible"
      :title="editingUserId ? '编辑用户' : '新增用户'"
      :width="DialogWidth.md"
      @closed="resetUserForm"
    >
      <el-form
        class="dialog-form"
        label-width="92px"
        :model="userForm"
      >
        <el-form-item
          label="用户账号"
          required
        >
          <el-input v-model="userForm.username" />
        </el-form-item>
        <el-form-item
          v-if="!editingUserId"
          label="初始密码"
          required
        >
          <el-input
            v-model="userForm.password"
            show-password
          />
        </el-form-item>
        <el-form-item
          label="姓名"
          required
        >
          <el-input v-model="userForm.displayName" />
        </el-form-item>
        <el-form-item label="部门">
          <el-select
            v-model="userForm.departmentId"
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
            v-model="userForm.roleIds"
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
          <el-input v-model="userForm.email" />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="userForm.mobile" />
        </el-form-item>
        <el-form-item
          v-if="!editingUserId"
          label="状态"
        >
          <el-switch
            v-model="userForm.enabled"
            active-text="启用"
            inactive-text="停用"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="userDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          @click="submitUser"
          >保存</el-button
        >
      </template>
    </el-dialog>

    <!-- 重置密码弹窗 -->
    <el-dialog
      v-model="passwordDialogVisible"
      :title="passwordDialogTitle"
      :width="DialogWidth.sm"
    >
      <el-form
        class="dialog-form"
        label-width="92px"
        :model="passwordForm"
      >
        <el-form-item
          label="新密码"
          required
        >
          <el-input
            v-model="passwordForm.password"
            show-password
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="passwordDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          @click="submitResetPassword"
          >确定</el-button
        >
      </template>
    </el-dialog>

    <!-- 分配角色弹窗 -->
    <el-dialog
      v-model="roleDialogVisible"
      title="分配角色"
      :width="DialogWidth.md"
    >
      <el-form
        class="dialog-form"
        label-width="92px"
      >
        <el-form-item label="用户">
          <el-input
            :model-value="assigningUser?.displayName ?? ''"
            disabled
          />
        </el-form-item>
        <el-form-item
          label="角色"
          required
        >
          <el-select
            v-model="roleForm.roleIds"
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
        <el-button @click="roleDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          @click="submitAssignRoles"
          >保存</el-button
        >
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue';
import { Filter, Key, Plus, Refresh } from '@element-plus/icons-vue';
import { PERMISSIONS } from '@company/constants';
import { DialogWidth } from '../../utils/dialog';
import { EMessage } from '../../utils/message';
import { useAuthStore } from '../../stores/auth';

defineOptions({ name: 'UsersPage' });

type UserForm = {
  username: string;
  password: string;
  displayName: string;
  departmentId: string | null;
  email: string;
  mobile: string;
  enabled: boolean;
  roleIds: string[];
};

const auth = useAuthStore();

/* ====== 静态演示数据（接口接入前使用） ====== */
const users = ref<Record<string, unknown>[]>([
  {
    id: '1',
    username: 'admin',
    displayName: '管理员',
    departmentName: '技术部',
    roleIds: ['1'],
    roles: ['admin'],
    status: 1,
    lastLoginAt: '2026-07-21 09:00:00',
    email: 'admin@company.com',
    mobile: '13800138000',
  },
  {
    id: '2',
    username: 'operator',
    displayName: '操作员',
    departmentName: '生产部',
    roleIds: ['2'],
    roles: ['operator'],
    status: 1,
    lastLoginAt: '2026-07-20 14:30:00',
    email: null,
    mobile: null,
  },
  {
    id: '3',
    username: 'inspector',
    displayName: '质检员',
    departmentName: '质量部',
    roleIds: ['3'],
    roles: ['inspector'],
    status: 0,
    lastLoginAt: null,
    email: null,
    mobile: null,
  },
]);
const departmentOptions = ref<Record<string, unknown>[]>([
  { id: '1', name: '技术部', code: 'tech' },
  { id: '2', name: '生产部', code: 'prod' },
  { id: '3', name: '质量部', code: 'qa' },
]);
const roleOptions = ref<Record<string, unknown>[]>([
  { id: '1', name: '系统管理员', code: 'admin' },
  { id: '2', name: '生产操作员', code: 'operator' },
  { id: '3', name: '质检员', code: 'inspector' },
]);
const selectedUsers = ref<Record<string, unknown>[]>([]);
const resettingUsers = ref<Record<string, unknown>[]>([]);
const assigningUser = ref<Record<string, unknown> | null>(null);

const userDialogVisible = ref(false);
const passwordDialogVisible = ref(false);
const roleDialogVisible = ref(false);
const editingUserId = ref<string | null>(null);
const currentPage = ref(1);
const pageSize = ref(10);
const query = reactive({
  keyword: '',
  username: '',
  displayName: '',
  roleId: '',
  status: '',
});
const userForm = reactive<UserForm>({
  username: '',
  password: '',
  displayName: '',
  departmentId: null,
  email: '',
  mobile: '',
  enabled: true,
  roleIds: [],
});
const passwordForm = reactive({ password: '' });
const roleForm = reactive({ roleIds: [] as string[] });

const roleNameMap = computed(() => new Map(roleOptions.value.map((r: any) => [r.id, r.name])));
const passwordDialogTitle = computed(() =>
  resettingUsers.value.length > 1 ? '批量重置密码' : '重置密码',
);

const getRoleName = (idOrCode: string) => roleNameMap.value.get(idOrCode) ?? idOrCode;

const formatUserRoles = (row: any) => {
  if (row.roleIds?.length) return row.roleIds.map(getRoleName).join('、');
  if (row.roles?.length) return row.roles.map(getRoleName).join('、');
  return '-';
};
const getPrimaryRoleName = (row: any) => {
  const id = row.roleIds?.[0];
  const code = row.roles?.[0];
  return id ? getRoleName(id) : code ? getRoleName(code) : '-';
};

const filteredUsers = computed(() =>
  users.value.filter((user: any) => {
    const kw = query.keyword.trim().toLowerCase();
    const uk = query.username.trim().toLowerCase();
    const nk = query.displayName.trim().toLowerCase();
    return (
      (!uk || user.username.toLowerCase().includes(uk)) &&
      (!nk || user.displayName.toLowerCase().includes(nk)) &&
      (!kw ||
        [
          user.username,
          user.displayName,
          user.departmentName ?? '',
          user.email ?? '',
          user.mobile ?? '',
          formatUserRoles(user),
        ].some((v: string) => v.toLowerCase().includes(kw))) &&
      (!query.roleId || user.roleIds?.includes(query.roleId)) &&
      (!query.status ||
        (query.status === 'enabled' && user.status === 1) ||
        (query.status === 'disabled' && user.status !== 1))
    );
  }),
);

const pagedUsers = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredUsers.value.slice(start, start + pageSize.value);
});

const resetUserForm = () => {
  Object.assign(userForm, {
    username: '',
    password: '',
    displayName: '',
    departmentId: null,
    email: '',
    mobile: '',
    enabled: true,
    roleIds: [],
  });
};
const handleSearch = () => {
  currentPage.value = 1;
};
const resetQuery = () => {
  Object.assign(query, { keyword: '', username: '', displayName: '', roleId: '', status: '' });
  currentPage.value = 1;
};
const handlePageSizeChange = () => {
  currentPage.value = 1;
};
const handleSelectionChange = (selection: any[]) => {
  selectedUsers.value = selection;
};

const openCreate = () => {
  editingUserId.value = null;
  resetUserForm();
  userDialogVisible.value = true;
};
const openEdit = (row: any) => {
  editingUserId.value = row.id;
  Object.assign(userForm, {
    username: row.username,
    password: '',
    displayName: row.displayName,
    departmentId: row.departmentId,
    email: row.email ?? '',
    mobile: row.mobile ?? '',
    enabled: row.status === 1,
    roleIds: row.roleIds ?? [],
  });
  userDialogVisible.value = true;
};
const submitUser = () => {
  if (!userForm.username.trim() || !userForm.displayName.trim()) {
    EMessage.warning('请填写用户账号和姓名');
    return;
  }
  if (!editingUserId.value && userForm.password.trim().length < 6) {
    EMessage.warning('初始密码至少 6 位');
    return;
  }
  EMessage.success(editingUserId.value ? '用户信息已更新' : '用户已新增');
  userDialogVisible.value = false;
};
const toggleStatus = (row: any) => {
  const text = row.status === 1 ? '停用' : '启用';
  EMessage.success(`用户已${text}`);
};
const openResetPassword = (row: any) => {
  resettingUsers.value = [row];
  passwordForm.password = '';
  passwordDialogVisible.value = true;
};
const openBatchResetPassword = () => {
  if (!selectedUsers.value.length) {
    EMessage.warning('请先选择需要重置密码的用户');
    return;
  }
  resettingUsers.value = [...selectedUsers.value];
  passwordForm.password = '';
  passwordDialogVisible.value = true;
};
const submitResetPassword = () => {
  if (passwordForm.password.trim().length < 6) {
    EMessage.warning('新密码至少 6 位');
    return;
  }
  EMessage.success('密码已重置');
  passwordDialogVisible.value = false;
};
const openAssignRoles = (row: any) => {
  assigningUser.value = row;
  roleForm.roleIds = [...(row.roleIds ?? [])];
  roleDialogVisible.value = true;
};
const submitAssignRoles = () => {
  if (!assigningUser.value) return;
  EMessage.success('角色已分配');
  roleDialogVisible.value = false;
};
const focusFirstFilter = async () => {
  await nextTick();
  document.querySelector<HTMLInputElement>('.query-panel input')?.focus();
};
</script>

<style scoped>
.page-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.page-title h2 {
  margin: 0;
  color: #283a50;
  font-size: 20px;
  font-weight: 600;
}
.page-title p {
  margin: 4px 0 0;
  color: #6b7280;
  font-size: 14px;
}

.query-panel,
.table-panel {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
}
.query-panel {
  padding: 20px 20px 8px;
  margin-bottom: 16px;
}
.query-form {
  display: flex;
  align-items: flex-start;
  gap: 10px 22px;
}
.query-form :deep(.el-form-item) {
  margin-right: 0;
  margin-bottom: 16px;
}
.query-form :deep(.el-form-item__label) {
  height: 34px;
  padding-right: 8px;
  color: #1f2937;
  font-size: 14px;
  font-weight: 500;
  line-height: 34px;
}
.query-form :deep(.el-input),
.query-form :deep(.el-select) {
  width: 142px;
}
.query-form :deep(.el-input__wrapper),
.query-form :deep(.el-select__wrapper) {
  min-height: 34px;
  border-radius: 6px;
  box-shadow: 0 0 0 1px #e5e7eb inset;
}
.query-actions {
  margin-left: auto;
}
.query-actions :deep(.el-button) {
  min-width: 67px;
  height: 32px;
  border-radius: 6px;
}
.query-actions :deep(.el-button + .el-button) {
  margin-left: 12px;
}

.table-panel {
  overflow: hidden;
}
.table-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 16px;
  border-bottom: 1px solid #e5e7eb;
}
.batch-actions {
  display: flex;
  gap: 8px;
}
.batch-actions :deep(.el-button) {
  height: 34px;
  border-radius: 6px;
}
.table-tools {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #6b7280;
}
.table-tools :deep(.el-button) {
  width: 20px;
  height: 20px;
  color: #6b7280;
}

.data-table {
  width: 100%;
  color: #1f2937;
  font-size: 14px;
}
.data-table :deep(.el-table__header th) {
  height: 48px;
  background: #f9fafb;
  color: #1f2937;
  font-weight: 600;
}
.data-table :deep(.el-table__row) {
  height: 48px;
}
.data-table :deep(.el-table__row:hover) {
  background: #f3f4f6;
}
.data-table :deep(.el-table__cell) {
  border-bottom-color: #e5e7eb;
}
.data-table :deep(.el-checkbox__inner) {
  width: 16px;
  height: 16px;
  border-color: #e5e7eb;
  border-radius: 4px;
}
.data-table :deep(.el-tag) {
  height: 22px;
  padding: 0 10px;
  border: 0;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  line-height: 22px;
}
.data-table :deep(.el-tag--success) {
  background: #dcfce7;
  color: #22c55e;
}
.data-table :deep(.el-tag--info) {
  background: #f3f4f6;
  color: #6b7280;
}
.data-table :deep(.el-button.is-link) {
  padding: 0;
  font-weight: 500;
}

.table-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  height: 56px;
  padding: 0 16px;
}
.total-text {
  color: #6b7280;
  font-size: 14px;
}
.page-size-select {
  width: 78px;
}
.page-size-select :deep(.el-select__wrapper) {
  min-height: 30px;
  padding: 0 7px;
  border-radius: 6px;
}
.table-footer :deep(.el-pagination) {
  gap: 4px;
}
.table-footer :deep(.el-pager li),
.table-footer :deep(.btn-prev),
.table-footer :deep(.btn-next) {
  min-width: 32px;
  height: 32px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}
.table-footer :deep(.el-pager li.is-active) {
  border-color: #306188;
  background: #306188;
  color: #ffffff;
}

.dialog-form :deep(.el-select),
.dialog-form :deep(.el-input) {
  width: 100%;
}

@media (max-width: 1120px) {
  .query-form {
    display: grid;
    grid-template-columns: repeat(2, minmax(240px, 1fr));
  }
  .query-actions {
    margin-left: 0;
  }
}
</style>
