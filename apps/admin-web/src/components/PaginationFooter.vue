<template>
  <div
    class="pagination-footer"
    :class="{ 'pagination-footer--compact': compact }"
  >
    <span class="total-text">共 {{ total }} {{ totalSuffix }}</span>
    <div class="table-footer-right">
      <el-select
        v-if="showPageSize"
        :model-value="pageSize"
        :disabled="disabled"
        class="page-size-select"
        @update:model-value="$emit('update:pageSize', $event)"
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
        :disabled="disabled"
        :pager-count="compact ? 5 : 7"
        :size="compact ? 'small' : 'default'"
        :current-page="currentPage"
        :page-size="pageSize"
        :total="total"
        :layout="layout"
        @update:current-page="(page: number) => $emit('pageChange', page)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'PaginationFooter' });

withDefaults(
  defineProps<{
    total: number;
    currentPage: number;
    pageSize: number;
    layout?: string;
    totalSuffix?: string;
    compact?: boolean;
    disabled?: boolean;
    showPageSize?: boolean;
  }>(),
  {
    layout: 'prev, pager, next, jumper',
    totalSuffix: '条',
    compact: false,
    disabled: false,
    showPageSize: true,
  },
);

defineEmits<{
  (e: 'update:pageSize', value: number): void;
  (e: 'pageChange', page: number): void;
}>();
</script>

<style scoped>
.pagination-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  height: 56px;
  padding: 0 16px;
}

.total-text {
  color: #303133;
  font-size: 14px;
}

.table-footer-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-size-select {
  width: 160px;
}

.page-size-select :deep(.el-select__wrapper) {
  min-height: 40px;
  padding: 0 12px;
  border-radius: 4px;
  box-shadow: 0 0 0 1px #dcdfe6 inset;
}

.table-footer-right :deep(.el-pagination) {
  gap: 10px;
  color: #303133;
}

.table-footer-right :deep(.el-pager li),
.table-footer-right :deep(.btn-prev),
.table-footer-right :deep(.btn-next) {
  min-width: 40px;
  height: 40px;
  border: 0;
  border-radius: 2px;
  background: #f4f6f8;
  color: #606266;
}

.table-footer-right :deep(.el-pager li.is-active) {
  background: #409eff;
  color: #ffffff;
}

.table-footer-right :deep(.btn-prev:disabled),
.table-footer-right :deep(.btn-next:disabled) {
  background: #f5f7fa;
  color: #c0c4cc;
}

.table-footer-right :deep(.el-pagination__jump) {
  margin-left: 12px;
  color: #303133;
}

.table-footer-right :deep(.el-pagination__editor) {
  width: 64px;
}

.table-footer-right :deep(.el-pagination__editor .el-input__wrapper) {
  min-height: 40px;
  border-radius: 4px;
  box-shadow: 0 0 0 1px #dcdfe6 inset;
}

.pagination-footer--compact {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  height: auto;
  padding: 8px 0;
}

.pagination-footer--compact .total-text {
  font-size: 12px;
}

.pagination-footer--compact .table-footer-right {
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.pagination-footer--compact .page-size-select {
  width: 110px;
}

.pagination-footer--compact .page-size-select :deep(.el-select__wrapper) {
  min-height: 32px;
}

.pagination-footer--compact :deep(.el-pagination) {
  gap: 4px;
}

.pagination-footer--compact :deep(.el-pager li),
.pagination-footer--compact :deep(.btn-prev),
.pagination-footer--compact :deep(.btn-next) {
  min-width: 28px;
  height: 28px;
}
</style>
