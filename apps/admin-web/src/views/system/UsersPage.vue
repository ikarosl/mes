<template>
  <section>
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
            @visible-change="(visible: boolean) => visible && refreshRoles()"
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
      <TableToolbar>
        <template #actions>
          <el-button
            v-if="auth.can(PERMISSIONS.system.users.create)"
            type="primary"
            :icon="Plus"
            @click="openCreate"
            >新增用户</el-button
          >
          <el-button
            v-if="auth.can(PERMISSIONS.system.users.resetPassword)"
            :icon="Key"
            @click="openBatchResetPassword"
            >重置密码</el-button
          >
        </template>
        <template #tools>
          <el-tooltip
            content="刷新"
            placement="top"
          >
            <el-button
              :icon="Refresh"
              text
              circle
              @click="loadUsers"
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
        </template>
      </TableToolbar>

      <el-table
        v-loading="loading"
        :data="users"
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
              :type="row.status === SYSTEM_STATUS.enabled ? 'success' : 'info'"
              effect="light"
            >
              {{ row.status === SYSTEM_STATUS.enabled ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          label="最近登录"
          min-width="170"
        >
          <template #default="{ row }">{{ formatDateTimeForDisplay(row.lastLoginAt) }}</template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="250"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button
              v-if="auth.can(PERMISSIONS.system.users.update)"
              link
              type="primary"
              @click="openEdit(row)"
              >编辑</el-button
            >
            <el-button
              v-if="auth.can(PERMISSIONS.system.users.update)"
              link
              type="primary"
              :disabled="isRowPending(row.id)"
              @click="toggleStatus(row)"
            >
              {{ row.status === SYSTEM_STATUS.enabled ? '停用' : '启用' }}
            </el-button>
            <el-button
              v-if="auth.can(PERMISSIONS.system.users.resetPassword)"
              link
              type="primary"
              @click="openResetPassword(row)"
              >重置密码</el-button
            >
            <el-button
              v-if="auth.can(PERMISSIONS.system.users.assignRoles)"
              link
              type="primary"
              @click="openAssignRoles(row)"
              >分配角色</el-button
            >
          </template>
        </el-table-column>
      </el-table>

      <div class="table-footer">
        <span class="total-text">共 {{ total }} 条</span>
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
          :total="total"
          layout="prev, pager, next"
          @current-change="handlePageChange"
        />
      </div>
    </div>

    <!-- 新增/编辑用户弹窗 -->
    <UserFormDialog
      ref="userFormDialogRef"
      :visible="userDialogVisible"
      :editing-user-id="editingUserId"
      :role-options="roleOptions"
      :submitting="submittingUser"
      @update:visible="userDialogVisible = $event"
      @refresh-roles="refreshRoles"
      @save="submitUser"
    />

    <!-- 重置密码弹窗 -->
    <UserPasswordDialog
      :visible="passwordDialogVisible"
      :is-batch="resettingUsers.length > 1"
      :submitting="submittingPassword"
      @update:visible="passwordDialogVisible = $event"
      @confirm="submitResetPassword"
    />

    <!-- 分配角色弹窗 -->
    <UserRoleDialog
      :visible="roleDialogVisible"
      :user-name="assigningUser?.displayName ?? ''"
      :role-options="roleOptions"
      :initial-role-ids="assigningUser?.roleIds ?? []"
      :submitting="submittingRoles"
      @update:visible="roleDialogVisible = $event"
      @refresh-roles="refreshRoles"
      @confirm="submitAssignRoles"
    />
  </section>
</template>

<script setup lang="ts">
import { nextTick, onActivated, onMounted, ref } from 'vue';
import { Filter, Key, Plus, Refresh } from '@element-plus/icons-vue';
import { PERMISSIONS, SYSTEM_STATUS } from '@company/constants';
import type { SystemUserListItem } from '@company/contracts';
import TableToolbar from '../../components/TableToolbar.vue';
import { EMessage } from '../../utils/message';
import { RouteMessageBox as ElMessageBox } from '../../utils/route-message-box';
import { useRowPending } from '../../utils/useRowPending';
import { systemApi } from '../../api/system';
import { useAuthStore } from '../../stores/auth';
import { formatDateTimeForDisplay } from '../../utils/date';
import { useRoleOptions } from '../../composables/options/useRoleOptions';
import { useSystemUsers } from './composables/useSystemUsers';
import UserFormDialog from './components/UserFormDialog.vue';
import type { UserFormValue } from './components/UserFormDialog.vue';
import UserPasswordDialog from './components/UserPasswordDialog.vue';
import UserRoleDialog from './components/UserRoleDialog.vue';

defineOptions({ name: 'UsersPage' });

const auth = useAuthStore();
/**
 * 角色候选由页面持有：岗位筛选、列表角色名、用户表单与分配角色弹窗共享（T1 提升到页面），
 * 页面激活只刷新角色；部门候选唯一消费者是用户表单弹窗，由弹窗自持（见 UserFormDialog）。
 */
const { options: roleOptions, refresh: refreshRoles } = useRoleOptions();
const {
  users,
  selectedUsers,
  loading,
  total,
  currentPage,
  pageSize,
  query,
  formatUserRoles,
  getPrimaryRoleName,
  loadUsers,
  handleSearch,
  resetQuery,
  handlePageSizeChange,
  handlePageChange,
  handleSelectionChange,
} = useSystemUsers(roleOptions);

/** 行内写操作守卫（启停用户），同一行只允许一个在途（todo 3.5） */
const { isRowPending, beginRow, endRow } = useRowPending();

/* ----- dialog state ----- */
const userDialogVisible = ref(false);
const passwordDialogVisible = ref(false);
const roleDialogVisible = ref(false);
const editingUserId = ref<string | null>(null);
const resettingUsers = ref<SystemUserListItem[]>([]);
const assigningUser = ref<SystemUserListItem | null>(null);
const userFormDialogRef = ref();
const submittingUser = ref(false);
const submittingPassword = ref(false);
const submittingRoles = ref(false);

/* ----- user CRUD ----- */
// 弹窗打开时，部门候选由 UserFormDialog 自持刷新，角色候选通过 @refresh-roles 交给页面刷新；
// openCreate/openEdit 不再主动 refresh，避免每次打开重复请求候选（P2）。
const openCreate = (): void => {
  editingUserId.value = null;
  userFormDialogRef.value?.resetForm();
  userDialogVisible.value = true;
};

const openEdit = (row: SystemUserListItem): void => {
  editingUserId.value = row.id;
  userFormDialogRef.value?.setForm(row);
  userDialogVisible.value = true;
};

const submitUser = async (data: UserFormValue): Promise<void> => {
  submittingUser.value = true;
  try {
    if (editingUserId.value) {
      await systemApi.updateUser(editingUserId.value, {
        username: data.username,
        displayName: data.displayName,
        departmentId: data.departmentId,
        email: data.email.trim() || null,
        mobile: data.mobile.trim() || null,
      });
    } else {
      await systemApi.createUser({
        username: data.username,
        password: data.password,
        displayName: data.displayName,
        departmentId: data.departmentId,
        email: data.email.trim() || null,
        mobile: data.mobile.trim() || null,
        status: data.enabled ? SYSTEM_STATUS.enabled : SYSTEM_STATUS.disabled,
        roleIds: data.roleIds,
      });
    }
    EMessage.success(editingUserId.value ? '用户信息已更新' : '用户已新增');
    userDialogVisible.value = false;
    // 保存成功只刷新用户列表；候选的新鲜度由弹窗打开/下拉展开时的刷新保证（P2）
    await loadUsers();
  } catch (error) {
    EMessage.error(error, '用户保存失败');
  } finally {
    submittingUser.value = false;
  }
};

const toggleStatus = async (row: SystemUserListItem): Promise<void> => {
  if (!beginRow(row.id)) return;
  const text = row.status === SYSTEM_STATUS.enabled ? '停用' : '启用';
  try {
    await ElMessageBox.confirm(`确定${text}用户"${row.displayName}"吗？`, `${text}用户`, {
      type: 'warning',
    });
    await systemApi.setUserStatus(row.id, {
      status: row.status === SYSTEM_STATUS.enabled ? SYSTEM_STATUS.disabled : SYSTEM_STATUS.enabled,
    });
    EMessage.success(`用户已${text}`);
    await loadUsers();
  } catch (error: unknown) {
    if (error !== 'cancel' && error !== 'close') {
      EMessage.error(error, `${text}用户失败`);
    }
  } finally {
    endRow(row.id);
  }
};

/* ----- password ----- */
const openResetPassword = (row: SystemUserListItem): void => {
  resettingUsers.value = [row];
  passwordDialogVisible.value = true;
};

const openBatchResetPassword = (): void => {
  if (!selectedUsers.value.length) {
    EMessage.warning('请先选择需要重置密码的用户');
    return;
  }
  resettingUsers.value = [...selectedUsers.value];
  passwordDialogVisible.value = true;
};

const submitResetPassword = async (password: string): Promise<void> => {
  submittingPassword.value = true;
  try {
    await Promise.all(
      resettingUsers.value.map((user) => systemApi.resetUserPassword(user.id, { password })),
    );
    EMessage.success('密码已重置，相关登录会话已失效');
    passwordDialogVisible.value = false;
  } catch (error) {
    EMessage.error(error, '密码重置失败');
  } finally {
    submittingPassword.value = false;
  }
};

/* ----- role assignment ----- */
// 角色候选刷新由 UserRoleDialog @open 统一触发（@refresh-roles），此处不再主动 refresh（P2）。
const openAssignRoles = (row: SystemUserListItem): void => {
  assigningUser.value = row;
  roleDialogVisible.value = true;
};

const submitAssignRoles = async (roleIds: string[]): Promise<void> => {
  if (!assigningUser.value) return;
  submittingRoles.value = true;
  try {
    await systemApi.setUserRoles(assigningUser.value.id, { roleIds });
    EMessage.success('角色已分配');
    roleDialogVisible.value = false;
    await loadUsers();
  } catch (error) {
    EMessage.error(error, '角色分配失败');
  } finally {
    submittingRoles.value = false;
  }
};

const focusFirstFilter = async (): Promise<void> => {
  await nextTick();
  document.querySelector<HTMLInputElement>('.query-panel input')?.focus();
};

onMounted(loadUsers);
/** 页面激活：只刷新页面持有的角色候选；部门候选由用户表单弹窗自持（T1） */
onActivated(() => {
  void refreshRoles();
});
</script>

<style scoped>
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
