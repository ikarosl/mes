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
            placeholder="角色名称、编码或描述"
          />
        </el-form-item>
        <el-form-item label="角色名称：">
          <el-input
            v-model="query.name"
            clearable
            placeholder="请输入角色名称"
          />
        </el-form-item>
        <el-form-item label="角色编码：">
          <el-input
            v-model="query.code"
            clearable
            placeholder="请输入角色编码"
          />
        </el-form-item>
        <el-form-item label="状态：">
          <el-select
            v-model="query.status"
            placeholder="全部"
          >
            <el-option
              label="全部"
              value=""
            />
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
            v-if="auth.can(PERMISSIONS.system.roles.create)"
            type="primary"
            :icon="Plus"
            @click="openCreate"
            >新增角色</el-button
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
              @click="loadRoles"
            />
          </el-tooltip>
        </template>
      </TableToolbar>

      <el-table
        v-loading="loading"
        :data="roles"
        class="data-table"
        @selection-change="handleSelectionChange"
      >
        <el-table-column
          type="selection"
          width="56"
        />
        <el-table-column
          label="角色名称"
          min-width="120"
        >
          <template #default="{ row }">
            <span class="role-name">{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column
          prop="code"
          label="角色编码"
          min-width="150"
        />
        <el-table-column
          label="关联用户数"
          width="120"
          align="center"
        >
          <template #default="{ row }">{{ row.userCount }}</template>
        </el-table-column>
        <el-table-column
          label="状态"
          width="100"
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
          label="更新时间"
          min-width="170"
        >
          <template #default="{ row }">{{ formatDateTimeForDisplay(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="190"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button
              v-if="auth.can(PERMISSIONS.system.roles.update)"
              link
              type="primary"
              @click="openEdit(row)"
              >编辑</el-button
            >
            <el-button
              v-if="auth.can(PERMISSIONS.system.roles.assignPermissions)"
              link
              type="primary"
              @click="openAssignPermissions(row)"
              >分配权限</el-button
            >
            <el-button
              v-if="auth.can(PERMISSIONS.system.roles.delete)"
              link
              type="danger"
              :disabled="isRowPending(row.id)"
              @click="deleteRole(row)"
              >删除</el-button
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
          layout="prev, pager, next, jumper"
          @current-change="handlePageChange"
        />
      </div>
    </div>

    <!-- 新增/编辑角色弹窗 -->
    <RoleFormDialog
      ref="roleFormDialogRef"
      :visible="roleDialogVisible"
      :editing-role-id="editingRoleId"
      :submitting="submittingRole"
      @update:visible="roleDialogVisible = $event"
      @save="submitRole"
    />

    <!-- 分配权限弹窗 -->
    <RolePermissionDialog
      :visible="permissionDialogVisible"
      :role="editingRole"
      @update:visible="permissionDialogVisible = $event"
      @saved="loadRoles"
    />
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { PERMISSIONS, SYSTEM_STATUS } from '@company/constants';
import type { SystemRoleListItem } from '@company/contracts';
import TableToolbar from '../../components/TableToolbar.vue';
import { EMessage } from '../../utils/message';
import { RouteMessageBox as ElMessageBox } from '../../utils/route-message-box';
import { useRowPending } from '../../utils/useRowPending';
import { systemApi } from '../../api/system';
import { useAuthStore } from '../../stores/auth';
import { formatDateTimeForDisplay } from '../../utils/date';
import { useSystemRoles } from './composables/useSystemRoles';
import RoleFormDialog from './components/RoleFormDialog.vue';
import type { RoleFormValue } from './components/RoleFormDialog.vue';
import RolePermissionDialog from './components/RolePermissionDialog.vue';

defineOptions({ name: 'RolesPage' });

const auth = useAuthStore();
const {
  roles,
  loading,
  total,
  currentPage,
  pageSize,
  query,
  loadRoles,
  handleSearch,
  resetQuery,
  handlePageSizeChange,
  handlePageChange,
  handleSelectionChange,
} = useSystemRoles();

/** 行内写操作守卫（删除角色），同一行只允许一个在途（todo 3.5） */
const { isRowPending, beginRow, endRow } = useRowPending();

/* ----- dialog state ----- */
const roleDialogVisible = ref(false);
const permissionDialogVisible = ref(false);
const editingRoleId = ref<string | null>(null);
const editingRole = ref<SystemRoleListItem | null>(null);
const roleFormDialogRef = ref();
const submittingRole = ref(false);

/* ----- role CRUD ----- */
const openCreate = (): void => {
  editingRoleId.value = null;
  roleFormDialogRef.value?.resetForm();
  roleDialogVisible.value = true;
};

const openEdit = (row: SystemRoleListItem): void => {
  editingRoleId.value = row.id;
  roleFormDialogRef.value?.setForm(row);
  roleDialogVisible.value = true;
};

const submitRole = async (data: RoleFormValue): Promise<void> => {
  const payload = {
    name: data.name,
    code: data.code,
    description: data.description.trim() || null,
    status: data.enabled ? SYSTEM_STATUS.enabled : SYSTEM_STATUS.disabled,
  };
  submittingRole.value = true;
  try {
    if (editingRoleId.value) {
      await systemApi.updateRole(editingRoleId.value, payload);
    } else {
      await systemApi.createRole(payload);
    }
    EMessage.success(editingRoleId.value ? '角色已更新' : '角色已新增');
    roleDialogVisible.value = false;
    await loadRoles();
  } catch (error) {
    EMessage.error(error, '角色保存失败');
  } finally {
    submittingRole.value = false;
  }
};

const deleteRole = async (row: SystemRoleListItem): Promise<void> => {
  if (!beginRow(row.id)) return;
  try {
    await ElMessageBox.confirm(
      `确定删除角色"${row.name}"吗？此操作将停用并软删除该角色。`,
      '删除角色',
      { type: 'warning' },
    );
    await systemApi.deleteRole(row.id);
    EMessage.success('角色已删除');
    await loadRoles();
  } catch (error: unknown) {
    if (error !== 'cancel' && error !== 'close') {
      EMessage.error(error, '角色删除失败');
    }
  } finally {
    endRow(row.id);
  }
};

/* ----- permissions ----- */
const openAssignPermissions = (row: SystemRoleListItem): void => {
  editingRole.value = row;
  editingRoleId.value = row.id;
  permissionDialogVisible.value = true;
};

onMounted(loadRoles);
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
  gap: 16px 34px;
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
.query-form :deep(.el-input) {
  width: 132px;
}
.query-form :deep(.el-select) {
  width: 184px;
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
  min-width: 76px;
  height: 34px;
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
.role-name {
  display: inline-block;
  max-width: 120px;
  color: #1f2937;
  font-weight: 600;
  line-height: 1.45;
  white-space: normal;
}
.data-table :deep(.el-tag) {
  height: 24px;
  min-width: 52px;
  padding: 0 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  line-height: 24px;
  text-align: center;
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
  width: 86px;
}
.page-size-select :deep(.el-select__wrapper) {
  min-height: 30px;
  border-radius: 6px;
}
.table-footer :deep(.el-pagination) {
  gap: 6px;
}
.table-footer :deep(.el-pager li),
.table-footer :deep(.btn-prev),
.table-footer :deep(.btn-next) {
  min-width: 32px;
  height: 32px;
  border-radius: 6px;
}
.table-footer :deep(.el-pager li.is-active) {
  border: 1px solid #306188;
  background: #ffffff;
  color: #306188;
}
.table-footer :deep(.el-pagination__jump) {
  margin-left: 12px;
  color: #6b7280;
}
.table-footer :deep(.el-pagination__editor) {
  width: 48px;
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
