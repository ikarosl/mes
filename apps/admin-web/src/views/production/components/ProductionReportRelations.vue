<template>
  <div class="report-relations">
    <div
      v-for="(relation, index) in reportRelations(report)"
      :key="index"
      class="relation-line"
    >
      <span>{{ relation.label }}</span>
      <el-button
        v-if="relation.report"
        link
        type="primary"
        @click="$emit('view-report', relation.report)"
        >{{ relation.report.reportNo }}</el-button
      >
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BatchStepReportReference, BatchStepReportView } from '@company/contracts';
import { reportRelations } from '../production-report-presentation';
defineProps<{ report: BatchStepReportView }>();
defineEmits<{ 'view-report': [report: BatchStepReportReference] }>();
</script>

<style scoped>
.report-relations {
  display: grid;
  gap: 2px;
  font-size: 13px;
  line-height: 1.4;
}
.relation-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.relation-line :deep(.el-button) {
  white-space: normal;
  text-align: left;
}
</style>
