<template>
  <el-descriptions
    :column="3"
    border
    size="small"
  >
    <el-descriptions-item label="线下检验时间">{{
      formatDateTimeForDisplay(inspection.inspectedAt)
    }}</el-descriptions-item>
    <el-descriptions-item label="检验方式">{{
      QUALITY_INSPECTION_METHOD_LABELS[inspection.inspectionMethod]
    }}</el-descriptions-item>
    <el-descriptions-item label="实际检查数">{{
      inspection.inspectedQuantity
    }}</el-descriptions-item>
    <el-descriptions-item
      :label="inspection.inspectionMethod === 'sampling' ? '样本合格' : '合格数'"
    >
      <InspectionQuantity
        :value="inspection.qualifiedQuantity"
        kind="qualified"
      />
    </el-descriptions-item>
    <el-descriptions-item
      :label="inspection.inspectionMethod === 'sampling' ? '样本不合格' : '不合格数'"
    >
      <InspectionQuantity
        :value="inspection.unqualifiedQuantity"
        kind="unqualified"
      />
    </el-descriptions-item>
    <el-descriptions-item label="质量结论">
      <el-tag
        :type="
          inspection.releaseDecision === 'released'
            ? 'success'
            : inspection.releaseDecision === 'not_released'
              ? 'danger'
              : 'warning'
        "
      >
        {{ QUALITY_RELEASE_DECISION_LABELS[inspection.releaseDecision] }}
      </el-tag>
    </el-descriptions-item>
    <el-descriptions-item
      v-if="roundNo !== undefined"
      label="所属处理轮"
      >第 {{ roundNo }} 轮</el-descriptions-item
    >
    <el-descriptions-item label="检验记录 ID">{{ inspection.id }}</el-descriptions-item>
    <el-descriptions-item
      v-if="inspection.previousRecordId"
      label="前次检验记录 ID"
      >{{ inspection.previousRecordId }}</el-descriptions-item
    >
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
import InspectionQuantity from '../../quality/components/InspectionQuantity.vue';
defineProps<{ inspection: QualityInboundInspectionItem; roundNo?: number }>();
</script>
