<template>
  <el-descriptions
    :column="3"
    border
  >
    <el-descriptions-item label="检验方式">{{
      PRODUCTION_OUTPUT_INSPECTION_METHOD_LABELS[inspection.inspectionMethod]
    }}</el-descriptions-item>
    <el-descriptions-item label="整批实际送检总数"
      >{{ inspection.coveredQuantity }} 件</el-descriptions-item
    >
    <el-descriptions-item :label="isSampling ? '样本检查总数' : '实际检查总数'"
      >{{ inspection.inspectedQuantity }} 件</el-descriptions-item
    >
    <el-descriptions-item :label="isSampling ? '样本合格数' : '合格数'">
      <InspectionQuantity
        :value="inspection.qualifiedQuantity"
        kind="qualified"
        unit="件"
      />
    </el-descriptions-item>
    <el-descriptions-item :label="isSampling ? '样本不合格数' : '不合格数'">
      <InspectionQuantity
        :value="inspection.unqualifiedQuantity"
        kind="unqualified"
        unit="件"
      />
    </el-descriptions-item>
    <el-descriptions-item label="整批处理结论">{{
      PRODUCTION_OUTPUT_RELEASE_DECISION_LABELS[inspection.releaseDecision]
    }}</el-descriptions-item>
    <el-descriptions-item label="检验轮固定已入基准"
      >{{
        Number(inspection.baselinePlannedReceived) + Number(inspection.baselineExtraReceived)
      }}
      件</el-descriptions-item
    >
    <el-descriptions-item label="累计建议量"
      >{{ inspection.cumulativeSuggestionQuantity }} 件</el-descriptions-item
    >
    <el-descriptions-item label="本次检验建议量">{{
      inspection.releaseDecision === PRODUCTION_OUTPUT_RELEASE_DECISIONS[0]
        ? `${inspection.releasedQuantity} 件`
        : '未放行'
    }}</el-descriptions-item>
  </el-descriptions>
  <el-alert
    v-if="difference !== 0"
    type="warning"
    show-icon
    :closable="false"
    :title="`实际送检总数与当时申报相差 ${difference > 0 ? '+' : ''}${difference} 件`"
    :description="`当时申报 ${declaredTotal} 件，实际送检 ${inspection.coveredQuantity} 件；检验记录不回写产线草稿。`"
  />
  <InlineHint class="inspection-note">
    放行时建议量 = <strong>{{ isSampling ? '实际送检数 − 样本不合格数' : '合格数' }}</strong
    >；
    <template v-if="isSampling">不按样本比例推算。</template>
    产出仍须核对审批，<strong>不合格不自动报废</strong>。
  </InlineHint>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import InlineHint from '../../../components/InlineHint.vue';
import InspectionQuantity from './InspectionQuantity.vue';
import type { ProductionOutputInspection } from '@company/contracts';
import {
  PRODUCTION_OUTPUT_INSPECTION_METHOD_LABELS,
  PRODUCTION_OUTPUT_INSPECTION_METHODS,
  PRODUCTION_OUTPUT_RELEASE_DECISION_LABELS,
  PRODUCTION_OUTPUT_RELEASE_DECISIONS,
} from '@company/constants';
const props = defineProps<{ inspection: ProductionOutputInspection }>();
const isSampling = computed(
  () => props.inspection.inspectionMethod === PRODUCTION_OUTPUT_INSPECTION_METHODS[1],
);
const declaredTotal = computed(
  () => props.inspection.declared.availableQuantity + props.inspection.declared.extraQuantity,
);
const difference = computed(() => props.inspection.coveredQuantity - declaredTotal.value);
</script>
<style scoped>
.inspection-note {
  margin-top: 12px;
}
</style>
