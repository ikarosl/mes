<template>
  <button
    type="button"
    class="disclosure-toggle"
    :aria-expanded="expanded"
    :aria-label="`${expanded ? '收起' : '展开'}${label}`"
    :disabled="disabled"
    @click.stop="emit('toggle')"
  >
    <el-icon
      class="disclosure-arrow"
      :class="{ 'is-expanded': expanded }"
      aria-hidden="true"
      ><ArrowRight
    /></el-icon>
  </button>
</template>

<script setup lang="ts">
import { ArrowRight } from '@element-plus/icons-vue';

defineOptions({ name: 'DisclosureToggle' });
withDefaults(defineProps<{ expanded: boolean; label: string; disabled?: boolean }>(), {
  disabled: false,
});
const emit = defineEmits<{ toggle: [] }>();
</script>

<style scoped>
.disclosure-toggle {
  display: inline-flex;
  flex: 0 0 24px;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: var(--el-border-radius-small);
  background: transparent;
  color: var(--el-text-color-regular);
  font: inherit;
  cursor: pointer;
}
.disclosure-toggle:hover {
  color: var(--el-text-color-primary);
}
.disclosure-toggle:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}
.disclosure-toggle:disabled {
  color: var(--el-text-color-placeholder);
  cursor: not-allowed;
}
.disclosure-arrow {
  font-size: 14px;
  transition: transform 0.15s ease;
}
.disclosure-arrow.is-expanded {
  transform: rotate(90deg);
}
@media (prefers-reduced-motion: reduce) {
  .disclosure-arrow {
    transition: none;
  }
}
</style>
