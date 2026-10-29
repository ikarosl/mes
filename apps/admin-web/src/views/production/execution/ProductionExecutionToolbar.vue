<template>
  <span
    ref="sentinelRef"
    class="toolbar-sentinel"
    aria-hidden="true"
  />
  <div
    :class="['execution-toolbar', { 'is-sticky': isSticky }]"
    aria-label="工序记录与批量冲销工具栏"
  >
    <div
      class="step-controls"
      role="group"
      aria-label="当前批次工序展开控制"
    >
      <strong>工序记录</strong>
      <el-button
        link
        type="primary"
        size="small"
        :disabled="disabled || !hasSteps || !canExpandAll"
        @click="$emit('expand-all')"
        >全部展开</el-button
      >
      <el-button
        link
        type="primary"
        size="small"
        :disabled="disabled || !hasSteps || !canCollapseAll"
        @click="$emit('collapse-all')"
        >全部收起</el-button
      >
    </div>
    <div
      class="bulk-controls"
      role="group"
      aria-label="批量冲销"
    >
      <el-button
        v-if="selectedCount"
        link
        type="primary"
        size="small"
        aria-haspopup="dialog"
        @click="$emit('view-selection')"
        >已选 {{ selectedCount }} 条 / {{ selectedStepCount }} 道工序</el-button
      >
      <span
        v-else
        class="no-selection"
        >未选择报工</span
      >
      <template v-if="pending">
        <el-tag
          type="warning"
          size="small"
          role="status"
          >批量结果未确认</el-tag
        >
        <el-button
          link
          type="primary"
          size="small"
          @click="$emit('recover')"
          >核对未确认结果</el-button
        >
      </template>
      <el-tooltip
        v-else
        :disabled="canPreview"
        :content="previewBlockedReason || '当前不可批量冲销'"
      >
        <span
          ><el-button
            size="small"
            type="danger"
            plain
            :disabled="!canPreview"
            @click="$emit('preview')"
            >预览批量冲销</el-button
          ></span
        >
      </el-tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onActivated, onDeactivated, onScopeDispose, ref, watch } from 'vue';

defineOptions({ name: 'ProductionExecutionToolbar' });
const props = defineProps<{
  scrollContainer: HTMLElement | null;
  hasSteps: boolean;
  disabled: boolean;
  canExpandAll: boolean;
  canCollapseAll: boolean;
  selectedCount: number;
  selectedStepCount: number;
  canPreview: boolean;
  previewBlockedReason: string | null;
  pending: boolean;
}>();
defineEmits<{
  'expand-all': [];
  'collapse-all': [];
  'view-selection': [];
  preview: [];
  recover: [];
}>();

const sentinelRef = ref<HTMLElement | null>(null);
const isSticky = ref(false);
let observer: IntersectionObserver | null = null;
const stopObserving = (): void => {
  observer?.disconnect();
  observer = null;
  isSticky.value = false;
};
const observePosition = (): void => {
  stopObserving();
  if (!props.scrollContainer || !sentinelRef.value) return;
  const currentObserver = new IntersectionObserver(
    ([entry]) => {
      if (observer !== currentObserver || !entry?.rootBounds) return;
      isSticky.value = entry.boundingClientRect.top < entry.rootBounds.top;
    },
    { root: props.scrollContainer, threshold: 0 },
  );
  observer = currentObserver;
  observer.observe(sentinelRef.value);
};
watch([() => props.scrollContainer, sentinelRef], observePosition, { flush: 'post' });
onActivated(observePosition);
onDeactivated(stopObserving);
onScopeDispose(stopObserving);
</script>

<style scoped>
.toolbar-sentinel {
  display: block;
  height: 1px;
  margin-top: 12px;
  margin-bottom: -1px;
  pointer-events: none;
}
.execution-toolbar {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  min-height: 42px;
  padding: 8px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-bg-color);
  transition: box-shadow 0.15s ease;
}
.execution-toolbar.is-sticky {
  box-shadow: 0 3px 6px rgb(0 0 0 / 6%);
}
.step-controls,
.bulk-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.step-controls > strong {
  margin-right: 4px;
  color: var(--el-text-color-primary);
  font-size: 14px;
}
.bulk-controls {
  justify-content: flex-end;
  gap: 10px;
}
.execution-toolbar :deep(.el-button + .el-button) {
  margin-left: 0;
}
.no-selection {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
@media (max-width: 1100px) {
  .execution-toolbar {
    flex-wrap: wrap;
  }
  .bulk-controls {
    margin-left: auto;
  }
}
</style>
