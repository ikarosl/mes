<template>
  <div class="inbound-group-heading">
    <button
      type="button"
      class="inbound-group-toggle"
      :aria-expanded="expanded"
      :aria-label="`${expanded ? '收起' : '展开'}${title}`"
      @click="$emit('toggle')"
    >
      <span class="group-action">
        <el-icon
          class="group-arrow"
          :class="{ collapsed: !expanded }"
          aria-hidden="true"
          ><ArrowDown
        /></el-icon>
        <span>{{ expanded ? '收起' : '展开' }}</span>
      </span>
      <strong class="group-title">{{ title }}</strong>
      <span class="group-count">{{ countLabel }}</span>
    </button>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { ArrowDown } from '@element-plus/icons-vue';

defineOptions({ name: 'InboundGroupHeader' });
defineProps<{ expanded: boolean; title: string; countLabel: string }>();
defineEmits<{ toggle: [] }>();
</script>

<style scoped>
.inbound-group-heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 20px;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  font-size: 14px;
  line-height: 22px;
}
.inbound-group-toggle {
  display: inline-flex;
  align-items: center;
  flex: 0 1 auto;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--el-text-color-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.group-title {
  color: var(--el-text-color-primary);
  font-size: 14px;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.inbound-group-toggle:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}
.group-action {
  display: inline-flex;
  align-items: center;
  flex: none;
  gap: 4px;
  padding: 0 6px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-small);
  background: var(--el-bg-color);
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 20px;
  white-space: nowrap;
}
.inbound-group-toggle:hover .group-action {
  background: var(--el-fill-color);
}
.group-arrow {
  flex: none;
  font-size: 12px;
  transition: transform 0.15s ease;
}
.group-arrow.collapsed {
  transform: rotate(-90deg);
}
.group-count {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-weight: 400;
}
@media (prefers-reduced-motion: reduce) {
  .group-arrow {
    transition: none;
  }
}
</style>
