<template>
  <div
    class="inline-hint"
    :class="`inline-hint--${tone}`"
    role="note"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'info' | 'warning' | 'danger' | 'success' }>(), {
  tone: 'info',
});
</script>

<style scoped>
.inline-hint {
  --hint-color: var(--el-color-primary);
  --hint-background: var(--el-color-primary-light-9);
  --hint-strong-color: var(--el-text-color-primary);
  padding: 7px 10px;
  border-left: 3px solid var(--hint-color);
  border-radius: var(--el-border-radius-base);
  background: var(--hint-background);
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.inline-hint--warning {
  --hint-color: var(--el-color-warning);
  --hint-background: var(--el-color-warning-light-9);
  --hint-strong-color: var(--el-color-warning-dark-2);
}
.inline-hint--danger {
  --hint-color: var(--el-color-danger);
  --hint-background: var(--el-color-danger-light-9);
  --hint-strong-color: var(--el-color-danger-dark-2);
}
.inline-hint--success {
  --hint-color: var(--el-color-success);
  --hint-background: var(--el-color-success-light-9);
  --hint-strong-color: var(--el-color-success-dark-2);
}
.inline-hint :deep(strong) {
  color: var(--hint-strong-color);
  font-weight: 600;
}
</style>
