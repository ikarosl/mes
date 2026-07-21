<template>
  <div class="table-footer">
    <span class="total-text">共 {{ total }} 条</span>
    <div class="table-footer-right">
      <el-select
        :model-value="pageSize"
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
  }>(),
  {
    layout: 'prev, pager, next, jumper',
  },
);

defineEmits<{
  (e: 'update:pageSize', value: number): void;
  (e: 'pageChange', page: number): void;
}>();
</script>

<style scoped>
.table-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 16px;
}

.total-text {
  color: #6b7280;
  font-size: 14px;
}

.table-footer-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-size-select {
  width: 86px;
}

.page-size-select :deep(.el-select__wrapper) {
  min-height: 30px;
  border-radius: 6px;
}

.table-footer-right :deep(.el-pagination) {
  gap: 6px;
}

.table-footer-right :deep(.el-pager li),
.table-footer-right :deep(.btn-prev),
.table-footer-right :deep(.btn-next) {
  min-width: 32px;
  height: 32px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}

.table-footer-right :deep(.el-pager li.is-active) {
  border-color: #306188;
  background: #306188;
  color: #ffffff;
}

.table-footer-right :deep(.el-pagination__jump) {
  margin-left: 12px;
  color: #6b7280;
}

.table-footer-right :deep(.el-pagination__editor) {
  width: 48px;
}
</style>
