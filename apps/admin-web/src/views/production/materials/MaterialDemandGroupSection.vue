<template>
  <section class="demand-group">
    <header class="demand-group-header">
      <button
        type="button"
        class="demand-group-toggle"
        :aria-expanded="expanded"
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
        <span class="group-count">{{ count }} 条需求</span>
        <el-tag
          v-if="selected"
          type="primary"
          effect="plain"
          size="small"
          >已选需求</el-tag
        >
      </button>
      <span class="demand-group-time">{{ summary }}</span>
    </header>
    <div v-show="expanded">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
import { ArrowDown } from '@element-plus/icons-vue';

defineOptions({ name: 'MaterialDemandGroupSection' });
defineProps<{
  title: string;
  summary: string;
  count: number;
  expanded: boolean;
  selected?: boolean;
}>();
defineEmits<{ toggle: [] }>();
</script>

<style scoped>
.demand-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
}
.demand-group-toggle {
  display: inline-flex;
  align-items: center;
  flex: 1 1 auto;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--el-text-color-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.demand-group-toggle:focus-visible {
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
.demand-group-toggle:hover .group-action {
  background: var(--el-fill-color);
}
.group-arrow {
  flex: none;
  font-size: 12px;
}
.group-arrow.collapsed {
  transform: rotate(-90deg);
}
.group-title {
  font-size: 14px;
  overflow-wrap: anywhere;
}
.group-count {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.demand-group-time {
  color: var(--el-text-color-regular);
  font-size: 13px;
  white-space: nowrap;
}
</style>
