<template>
  <section>
    <div class="query-panel">
      <el-form
        class="query-form"
        :inline="true"
        :model="query"
        @submit.prevent="search"
      >
        <el-form-item label="供应商名称">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="请输入供应商名称"
            maxlength="100"
          />
        </el-form-item>
        <el-form-item class="query-actions">
          <el-button
            type="primary"
            :loading="loading"
            native-type="submit"
            >查询</el-button
          >
          <el-button @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </div>
    <div class="table-panel">
      <TableToolbar>
        <template #actions>
          <el-button
            type="primary"
            :icon="Plus"
            @click="openCreate"
            >新增供应商</el-button
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
              :loading="loading"
              aria-label="刷新供应商列表"
              @click="load"
            />
          </el-tooltip>
        </template>
      </TableToolbar>
      <el-table
        v-loading="loading"
        :data="rows"
        row-key="id"
        class="data-table"
        empty-text="暂无供应商"
      >
        <el-table-column
          prop="supplierName"
          label="供应商名称"
          min-width="300"
          show-overflow-tooltip
        />
        <el-table-column
          label="创建时间"
          width="200"
        >
          <template #default="{ row }">{{ formatDateTimeForDisplay(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column
          label="更新时间"
          width="200"
        >
          <template #default="{ row }">{{ formatDateTimeForDisplay(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="100"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              @click="openEdit(row)"
              >编辑</el-button
            >
          </template>
        </el-table-column>
      </el-table>
      <PaginationFooter
        :total="total"
        :current-page="page"
        :page-size="pageSize"
        @page-change="changePage"
        @update:page-size="changePageSize"
      />
    </div>

    <el-dialog
      v-model="visible"
      :title="original ? '编辑供应商' : '新增供应商'"
      :width="DialogWidth.md"
      :before-close="beforeClose"
      :close-on-click-modal="false"
      :close-on-press-escape="!submitting"
      :show-close="!submitting"
    >
      <el-alert
        v-if="stale"
        title="供应商资料已更新，请关闭后从最新列表重新选择。当前输入已保留。"
        type="warning"
        show-icon
        :closable="false"
        class="edit-notice"
      />
      <el-form
        label-width="100px"
        :disabled="submitting"
        @submit.prevent="save"
      >
        <el-form-item
          label="供应商名称"
          required
        >
          <el-input
            v-model="supplierName"
            placeholder="请输入供应商名称"
            maxlength="100"
            show-word-limit
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button
          :disabled="submitting"
          @click="close"
          >取消</el-button
        >
        <el-button
          type="primary"
          :loading="submitting"
          :disabled="!canSave"
          @click="save"
          >保存供应商</el-button
        >
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { watch } from 'vue';
import { Plus, Refresh } from '@element-plus/icons-vue';
import TableToolbar from '../../components/TableToolbar.vue';
import PaginationFooter from '../../components/PaginationFooter.vue';
import { DialogWidth } from '../../utils/dialog';
import { formatDateTimeForDisplay } from '../../utils/date';
import { useSuppliersList } from './composables/useSuppliersList';
import { useSupplierEditor } from './composables/useSupplierEditor';

defineOptions({ name: 'SuppliersPage' });

const {
  query,
  rows,
  total,
  page,
  pageSize,
  loading,
  load,
  search,
  reset,
  changePage,
  changePageSize,
} = useSuppliersList();
const {
  visible,
  supplierName,
  original,
  submitting,
  stale,
  canSave,
  openCreate,
  openEdit,
  observeRows,
  close,
  save,
} = useSupplierEditor(load);
watch(rows, observeRows);
const beforeClose = (): void => {
  void close();
};
</script>

<style scoped>
.query-panel {
  padding: 20px 20px 4px;
  margin-bottom: 16px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.query-form {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;
}
.query-form :deep(.el-form-item) {
  margin-right: 0;
  margin-bottom: 16px;
}
.query-form :deep(.el-input) {
  width: 260px;
}
.query-actions {
  margin-left: auto;
}
.table-panel {
  overflow: hidden;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.data-table :deep(.el-table__header th) {
  height: 48px;
  background: #f9fafb;
  color: #1f2937;
}
.data-table :deep(.el-table__row) {
  height: 48px;
}
.edit-notice {
  margin-bottom: 20px;
}
</style>
