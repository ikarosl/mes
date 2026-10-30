<template>
  <section class="demand-group">
    <header class="demand-group-header">
      <div class="demand-group-identity">
        <DisclosureToggle
          :expanded="expanded"
          :label="`需求分组 ${title}`"
          @toggle="$emit('toggle')"
        />
        <strong class="group-title">{{ title }}</strong>
        <span class="group-count">{{ count }} 条需求</span>
        <el-tag
          v-if="selected"
          type="primary"
          effect="plain"
          size="small"
          >已选需求</el-tag
        >
      </div>
      <span class="demand-group-time">{{ summary }}</span>
    </header>
    <div v-show="expanded">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
import DisclosureToggle from '../../../components/DisclosureToggle.vue';

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
.demand-group-identity {
  display: inline-flex;
  align-items: center;
  flex: 1 1 auto;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
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
