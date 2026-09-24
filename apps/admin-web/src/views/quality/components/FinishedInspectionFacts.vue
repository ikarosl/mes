<template>
  <el-descriptions
    :column="3"
    border
  >
    <el-descriptions-item label="检验方式">{{
      PRODUCTION_OUTPUT_INSPECTION_METHOD_LABELS[inspection.inspectionMethod]
    }}</el-descriptions-item>
    <el-descriptions-item label="整批实际送检总数">{{
      inspection.coveredQuantity
    }}</el-descriptions-item>
    <el-descriptions-item :label="isSampling ? '样本检查总数' : '实际检查总数'">{{
      inspection.inspectedQuantity
    }}</el-descriptions-item>
    <el-descriptions-item :label="isSampling ? '样本合格数' : '合格数'">{{
      inspection.qualifiedQuantity
    }}</el-descriptions-item>
    <el-descriptions-item :label="isSampling ? '样本不合格数' : '不合格数'">{{
      inspection.unqualifiedQuantity
    }}</el-descriptions-item>
    <el-descriptions-item label="整批处理结论">{{
      PRODUCTION_OUTPUT_RELEASE_DECISION_LABELS[inspection.releaseDecision]
    }}</el-descriptions-item>
    <el-descriptions-item label="本次检验建议量">{{
      inspection.releaseDecision === PRODUCTION_OUTPUT_RELEASE_DECISIONS[0]
        ? inspection.releasedQuantity
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
  <p class="inspection-note">
    明确放行时，全检建议量为合格数，抽检建议量为实际送检总数减样本不合格数，不按样本比例推算整批。数量差异仅提示，最终产出由产线管理员核对并提交负责人审批；不合格不自动登记报废。
  </p>
</template>
<script setup lang="ts">
import { computed } from 'vue';
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
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.7;
}
</style>
