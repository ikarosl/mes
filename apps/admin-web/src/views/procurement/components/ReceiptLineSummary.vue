<template>
  <div class="line-summary">
    <el-descriptions
      :column="3"
      border
      size="small"
    >
      <el-descriptions-item
        label="物料 / 版本"
        :span="2"
      >
        <strong>{{ line.itemName }}</strong> · {{ line.itemCode }} · {{ line.materialVariantCode }}
      </el-descriptions-item>
      <el-descriptions-item label="本轮阶段">
        <el-tag
          :type="receiptLineStageType(line)"
          :effect="receiptLineStageEffect(line)"
          >{{ receiptLineStageLabel(line) }}</el-tag
        >
        <span class="round-number">第 {{ line.currentRound.roundNo }} 轮</span>
      </el-descriptions-item>
      <el-descriptions-item label="实际供应商">{{ line.supplierName }}</el-descriptions-item>
      <el-descriptions-item label="供应商批号">{{
        line.supplierBatchCode || '未提供'
      }}</el-descriptions-item>
      <el-descriptions-item label="到货明细"
        >第 {{ line.lineNo }} 行
        <span class="source-id">到货明细 ID：{{ line.id }}</span></el-descriptions-item
      >
    </el-descriptions>

    <template v-if="mode === 'inspection'">
      <el-descriptions
        :column="1"
        border
        size="small"
        class="quantity-summary"
      >
        <el-descriptions-item label="本轮剩余 · 检验对象">
          <strong
            :class="
              isKnownZero(line.quantities.unprocessedQuantity)
                ? 'quantity-zero'
                : 'quantity-current'
            "
            >{{ quantityText(line.quantities.unprocessedQuantity) }} {{ line.unit }}</strong
          >
        </el-descriptions-item>
      </el-descriptions>
      <InlineHint
        v-if="hasHistoricalDisposal"
        class="line-hint"
      >
        历史实物处置：已入 {{ quantityText(line.quantities.inboundQuantity) }}、已退
        {{ quantityText(line.quantities.returnedQuantity) }}
        {{ line.unit }}；本次检验只处理上方剩余量。
      </InlineHint>
    </template>
    <template v-else>
      <el-descriptions
        :column="4"
        border
        size="small"
        class="quantity-summary"
      >
        <el-descriptions-item label="本批核实总量">
          {{ quantityText(line.quantities.receivedQuantity) }} {{ line.unit }}
        </el-descriptions-item>
        <el-descriptions-item label="累计已入">
          <span :class="isKnownZero(line.quantities.inboundQuantity) ? 'quantity-zero' : undefined">
            {{ quantityText(line.quantities.inboundQuantity) }} {{ line.unit }}
          </span>
        </el-descriptions-item>
        <el-descriptions-item label="累计已退">
          <span
            :class="isKnownZero(line.quantities.returnedQuantity) ? 'quantity-zero' : undefined"
          >
            {{ quantityText(line.quantities.returnedQuantity) }} {{ line.unit }}
          </span>
        </el-descriptions-item>
        <el-descriptions-item label="本轮剩余">
          <strong
            :class="
              isKnownZero(line.quantities.unprocessedQuantity)
                ? 'quantity-zero'
                : 'quantity-current'
            "
            >{{ quantityText(line.quantities.unprocessedQuantity) }} {{ line.unit }}</strong
          >
        </el-descriptions-item>
      </el-descriptions>
      <InlineHint
        v-if="
          !isKnownZero(line.quantities.unprocessedQuantity) &&
          line.currentRound.status === 'finalized'
        "
        class="line-hint"
      >
        本轮剩余去向：
        <template v-if="Number(line.quantities.undeterminedQuantity) > 0">
          待处理
          <strong>{{ quantityText(line.quantities.undeterminedQuantity) }} {{ line.unit }}</strong
          >；
        </template>
        <template v-if="Number(line.quantities.pendingInboundQuantity) > 0">
          可入
          <strong>{{ quantityText(line.quantities.pendingInboundQuantity) }} {{ line.unit }}</strong
          >；
        </template>
        <template v-if="Number(line.quantities.pendingReturnQuantity) > 0">
          待退
          <strong>{{ quantityText(line.quantities.pendingReturnQuantity) }} {{ line.unit }}</strong
          >。
        </template>
        <template v-if="!hasRemainingComponent">分配数量待核对。</template>
      </InlineHint>
      <InlineHint
        v-else-if="!isKnownZero(line.quantities.unprocessedQuantity)"
        :tone="phaseTone"
        class="line-hint"
        >{{ phaseHint }}</InlineHint
      >
      <InlineHint
        v-if="line.overReceiptNote"
        class="line-hint"
      >
        超量接受依据：{{ line.overReceiptNote }}
      </InlineHint>
    </template>
    <InlineHint
      v-if="mode === 'inspection' && line.quantities.hasOpenReview"
      :tone="phaseTone"
      class="line-hint"
    >
      {{ phaseHint }}
    </InlineHint>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import type { ProcurementReceiptLine } from '@company/contracts';
import InlineHint from '../../../components/InlineHint.vue';
import {
  receiptLineStageLabel,
  receiptLineStageType,
  receiptLineStageEffect,
} from '../receipt-round-presentation';

const props = withDefaults(
  defineProps<{ line: ProcurementReceiptLine; mode?: 'full' | 'inspection' }>(),
  {
    mode: 'full',
  },
);
const hasHistoricalDisposal = computed(
  () =>
    Number(props.line.quantities.inboundQuantity) > 0 ||
    Number(props.line.quantities.returnedQuantity) > 0,
);
const hasRemainingComponent = computed(() =>
  [
    props.line.quantities.undeterminedQuantity,
    props.line.quantities.pendingInboundQuantity,
    props.line.quantities.pendingReturnQuantity,
  ].some((value) => Number(value) > 0),
);
const phaseTone = computed<'info' | 'warning' | 'danger'>(() => {
  if (props.line.currentRound.status === 'quality_rejected') return 'danger';
  if (props.line.currentRound.status === 'reinspection_required') return 'warning';
  return 'info';
});
const phaseHint = computed(() => {
  switch (props.line.currentRound.status) {
    case 'reviewing':
      return '本轮检验进行中，尚未形成正常定稿与入库资格。';
    case 'reinspection_required':
      return '本轮待复检；质量阻断期间不能正常定稿或入库。';
    case 'quality_rejected':
      return '本轮检验未放行；正常定稿与入库仍被阻断。';
    case 'awaiting_acceptance':
      return '本轮检查已放行，待库管核对正式去向。';
    case 'uninspected':
      return '本轮剩余待发起检验，尚无可执行分配。';
    default:
      return '请核对本轮阶段和当前正式分配。';
  }
});
const quantityText = (value: string): string =>
  value.trim() && Number.isFinite(Number(value)) ? String(Number(value)) : '待核对';
const isKnownZero = (value: string): boolean => value.trim() !== '' && Number(value) === 0;
</script>
<style scoped>
.round-number {
  margin-left: 8px;
}
.source-id {
  display: block;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.quantity-summary,
.line-hint {
  margin-top: 8px;
}
.quantity-current {
  color: var(--el-text-color-primary);
  font-weight: 700;
}
.quantity-zero {
  color: var(--el-text-color-placeholder);
  font-weight: 400;
}
</style>
