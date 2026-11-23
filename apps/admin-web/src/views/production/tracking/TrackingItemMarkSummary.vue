<template>
  <div class="mark-summary">
    <span>单件刻码</span>
    <span
      >有效绑定 <strong>{{ card.itemMarking.activeCount }}</strong></span
    >
    <span
      >待绑 <strong>{{ trackingItemMarkPending(card) }}</strong></span
    >
    <span
      >已报废 <strong>{{ card.itemMarking.scrappedCount }}</strong></span
    >
    <span
      >已撤销 <strong>{{ card.itemMarking.cancelledCount }}</strong></span
    >
    <span v-if="card.status === 'voided'"
      >追踪卡已作废，绑定历史保留，实物报废须以异常处置为准。</span
    >
  </div>
</template>
<script setup lang="ts">
import type { ProductionTrackingCardDetail } from '@company/contracts';
import { trackingItemMarkPending } from './tracking-presentation';
defineProps<{ card: ProductionTrackingCardDetail }>();
</script>
<style scoped>
.mark-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  color: var(--el-text-color-regular);
  font-size: 14px;
  line-height: 1.7;
}
.mark-summary strong {
  color: var(--el-text-color-primary);
}
</style>
