<template>
  <div class="processing-summary">
    <strong>异常处理过程</strong>
    <div class="summary-actions">
      <span class="processing-counts">
        <span :class="{ 'pending-count': pendingCount > 0 }">{{ pendingCount }} 项待办</span>
        / {{ groups.length }} 项记录
      </span>
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  processingGroupPending,
  type AbnormalProcessingGroup,
} from '../production-report-presentation';

const props = defineProps<{ groups: AbnormalProcessingGroup[] }>();
const pendingCount = computed(() => props.groups.filter(processingGroupPending).length);
</script>

<style scoped>
.processing-summary,
.summary-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 16px;
}
.processing-summary {
  justify-content: space-between;
  font-size: 14px;
}
.processing-counts {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.pending-count {
  color: var(--el-color-danger);
  font-weight: 700;
}
</style>
