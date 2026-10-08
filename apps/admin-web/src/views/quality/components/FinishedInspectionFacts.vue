<template>
  <el-descriptions
    :column="column"
    border
    size="small"
  >
    <el-descriptions-item label="检验方式">{{
      PRODUCTION_OUTPUT_INSPECTION_METHOD_LABELS[inspection.inspectionMethod]
    }}</el-descriptions-item>
    <el-descriptions-item :label="isSampling ? '样本检查总数' : '实际检查总数'"
      >{{ inspection.inspectedQuantity }} {{ unit }}</el-descriptions-item
    >
    <el-descriptions-item :label="isSampling ? '样本合格数' : '合格数'">
      <InspectionQuantity
        :value="inspection.qualifiedQuantity"
        kind="qualified"
        :unit="unit"
      />
    </el-descriptions-item>
    <el-descriptions-item :label="isSampling ? '样本不合格数' : '不合格数'">
      <InspectionQuantity
        :value="inspection.unqualifiedQuantity"
        kind="unqualified"
        :unit="unit"
      />
    </el-descriptions-item>
    <el-descriptions-item label="整批处理结论">{{
      PRODUCTION_OUTPUT_RELEASE_DECISION_LABELS[inspection.releaseDecision]
    }}</el-descriptions-item>
    <el-descriptions-item label="检验轮建立时已入"
      >{{ Number(inspection.baselinePlannedReceived) + Number(inspection.baselineExtraReceived) }}
      {{ unit }}</el-descriptions-item
    >
  </el-descriptions>
  <InlineHint class="inspection-note">
    <template v-if="isSampling">抽检仅记录样本事实，不推算整批数量；</template>
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
} from '@company/constants';
const props = withDefaults(
  defineProps<{ inspection: ProductionOutputInspection; column?: 1 | 3; unit?: string }>(),
  { column: 3, unit: '件' },
);
const isSampling = computed(
  () => props.inspection.inspectionMethod === PRODUCTION_OUTPUT_INSPECTION_METHODS[1],
);
</script>
<style scoped>
.inspection-note {
  margin-top: 12px;
}
</style>
