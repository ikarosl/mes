<template>
  <el-descriptions
    :column="3"
    border
    class="inspection-summary"
  >
    <el-descriptions-item label="到货明细"
      >{{ line.receiptNo }} · 第 {{ line.lineNo }} 行</el-descriptions-item
    >
    <el-descriptions-item label="采购单">{{ line.purchaseNo }}</el-descriptions-item>
    <el-descriptions-item label="供应商">{{ line.supplierName }}</el-descriptions-item>
    <el-descriptions-item
      label="物料 / 版本"
      :span="2"
    >
      <strong>{{ line.itemName }}</strong> · {{ line.itemCode }} · {{ line.materialVariantCode }}
    </el-descriptions-item>
    <el-descriptions-item label="供应商批号">{{
      line.supplierBatchCode || '未提供'
    }}</el-descriptions-item>
    <el-descriptions-item
      label="当前阶段"
      :span="2"
    >
      <el-tag
        :type="receiptLineStageType(line)"
        :effect="receiptLineStageEffect(line)"
        >{{ receiptLineStageLabel(line) }}</el-tag
      >
      <span class="round-number">当前处理第 {{ line.currentRound.roundNo }} 轮</span>
    </el-descriptions-item>
    <el-descriptions-item label="本轮剩余实物">
      <strong>{{ line.quantities.unprocessedQuantity }} {{ line.unit }}</strong>
    </el-descriptions-item>
  </el-descriptions>
  <InlineHint
    v-if="showDisposal && hasDisposal"
    class="inspection-hint"
  >
    历史实物处置：已入 {{ line.quantities.inboundQuantity }}、已退
    {{ line.quantities.returnedQuantity }} {{ line.unit }}；本次检验只处理上方剩余量。
  </InlineHint>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import type { ProcurementInboundInspectionDetail } from '@company/contracts';
import InlineHint from '../../../components/InlineHint.vue';
import {
  receiptLineStageLabel,
  receiptLineStageType,
  receiptLineStageEffect,
} from '../receipt-round-presentation';
const props = defineProps<{ line: ProcurementInboundInspectionDetail; showDisposal?: boolean }>();
const hasDisposal = computed(
  () =>
    Number(props.line.quantities.inboundQuantity) > 0 ||
    Number(props.line.quantities.returnedQuantity) > 0,
);
</script>
<style scoped>
.round-number {
  margin-left: 8px;
}
.inspection-hint {
  margin-top: 8px;
}
</style>
