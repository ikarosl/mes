<template>
  <el-descriptions
    :column="3"
    border
    size="small"
  >
    <el-descriptions-item label="检验记录">{{ inspection.id }}</el-descriptions-item>
    <el-descriptions-item label="检验方式">{{
      QUALITY_INSPECTION_METHOD_LABELS[inspection.inspectionMethod]
    }}</el-descriptions-item>
    <el-descriptions-item
      :label="inspection.inspectionMethod === 'sampling' ? '样本合格 / 不合格' : '合格 / 不合格'"
      >{{ inspection.qualifiedQuantity }} /
      {{ inspection.unqualifiedQuantity }}</el-descriptions-item
    >
    <el-descriptions-item label="实际检查数">{{
      inspection.inspectedQuantity
    }}</el-descriptions-item>
    <el-descriptions-item label="质量结论">{{
      QUALITY_RELEASE_DECISION_LABELS[inspection.releaseDecision]
    }}</el-descriptions-item>
    <el-descriptions-item label="线下检验时间">{{
      formatDateTimeForDisplay(inspection.inspectedAt)
    }}</el-descriptions-item>
    <el-descriptions-item label="前驱记录">{{
      inspection.previousRecordId || '—'
    }}</el-descriptions-item>
    <el-descriptions-item
      label="结论说明"
      :span="3"
      >{{ inspection.remark }}</el-descriptions-item
    >
    <el-descriptions-item
      label="检验凭据"
      :span="3"
      >{{ inspection.evidence }}</el-descriptions-item
    >
  </el-descriptions>
</template>
<script setup lang="ts">
import type { QualityInboundInspectionItem } from '@company/contracts';
import {
  QUALITY_INSPECTION_METHOD_LABELS,
  QUALITY_RELEASE_DECISION_LABELS,
} from '@company/constants';
import { formatDateTimeForDisplay } from '../../../utils/date';
defineProps<{ inspection: QualityInboundInspectionItem }>();
</script>
