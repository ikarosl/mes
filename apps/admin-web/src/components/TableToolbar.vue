<template>
  <div class="table-toolbar">
    <div
      v-if="$slots.actions"
      class="toolbar-actions"
    >
      <slot name="actions" />
    </div>
    <div
      v-if="$slots.tools"
      class="toolbar-tools"
    >
      <slot name="tools" />
    </div>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'TableToolbar' });
</script>

<style scoped>
.table-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 16px;
  border-bottom: 1px solid #e5e7eb;
}
.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.toolbar-actions :deep(.el-button) {
  height: 34px;
  border-radius: 6px;
}
.toolbar-tools {
  display: flex;
  align-items: center;
  gap: 12px;
}
.toolbar-tools :deep(.el-button) {
  width: 20px;
  height: 20px;
  color: #6b7280;
}
</style>
