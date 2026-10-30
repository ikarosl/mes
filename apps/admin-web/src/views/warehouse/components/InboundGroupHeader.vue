<template>
  <div class="inbound-group-heading">
    <DisclosureToggle
      :expanded="expanded"
      :label="`${titleLabel ? `${titleLabel} ` : ''}${title}`"
      @toggle="$emit('toggle')"
    />
    <span class="group-title">
      <span v-if="titleLabel">{{ titleLabel + ' ' }}</span>
      <strong class="group-title-value">{{ title }}</strong>
    </span>
    <span class="group-count">{{ countLabel }}</span>
    <slot />
  </div>
</template>

<script setup lang="ts">
import DisclosureToggle from '../../../components/DisclosureToggle.vue';

defineOptions({ name: 'InboundGroupHeader' });
defineProps<{ expanded: boolean; titleLabel?: string; title: string; countLabel: string }>();
defineEmits<{ toggle: [] }>();
</script>

<style scoped>
.inbound-group-heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 12px;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  font-size: 14px;
  line-height: 22px;
}
.group-title {
  color: var(--el-text-color-primary);
  font-size: 14px;
  font-weight: 400;
  overflow-wrap: anywhere;
}
.group-title-value {
  font-weight: 600;
}
.group-count {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-weight: 400;
}
</style>
