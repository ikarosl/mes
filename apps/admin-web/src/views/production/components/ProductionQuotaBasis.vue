<template>
  <div class="production-quota-basis">
    <span>
      报工上限 <strong>{{ formatQuantity(quota.upperLimitQuantity) }}</strong> {{ quota.unit }} =
      计划 {{ formatQuantity(plannedQuantity) }} +
      <el-tooltip content="仅已满足补料等生效条件的报废补产计入报工上限。">
        <span>已报废补产 {{ formatQuantity(quota.activatedSupplementInputQuantity) }}</span>
      </el-tooltip>
    </span>
    <span
      v-if="Number(quota.pendingSupplementInputQuantity) > 0"
      class="pending-supplement"
    >
      待生效报废补产 {{ formatQuantity(quota.pendingSupplementInputQuantity) }} {{ quota.unit }}
    </span>
    <span
      v-if="showReopenHint && quota.status === 'completed' && hasSupplement"
      class="reopen-hint"
    >
      新增报工须先重新开工。
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ProductionWorkerTaskItem } from '@company/contracts';
import { formatQuantity } from '../production-status';

const props = defineProps<{
  quota: Pick<
    ProductionWorkerTaskItem,
    | 'upperLimitQuantity'
    | 'activatedSupplementInputQuantity'
    | 'pendingSupplementInputQuantity'
    | 'status'
    | 'unit'
  >;
  plannedQuantity: string;
  showReopenHint: boolean;
}>();
const hasSupplement = computed(
  () =>
    Number(props.quota.activatedSupplementInputQuantity) > 0 ||
    Number(props.quota.pendingSupplementInputQuantity) > 0,
);
</script>

<style scoped>
.production-quota-basis {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 16px;
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.6;
}
.pending-supplement {
  color: var(--el-color-warning-dark-2);
}
.reopen-hint {
  color: var(--el-text-color-secondary);
}
</style>
