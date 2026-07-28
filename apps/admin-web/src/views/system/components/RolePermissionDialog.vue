<template>
  <el-dialog
    :model-value="visible"
    title="分配权限"
    :width="DialogWidth.xl"
    class="permission-dialog"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:visible', $event)"
    @closed="resetDialog"
  >
    <div class="perm-role-header">
      <div class="perm-role-info-row">
        <span class="perm-role-info-item">
          <span class="perm-info-label">角色名称：</span>
          <span class="perm-info-value">{{ role?.name }}</span>
        </span>
        <span class="perm-role-info-item">
          <span class="perm-info-label">角色编码：</span>
          <span class="perm-info-value">{{ role?.code }}</span>
        </span>
        <span class="perm-role-info-item perm-role-desc-item">
          <span class="perm-info-label">描述：</span>
          <span class="perm-info-value">{{ role?.description ?? '-' }}</span>
        </span>
      </div>
      <div class="perm-role-actions">
        <el-button
          type="primary"
          :disabled="loading"
          @click="submitPermissions"
        >
          保存
        </el-button>
        <el-button
          :disabled="loading"
          @click="resetAssigned"
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
            v-model="keyword"
            clearable
            :prefix-icon="Search"
            placeholder="请输入模块名称"
          />
        </div>
        <el-tree
          ref="treeRef"
          :data="tree"
          :props="treeProps"
          :filter-node-method="filterNode"
          :expand-on-click-node="false"
          node-key="id"
          highlight-current
          @node-click="handleNodeClick"
        >
          <template #default="{ node, data }">
            <span
              class="perm-tree-node"
              :class="{
                'is-active': activeNode?.id === data.id,
                'is-leaf-permission': node.level >= 3,
              }"
            >
              <el-checkbox
                :model-value="isChecked(data)"
                :indeterminate="isIndeterminate(data)"
                @click.stop
                @change="handleCheck(data, $event)"
              />
              <span class="perm-tree-label">{{ data.name }}</span>
            </span>
          </template>
        </el-tree>
      </div>

      <div class="perm-detail-panel">
        <div class="perm-detail-header">
          <div>
            <span class="perm-detail-title">{{ activeNode?.name ?? '权限详情' }}</span>
            <span
              v-if="activeNode"
              class="perm-detail-count"
            >
              权限列表（已选择 {{ activeScopeCheckedCount }} 项）
            </span>
          </div>
          <div
            v-if="detailRows.length"
            class="perm-detail-actions"
          >
            <el-button
              link
              type="primary"
              @click="setDetailExpanded(true)"
            >
              展开全部
            </el-button>
            <span class="perm-action-divider">|</span>
            <el-button
              link
              type="primary"
              @click="setDetailExpanded(false)"
            >
              收起全部
            </el-button>
          </div>
        </div>
        <el-table
          v-if="detailRows.length"
          ref="detailTableRef"
          :data="detailRows"
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
                  :model-value="isChecked(row)"
                  :indeterminate="isIndeterminate(row)"
                  @click.stop
                  @change="handleCheck(row, $event)"
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
            <template #default="{ row }">{{ getDescription(row) }}</template>
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
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { Search } from '@element-plus/icons-vue';
import type {
  SystemPermissionListItem,
  SystemPermissionTreeNode,
  SystemRoleListItem,
} from '@company/contracts';
import { systemApi } from '../../../api/system';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';

const props = defineProps<{
  visible: boolean;
  role: SystemRoleListItem | null;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'saved'): void;
}>();

/* ----- state ----- */
const tree = ref<SystemPermissionTreeNode[]>([]);
const treeRef = ref();
const detailTableRef = ref();
const keyword = ref('');
const loading = ref(false);
const checkedIds = ref<Set<string>>(new Set());
const initialIds = ref<string[]>([]);
const activeNode = ref<SystemPermissionTreeNode | null>(null);

const treeProps = { label: 'name', children: 'children' };

/* ----- computed ----- */
const levelById = computed(() => {
  const map = new Map<string, number>();
  const walk = (nodes: SystemPermissionTreeNode[], level: number): void => {
    for (const node of nodes) {
      map.set(node.id, level);
      walk(node.children ?? [], level + 1);
    }
  };
  walk(tree.value, 1);
  return map;
});

const detailRows = computed<SystemPermissionTreeNode[]>(() => {
  if (!activeNode.value) return [];
  const lv = levelById.value.get(activeNode.value.id) ?? 1;
  if (lv >= 3) return [];
  return lv === 1 ? (activeNode.value.children ?? []) : [activeNode.value];
});

const activeScopeCheckedCount = computed(() => {
  const ids = new Set<string>();
  for (const row of detailRows.value) {
    for (const id of collectIds(row)) ids.add(id);
  }
  let count = 0;
  for (const id of ids) {
    if (checkedIds.value.has(id)) count++;
  }
  return count;
});

/* ----- helpers ----- */
const collectIds = (node: SystemPermissionTreeNode): string[] => [
  node.id,
  ...(node.children ?? []).flatMap((c) => collectIds(c)),
];

const isChecked = (node: SystemPermissionTreeNode): boolean => {
  const ids = collectIds(node);
  return ids.length > 0 && ids.every((id) => checkedIds.value.has(id));
};

const isIndeterminate = (node: SystemPermissionTreeNode): boolean => {
  const ids = collectIds(node);
  if (ids.length <= 1) return false;
  const cnt = ids.filter((id) => checkedIds.value.has(id)).length;
  return cnt > 0 && cnt < ids.length;
};

const handleCheck = (node: SystemPermissionTreeNode, checked: boolean | string | number): void => {
  const next = new Set(checkedIds.value);
  for (const id of collectIds(node)) {
    if (checked) next.add(id);
    else next.delete(id);
  }
  checkedIds.value = next;
};

const handleNodeClick = (node: SystemPermissionTreeNode): void => {
  const lv = levelById.value.get(node.id) ?? 1;
  if (lv >= 3) {
    void nextTick(() => {
      treeRef.value?.setCurrentKey?.(activeNode.value?.id ?? null);
    });
    return;
  }
  activeNode.value = node;
};

const filterNode = (kw: string, node: SystemPermissionTreeNode): boolean => {
  const n = kw.trim().toLowerCase();
  if (!n) return true;
  return node.name.toLowerCase().includes(n) || node.code.toLowerCase().includes(n);
};

const getDescription = (node: SystemPermissionTreeNode): string => {
  if (node.apiMethod && node.apiPath) return `${node.apiMethod} ${node.apiPath}`;
  if (node.routePath) return `页面路由 ${node.routePath}`;
  return '权限分组';
};

const setDetailExpanded = async (expanded: boolean): Promise<void> => {
  await nextTick();
  const toggle = (rows: SystemPermissionTreeNode[]): void => {
    for (const r of rows) {
      detailTableRef.value?.toggleRowExpansion?.(r, expanded);
      toggle(r.children ?? []);
    }
  };
  toggle(detailRows.value);
};

const resetAssigned = (): void => {
  checkedIds.value = new Set(initialIds.value);
};

const resetDialog = (): void => {
  activeNode.value = null;
  tree.value = [];
  checkedIds.value = new Set();
  initialIds.value = [];
  keyword.value = '';
};

const buildTree = (items: SystemPermissionListItem[]): SystemPermissionTreeNode[] => {
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

/* ----- load & save ----- */
const loadPermissions = async (roleId: string): Promise<void> => {
  loading.value = true;
  try {
    const [permissions, detail] = await Promise.all([
      systemApi.permissions(),
      systemApi.rolePermissions(roleId),
    ]);
    tree.value = buildTree(permissions);
    checkedIds.value = new Set(detail.permissionIds);
    initialIds.value = [...detail.permissionIds];
    activeNode.value = tree.value[0] ?? null;
  } catch (error) {
    EMessage.error(error, '角色权限加载失败');
    emit('update:visible', false);
  } finally {
    loading.value = false;
  }
};

const submitPermissions = async (): Promise<void> => {
  if (!props.role) return;
  loading.value = true;
  try {
    await systemApi.setRolePermissions(props.role.id, {
      permissionIds: [...checkedIds.value],
    });
    EMessage.success('角色权限已保存');
    emit('update:visible', false);
    emit('saved');
  } catch (error) {
    EMessage.error(error, '角色权限保存失败');
  } finally {
    loading.value = false;
  }
};

/* ----- watch ----- */
watch(keyword, (kw) => {
  treeRef.value?.filter?.(kw);
});

watch(
  () => props.visible,
  (val) => {
    if (val && props.role) {
      void loadPermissions(props.role.id);
    }
  },
);
</script>

<style scoped>
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
</style>
