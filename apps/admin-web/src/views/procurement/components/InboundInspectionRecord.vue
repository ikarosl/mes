<template>
  <el-descriptions
    :column="3"
    border
    size="small"
  >
    <el-descriptions-item label="检验方式">{{
      QUALITY_INBOUND_METHOD_LABELS[inspection.inspectionMethod]
    }}</el-descriptions-item>
    <el-descriptions-item label="覆盖量">{{
      Number(inspection.coveredQuantity)
    }}</el-descriptions-item>
    <el-descriptions-item label="明确批准入库">{{
      inspection.inboundApproved ? '是' : '否'
    }}</el-descriptions-item>
    <el-descriptions-item
      v-if="inspection.qualifiedQuantity !== null"
      label="全检合格 / 不合格"
      >{{ Number(inspection.qualifiedQuantity) }} /
      {{ Number(inspection.unqualifiedQuantity) }}</el-descriptions-item
    >
    <el-descriptions-item
      v-if="inspection.sampleQuantity !== null"
      label="抽样 / 样本不良"
      >{{ Number(inspection.sampleQuantity) }} /
      {{ Number(inspection.sampleUnqualifiedQuantity) }}</el-descriptions-item
    >
    <el-descriptions-item label="实际剔除不良">{{
      Number(inspection.removedDefectQuantity)
    }}</el-descriptions-item>
    <el-descriptions-item label="后续处置">{{
      QUALITY_INBOUND_DISPOSITION_LABELS[inspection.disposition]
    }}</el-descriptions-item>
    <el-descriptions-item label="批准量">{{
      Number(inspection.approvedQuantity)
    }}</el-descriptions-item>
    <el-descriptions-item label="质量待退量">{{
      Number(inspection.qualityReturnQuantity)
    }}</el-descriptions-item>
    <el-descriptions-item label="未判定量">{{
      Number(inspection.undeterminedQuantity)
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
    <el-descriptions-item label="记录时间">{{
      formatDateTimeForDisplay(inspection.createdAt)
    }}</el-descriptions-item>
  </el-descriptions>
</template>
<script setup lang="ts">
import type { QualityInboundInspectionItem } from '@company/contracts';
import {
  QUALITY_INBOUND_METHOD_LABELS,
  QUALITY_INBOUND_DISPOSITION_LABELS,
} from '@company/constants';
import { formatDateTimeForDisplay } from '../../../utils/date';
defineProps<{ inspection: QualityInboundInspectionItem }>();
</script>
