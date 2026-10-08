<template>
  <div class="inspection-record-detail">
    <el-descriptions
      :column="column"
      border
      size="small"
    >
      <el-descriptions-item label="质检记录"
        >id {{ inspection.id }}<template v-if="relationship"> · {{ relationship }}</template>
      </el-descriptions-item>
      <el-descriptions-item
        v-if="column === 1"
        label="检验时间 / 登记人"
      >
        {{ formatDateTimeForDisplay(inspection.inspectedAt) }} · {{ inspection.createdByName }}
      </el-descriptions-item>
      <template v-else>
        <el-descriptions-item label="质检登记人">{{
          inspection.createdByName
        }}</el-descriptions-item>
        <el-descriptions-item label="线下检验时间">{{
          formatDateTimeForDisplay(inspection.inspectedAt)
        }}</el-descriptions-item>
      </template>
      <el-descriptions-item
        v-if="roundLabel"
        label="所属检验轮"
        >{{ roundLabel }}</el-descriptions-item
      >
      <el-descriptions-item
        v-if="column !== 1"
        label="登记时间"
        >{{ formatDateTimeForDisplay(inspection.createdAt) }}</el-descriptions-item
      >
      <el-descriptions-item
        v-if="column !== 1"
        label="前次质检记录"
        >{{
          inspection.previousInspectionId ? `id ${inspection.previousInspectionId}` : '首次检验'
        }}</el-descriptions-item
      >
    </el-descriptions>
    <FinishedInspectionFacts
      :inspection="inspection"
      :column="column"
      :unit="unit"
    />
    <el-descriptions
      :column="column"
      border
      size="small"
      class="inspection-reference"
    >
      <el-descriptions-item
        label="登记检验时的产线申报数量"
        :span="column"
      >
        计划内 {{ inspection.declared.availableQuantity }} {{ unit }} · 计划外
        {{ inspection.declared.extraQuantity }} {{ unit }} · 新增报废
        {{ inspection.declared.additionalScrapQuantity }} {{ unit }}
      </el-descriptions-item>
      <el-descriptions-item
        label="检验说明"
        :span="column"
      >
        <span class="evidence-text">{{ inspection.resultNote }}</span>
      </el-descriptions-item>
      <el-descriptions-item
        label="凭据参考"
        :span="column"
      >
        <span class="evidence-text">{{ inspection.evidenceReference || '未填写' }}</span>
      </el-descriptions-item>
    </el-descriptions>
  </div>
</template>
<script setup lang="ts">
import type { ProductionOutputInspection } from '@company/contracts';
import { formatDateTimeForDisplay } from '../../../utils/date';
import FinishedInspectionFacts from './FinishedInspectionFacts.vue';

withDefaults(
  defineProps<{
    inspection: ProductionOutputInspection;
    column?: 1 | 3;
    unit?: string;
    relationship?: string;
    roundLabel?: string | null;
  }>(),
  { column: 3, unit: '件', relationship: '', roundLabel: null },
);
</script>
<style scoped>
.inspection-record-detail {
  min-width: 0;
}
.inspection-reference {
  margin-top: 12px;
}
.evidence-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
