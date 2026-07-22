<template>
  <section>
    <div class="page-title">
      <div>
        <h2>权限管理</h2>
        <p>权限编码是前后端统一的授权契约</p>
      </div>
      <el-button @click="loadPermissions">刷新</el-button>
    </div>

    <div class="query-panel">
      <el-form
        class="query-form"
        :inline="true"
      >
        <el-form-item label="关键字">
          <el-input
            v-model="keyword"
            clearable
            placeholder="名称、编码、类型、路由或接口"
          />
        </el-form-item>
      </el-form>
    </div>

    <div class="table-panel">
      <el-table
        v-loading="loading"
        :data="filteredPermissions"
        class="data-table"
      >
        <el-table-column
          prop="id"
          label="ID"
          width="80"
        />
        <el-table-column
          prop="parentId"
          label="父级ID"
          width="90"
        />
        <el-table-column
          prop="name"
          label="权限名称"
          min-width="140"
        />
        <el-table-column
          prop="code"
          label="权限编码"
          min-width="200"
        />
        <el-table-column
          prop="type"
          label="类型"
          width="100"
        />
        <el-table-column
          prop="routePath"
          label="路由"
          min-width="160"
        />
        <el-table-column
          prop="apiMethod"
          label="方法"
          width="90"
        />
        <el-table-column
          prop="apiPath"
          label="接口路径"
          min-width="180"
        />
        <el-table-column
          label="状态"
          width="100"
        >
          <template #default="{ row }">
            <el-tag :type="row.status === SYSTEM_STATUS.enabled ? 'success' : 'info'">
              {{ row.status === SYSTEM_STATUS.enabled ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { SystemPermissionListItem } from '@company/contracts';
import { SYSTEM_STATUS } from '@company/constants';
import { systemApi } from '../../api/system';
import { EMessage } from '../../utils/message';

defineOptions({ name: 'PermissionsPage' });

const keyword = ref('');
const permissions = ref<SystemPermissionListItem[]>([]);
const loading = ref(false);

const filteredPermissions = computed(() => {
  const value = keyword.value.trim().toLowerCase();
  if (!value) return permissions.value;
  return permissions.value.filter((item) =>
    [
      item.name,
      item.code,
      item.type,
      item.routePath ?? '',
      item.apiMethod ?? '',
      item.apiPath ?? '',
    ].some((field) => field.toLowerCase().includes(value)),
  );
});
const loadPermissions = async () => {
  loading.value = true;
  try {
    permissions.value = await systemApi.permissions();
  } catch (error) {
    EMessage.error(error, '权限目录加载失败');
  } finally {
    loading.value = false;
  }
};
onMounted(loadPermissions);
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
  padding: 16px 20px;
  margin-bottom: 16px;
}
.query-form {
  display: flex;
  align-items: flex-start;
}
.query-form :deep(.el-form-item) {
  margin-right: 0;
  margin-bottom: 0;
}
.query-form :deep(.el-form-item__label) {
  color: #1f2937;
  font-size: 14px;
  font-weight: 500;
}
.query-form :deep(.el-input) {
  width: 320px;
}
.query-form :deep(.el-input__wrapper) {
  min-height: 34px;
  border-radius: 6px;
  box-shadow: 0 0 0 1px #e5e7eb inset;
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
</style>
