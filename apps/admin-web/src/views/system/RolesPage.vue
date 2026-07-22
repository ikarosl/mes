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
        :icon="Plus"
        @click="openCreate"
      >
        新增角色
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
      <div class="table-toolbar">
        <el-button
          v-if="auth.can(PERMISSIONS.system.roles.create)"
          type="primary"
          :icon="Plus"
          @click="openCreate"
          >新增角色</el-button
        >
        <div class="table-tools">
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
        </div>
      </div>

      <el-table
        v-loading="loading"
        :data="pagedRoles"
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
          <template #default="{ row }">{{ getAssociatedUserCount(row) }}</template>
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
          <template #default="{ row }">{{ row.updatedAt ?? '-' }}</template>
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
              @click="deleteRole(row)"
              >删除</el-button
            >
          </template>
        </el-table-column>
      </el-table>

      <div class="table-footer">
        <span class="total-text">共 {{ filteredRoles.length }} 条</span>
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
          :total="filteredRoles.length"
          layout="prev, pager, next, jumper"
        />
      </div>
    </div>

    <!-- 新增/编辑角色弹窗 -->
    <el-dialog
      v-model="roleDialogVisible"
      :title="editingRoleId ? '编辑角色' : '新增角色'"
      :width="DialogWidth.md"
    >
      <el-form
        class="dialog-form"
        label-width="104px"
        :model="roleForm"
      >
        <el-form-item
          label="角色名称"
          required
        >
          <el-input
            v-model="roleForm.name"
            placeholder="请输入角色名称"
          />
        </el-form-item>
        <el-form-item
          label="角色编码"
          required
        >
          <el-input
            v-model="roleForm.code"
            placeholder="请输入角色编码"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch
            v-model="roleForm.enabled"
            active-text="启用"
            inactive-text="停用"
          />
        </el-form-item>
        <el-form-item label="角色说明">
          <el-input
            v-model="roleForm.description"
            type="textarea"
            :rows="3"
            maxlength="255"
          />
        </el-form-item>
        <el-form-item label="关联用户数">
          <el-input
            :model-value="roleForm.associatedUserCount"
            disabled
            class="readonly-field"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="roleDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          @click="submitRole"
          >保存</el-button
        >
      </template>
    </el-dialog>

    <!-- 分配权限弹窗 -->
    <el-dialog
      v-model="permissionDialogVisible"
      title="分配权限"
      :width="DialogWidth.xl"
      class="permission-dialog"
      :close-on-click-modal="false"
      @closed="resetPermissionDialog"
    >
      <div class="perm-role-header">
        <div class="perm-role-info-row">
          <span class="perm-role-info-item">
            <span class="perm-info-label">角色名称：</span>
            <span class="perm-info-value">{{ editingRole?.name }}</span>
          </span>
          <span class="perm-role-info-item">
            <span class="perm-info-label">角色编码：</span>
            <span class="perm-info-value">{{ editingRole?.code }}</span>
          </span>
          <span class="perm-role-info-item perm-role-desc-item">
            <span class="perm-info-label">描述：</span>
            <span class="perm-info-value">{{ editingRole?.description ?? '-' }}</span>
          </span>
        </div>
        <div class="perm-role-actions">
          <el-button
            type="primary"
            :disabled="permissionLoading"
            @click="submitRolePermissions"
          >
            保存
          </el-button>
          <el-button
            :disabled="permissionLoading"
            @click="resetAssignedPermissions"
          >
            重置
          </el-button>
        </div>
      </div>

      <div class="perm-section-title">权限配置</div>

      <div class="perm-body">
        <div class="perm-tree-panel">
          <div class="perm-panel-header">模块目录</div>
          <div class="perm-tree-search">
            <el-input
              v-model="permissionKeyword"
              clearable
              :prefix-icon="Search"
              placeholder="请输入模块名称"
            />
          </div>
          <el-tree
            ref="permissionTreeRef"
            :data="permissionTree"
            :props="treeProps"
            :filter-node-method="filterPermissionNode"
            :expand-on-click-node="false"
            node-key="id"
            highlight-current
            @node-click="handlePermissionNodeClick"
          >
            <template #default="{ node, data }">
              <span
                class="perm-tree-node"
                :class="{
                  'is-active': activePermissionNode?.id === data.id,
                  'is-leaf-permission': node.level >= 3,
                }"
              >
                <el-checkbox
                  :model-value="isPermissionChecked(data)"
                  :indeterminate="isPermissionIndeterminate(data)"
                  @click.stop
                  @change="handlePermissionCheck(data, $event)"
                />
                <span class="perm-tree-label">{{ data.name }}</span>
              </span>
            </template>
          </el-tree>
        </div>

        <div class="perm-detail-panel">
          <div class="perm-detail-header">
            <div>
              <span class="perm-detail-title">{{ activePermissionNode?.name ?? '权限详情' }}</span>
              <span
                v-if="activePermissionNode"
                class="perm-detail-count"
              >
                权限列表（已选择 {{ activeScopeCheckedCount }} 项）
              </span>
            </div>
            <div
              v-if="permissionDetailRows.length"
              class="perm-detail-actions"
            >
              <el-button
                link
                type="primary"
                @click="setPermissionDetailExpanded(true)"
              >
                展开全部
              </el-button>
              <span class="perm-action-divider">|</span>
              <el-button
                link
                type="primary"
                @click="setPermissionDetailExpanded(false)"
              >
                收起全部
              </el-button>
            </div>
          </div>
          <el-table
            v-if="permissionDetailRows.length"
            ref="permissionDetailTableRef"
            :data="permissionDetailRows"
            class="perm-table"
            row-key="id"
            default-expand-all
            :tree-props="{ children: 'children' }"
          >
            <el-table-column
              label="权限名称"
              min-width="220"
            >
              <template #default="{ row }">
                <div class="perm-name-cell">
                  <el-checkbox
                    :model-value="isPermissionChecked(row)"
                    :indeterminate="isPermissionIndeterminate(row)"
                    @click.stop
                    @change="handlePermissionCheck(row, $event)"
                  />
                  <span>{{ row.name }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column
              prop="code"
              label="权限编码"
              min-width="260"
            />
            <el-table-column
              label="权限描述"
              min-width="220"
            >
              <template #default="{ row }">{{ getPermissionDescription(row) }}</template>
            </el-table-column>
          </el-table>
          <div
            v-else
            class="perm-empty"
          >
            请从左侧选择一个功能模块查看权限详情
          </div>
        </div>
      </div>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { ElMessageBox } from 'element-plus';
import { Plus, Refresh, Search } from '@element-plus/icons-vue';
import { PERMISSIONS, SYSTEM_STATUS } from '@company/constants';
import type {
  SystemPermissionListItem,
  SystemPermissionTreeNode,
  SystemRoleListItem,
} from '@company/contracts';
import { systemApi } from '../../api/system';
import { DialogWidth } from '../../utils/dialog';
import { EMessage } from '../../utils/message';
import { useAuthStore } from '../../stores/auth';

defineOptions({ name: 'RolesPage' });

const auth = useAuthStore();

const roles = ref<SystemRoleListItem[]>([]);
const loading = ref(false);
const submitting = ref(false);
const selectedRoles = ref<any[]>([]);
const roleDialogVisible = ref(false);
const permissionDialogVisible = ref(false);
const editingRoleId = ref<string | null>(null);

/* 权限弹窗状态 */
const permissionTree = ref<any[]>([]);
const editingRole = ref<any | null>(null);
const permissionTreeRef = ref();
const permissionDetailTableRef = ref();
const permissionKeyword = ref('');
const permissionLoading = ref(false);
const checkedPermissionIds = ref<Set<string>>(new Set());
const initialPermissionIds = ref<string[]>([]);
const activePermissionNode = ref<any | null>(null);

const treeProps = { label: 'name', children: 'children' };

const permissionRelations = computed(() => {
  const levelById = new Map<string, number>();
  const walk = (nodes: any[], level: number) => {
    for (const node of nodes) {
      levelById.set(node.id, level);
      walk(node.children ?? [], level + 1);
    }
  };
  walk(permissionTree.value, 1);
  return { levelById };
});

const permissionDetailRows = computed<any[]>(() => {
  if (!activePermissionNode.value) return [];
  const lv = permissionRelations.value.levelById.get(activePermissionNode.value.id) ?? 1;
  if (lv >= 3) return [];
  return lv === 1 ? (activePermissionNode.value.children ?? []) : [activePermissionNode.value];
});

const activeScopeCheckedCount = computed(() => {
  const ids = new Set<string>();
  for (const row of permissionDetailRows.value) {
    for (const id of collectPermissionIds(row)) ids.add(id);
  }
  let count = 0;
  for (const id of ids) {
    if (checkedPermissionIds.value.has(id)) count++;
  }
  return count;
});

const currentPage = ref(1);
const pageSize = ref(10);
const query = reactive({ keyword: '', name: '', code: '', status: '' });
const roleForm = reactive({
  name: '',
  code: '',
  description: '',
  enabled: true,
  associatedUserCount: '0',
});

const filteredRoles = computed(() =>
  roles.value.filter((role: any) => {
    const kw = query.keyword.trim().toLowerCase();
    const nk = query.name.trim().toLowerCase();
    const ck = query.code.trim().toLowerCase();
    return (
      (!nk || role.name.toLowerCase().includes(nk)) &&
      (!ck || role.code.toLowerCase().includes(ck)) &&
      (!kw ||
        [role.name, role.code, role.description ?? ''].some((v: string) =>
          v.toLowerCase().includes(kw),
        )) &&
      (!query.status ||
        (query.status === 'enabled' && role.status === SYSTEM_STATUS.enabled) ||
        (query.status === 'disabled' && role.status !== SYSTEM_STATUS.enabled))
    );
  }),
);

const pagedRoles = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredRoles.value.slice(start, start + pageSize.value);
});

const getAssociatedUserCount = (role: SystemRoleListItem) => role.userCount;

const handleSearch = () => {
  currentPage.value = 1;
};
const resetQuery = () => {
  Object.assign(query, { keyword: '', name: '', code: '', status: '' });
  currentPage.value = 1;
};
const handlePageSizeChange = () => {
  currentPage.value = 1;
};
const handleSelectionChange = (selection: any[]) => {
  selectedRoles.value = selection;
};

const openCreate = () => {
  editingRoleId.value = null;
  Object.assign(roleForm, {
    name: '',
    code: '',
    description: '',
    enabled: true,
    associatedUserCount: '0',
  });
  roleDialogVisible.value = true;
};
const openEdit = (row: any) => {
  editingRoleId.value = row.id;
  Object.assign(roleForm, {
    name: row.name,
    code: row.code,
    description: row.description ?? '',
    enabled: row.status === SYSTEM_STATUS.enabled,
    associatedUserCount: String(getAssociatedUserCount(row)),
  });
  roleDialogVisible.value = true;
};
const loadRoles = async () => {
  loading.value = true;
  try {
    roles.value = await systemApi.roles();
  } catch (error) {
    EMessage.error(error, '角色列表加载失败');
  } finally {
    loading.value = false;
  }
};
const submitRole = async () => {
  if (!roleForm.name.trim() || !roleForm.code.trim()) {
    EMessage.warning('请填写角色名称和角色编码');
    return;
  }
  submitting.value = true;
  try {
    const payload = {
      name: roleForm.name.trim(),
      code: roleForm.code.trim(),
      description: roleForm.description.trim() || null,
      status: roleForm.enabled ? SYSTEM_STATUS.enabled : SYSTEM_STATUS.disabled,
    };
    if (editingRoleId.value) await systemApi.updateRole(editingRoleId.value, payload);
    else await systemApi.createRole(payload);
    EMessage.success(editingRoleId.value ? '角色已更新' : '角色已新增');
    roleDialogVisible.value = false;
    await loadRoles();
  } catch (error) {
    EMessage.error(error, '角色保存失败');
  } finally {
    submitting.value = false;
  }
};

const collectPermissionIds = (node: any): string[] => [
  node.id,
  ...(node.children ?? []).flatMap((c: any) => collectPermissionIds(c)),
];

const isPermissionChecked = (node: any) => {
  const ids = collectPermissionIds(node);
  return ids.length > 0 && ids.every((id) => checkedPermissionIds.value.has(id));
};
const isPermissionIndeterminate = (node: any) => {
  const ids = collectPermissionIds(node);
  if (ids.length <= 1) return false;
  const cnt = ids.filter((id) => checkedPermissionIds.value.has(id)).length;
  return cnt > 0 && cnt < ids.length;
};
const handlePermissionCheck = (node: any, checked: boolean | string | number) => {
  const next = new Set(checkedPermissionIds.value);
  for (const id of collectPermissionIds(node)) {
    if (checked) next.add(id);
    else next.delete(id);
  }
  checkedPermissionIds.value = next;
};
const handlePermissionNodeClick = (node: any) => {
  const lv = permissionRelations.value.levelById.get(node.id) ?? 1;
  if (lv >= 3) {
    void nextTick(() => {
      permissionTreeRef.value?.setCurrentKey?.(activePermissionNode.value?.id ?? null);
    });
    return;
  }
  activePermissionNode.value = node;
};
const filterPermissionNode = (kw: string, node: any) => {
  const n = kw.trim().toLowerCase();
  if (!n) return true;
  return node.name.toLowerCase().includes(n) || node.code.toLowerCase().includes(n);
};
const getPermissionDescription = (node: any) => {
  if (node.apiMethod && node.apiPath) return `${node.apiMethod} ${node.apiPath}`;
  if (node.routePath) return `页面路由 ${node.routePath}`;
  return '权限分组';
};
const setPermissionDetailExpanded = async (expanded: boolean) => {
  await nextTick();
  const toggle = (rows: any[]) => {
    for (const r of rows) {
      permissionDetailTableRef.value?.toggleRowExpansion?.(r, expanded);
      toggle(r.children ?? []);
    }
  };
  toggle(permissionDetailRows.value);
};
const resetAssignedPermissions = () => {
  checkedPermissionIds.value = new Set(initialPermissionIds.value);
};
const resetPermissionDialog = () => {
  editingRole.value = null;
  activePermissionNode.value = null;
  permissionTree.value = [];
  checkedPermissionIds.value = new Set();
  initialPermissionIds.value = [];
  permissionKeyword.value = '';
};
const buildPermissionTree = (items: SystemPermissionListItem[]): SystemPermissionTreeNode[] => {
  const nodes = new Map(
    items.map((item) => [item.id, { ...item, children: [] } as SystemPermissionTreeNode]),
  );
  const roots: SystemPermissionTreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
};
const openAssignPermissions = async (row: SystemRoleListItem) => {
  editingRole.value = row;
  editingRoleId.value = row.id;
  permissionDialogVisible.value = true;
  permissionLoading.value = true;
  try {
    const [permissions, detail] = await Promise.all([
      systemApi.permissions(),
      systemApi.rolePermissions(row.id),
    ]);
    permissionTree.value = buildPermissionTree(permissions);
    checkedPermissionIds.value = new Set(detail.permissionIds);
    initialPermissionIds.value = [...detail.permissionIds];
    activePermissionNode.value = permissionTree.value[0] ?? null;
  } catch (error) {
    EMessage.error(error, '角色权限加载失败');
    permissionDialogVisible.value = false;
  } finally {
    permissionLoading.value = false;
  }
};
const submitRolePermissions = async () => {
  if (!editingRole.value) return;
  permissionLoading.value = true;
  try {
    await systemApi.setRolePermissions(editingRole.value.id, {
      permissionIds: [...checkedPermissionIds.value],
    });
    EMessage.success('角色权限已保存');
    permissionDialogVisible.value = false;
    await loadRoles();
  } catch (error) {
    EMessage.error(error, '角色权限保存失败');
  } finally {
    permissionLoading.value = false;
  }
};
const deleteRole = async (row: SystemRoleListItem) => {
  try {
    await ElMessageBox.confirm(
      `确定删除角色“${row.name}”吗？此操作将停用并软删除该角色。`,
      '删除角色',
      { type: 'warning' },
    );
    await systemApi.deleteRole(row.id);
    EMessage.success('角色已删除');
    await loadRoles();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') EMessage.error(error, '角色删除失败');
  }
};

watch(permissionKeyword, (kw) => {
  permissionTreeRef.value?.filter?.(kw);
});
onMounted(loadRoles);
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
.table-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 16px;
  border-bottom: 1px solid #e5e7eb;
}
.table-toolbar :deep(.el-button) {
  height: 34px;
  border-radius: 6px;
}
.table-tools {
  display: flex;
  align-items: center;
  gap: 12px;
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

.dialog-form :deep(.el-input),
.dialog-form :deep(.el-select) {
  width: 100%;
}
.readonly-field :deep(.el-input__wrapper) {
  background: #f9fafb;
  box-shadow: 0 0 0 1px #e5e7eb inset;
}

/* ====== 权限分配弹窗 ====== */
.permission-dialog :deep(.el-dialog__body) {
  padding: 0 20px 10px;
}
.perm-role-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 20px;
  margin: 12px 0;
  border-bottom: 1px solid #e5e7eb;
  background: #f9fafb;
  border-radius: 6px;
}
.perm-role-info-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 40px;
}
.perm-role-info-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.perm-role-desc-item {
  flex: 1;
  min-width: 200px;
}
.perm-info-label {
  color: #6b7280;
  font-size: 14px;
  white-space: nowrap;
}
.perm-info-value {
  color: #1f2937;
  font-size: 14px;
  font-weight: 600;
}
.perm-role-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 10px;
}
.perm-role-actions :deep(.el-button) {
  min-width: 72px;
  height: 32px;
  border-radius: 6px;
}
.perm-section-title {
  height: 36px;
  color: #1f2937;
  font-size: 16px;
  font-weight: 600;
  line-height: 36px;
}
.perm-body {
  display: flex;
  gap: 0;
  min-height: 460px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.perm-tree-panel {
  flex: 0 0 280px;
  overflow-y: auto;
  border-right: 1px solid #e5e7eb;
}
.perm-detail-panel {
  flex: 1;
  overflow: hidden;
}
.perm-panel-header {
  height: 40px;
  padding: 0 16px;
  border-bottom: 1px solid #e5e7eb;
  background: #f9fafb;
  color: #1f2937;
  font-size: 14px;
  font-weight: 600;
  line-height: 40px;
}
.perm-tree-search {
  padding: 12px 12px 8px;
}
.perm-tree-search :deep(.el-input__wrapper) {
  min-height: 32px;
  border-radius: 6px;
  box-shadow: 0 0 0 1px #e5e7eb inset;
}
.perm-tree-panel :deep(.el-tree) {
  padding: 0 8px 12px;
}
.perm-tree-panel :deep(.el-tree-node__content) {
  height: 36px;
  border-radius: 6px;
}
.perm-tree-panel :deep(.el-tree-node__content:hover) {
  background: #f3f4f6;
}
.perm-tree-panel :deep(.el-tree-node.is-current > .el-tree-node__content) {
  background: #eff6ff;
}
.perm-tree-node {
  display: inline-flex;
  align-items: center;
  width: calc(100% - 24px);
  gap: 8px;
  color: #1f2937;
  cursor: pointer;
}
.perm-tree-node.is-leaf-permission {
  color: #6b7280;
}
.perm-tree-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.perm-detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 16px;
  border-bottom: 1px solid #e5e7eb;
  background: #f9fafb;
}
.perm-detail-title {
  color: #1f2937;
  font-size: 14px;
  font-weight: 600;
}
.perm-detail-count {
  margin-left: 8px;
  color: #6b7280;
  font-size: 13px;
}
.perm-detail-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.perm-detail-actions :deep(.el-button.is-link) {
  padding: 0;
  font-size: 13px;
  font-weight: 500;
}
.perm-action-divider {
  color: #e5e7eb;
}
.perm-table {
  width: 100%;
}
.perm-table :deep(.el-table__header th) {
  height: 44px;
  background: #f9fafb;
  color: #1f2937;
  font-weight: 600;
}
.perm-table :deep(.el-table__row) {
  height: 44px;
}
.perm-table :deep(.el-table__row:hover) {
  background: #f3f4f6;
}
.perm-table :deep(.el-table__cell) {
  border-bottom-color: #e5e7eb;
}
.perm-table :deep(.el-checkbox__inner) {
  width: 16px;
  height: 16px;
  border-color: #e5e7eb;
  border-radius: 4px;
}
.perm-name-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.perm-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 400px;
  color: #9ca3af;
  font-size: 14px;
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
