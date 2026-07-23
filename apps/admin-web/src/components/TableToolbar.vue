<template>
  <div class="table-toolbar">
    <div
      v-if="$slots.actions"
      class="toolbar-actions"
    >
      <slot name="actions" />
    </div>
    <div
      v-if="$slots.tools || total !== undefined"
      class="toolbar-tools"
    >
      <slot name="tools" />
      <span
        v-if="total !== undefined"
        class="toolbar-total"
        >共 {{ total }} 条</span
      >
    </div>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'TableToolbar' });

defineProps<{
  /** 总记录数，传入后在右侧显示 "共 N 条" */
  total?: number;
}>();
</script>

<style scoped>
.table-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-height: 32px;
  padding: 6px 0;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  flex: 1 1 0;
  min-width: 0;
}

.toolbar-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  white-space: nowrap;
}

.toolbar-total {
  color: #6b7280;
  font-size: 14px;
  line-height: 1.5;
}
</style>
