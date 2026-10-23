<template>
  <div class="line-summary">
    <el-descriptions
      :column="section === 'all' ? 3 : 2"
      border
      size="small"
    >
      <el-descriptions-item
        label="物料 / 版本"
        :span="section === 'all' ? 2 : 1"
      >
        <strong>{{ line.itemName }}</strong> · {{ line.materialVariantCode }}
      </el-descriptions-item>
      <el-descriptions-item
        v-if="section === 'identity'"
        label="采购行 ID"
        >id:{{ line.purchaseOrderLineId }}</el-descriptions-item
      >
      <el-descriptions-item
        v-if="section === 'all'"
        label="本轮阶段"
      >
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
      <el-descriptions-item
        v-if="section === 'all'"
        label="到货明细 ID"
        >id:{{ line.id }}</el-descriptions-item
      >
    </el-descriptions>
    <template v-if="section === 'all'">
      <el-descriptions
        :column="4"
        border
        size="small"
        class="quantity-summary"
      >
        <el-descriptions-item :label="isReceiptVoided(line) ? '作废前到货量' : '本批到货量'">
          {{ registeredQuantity === null ? '见到货量修订' : quantityText(registeredQuantity) }}
          <template v-if="registeredQuantity !== null">{{ line.unit }}</template>
        </el-descriptions-item>
        <el-descriptions-item label="已入库">
          <span :class="isKnownZero(line.quantities.inboundQuantity) ? 'quantity-zero' : undefined">
            {{ quantityText(line.quantities.inboundQuantity) }} {{ line.unit }}
          </span>
        </el-descriptions-item>
        <el-descriptions-item label="已退回">
          <span :class="receiptReturnQuantityClass(line.quantities.returnedQuantity)">
            {{ quantityText(line.quantities.returnedQuantity) }} {{ line.unit }}
          </span>
        </el-descriptions-item>
        <el-descriptions-item
          v-if="!isReceiptVoided(line)"
          label="尚未入库或退回"
        >
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
      <p
        v-if="!isReceiptVoided(line)"
        class="quantity-definition"
      >
        尚未入库或退回 = 到货量 − 已入库 − 已退回。
      </p>
      <InlineHint
        v-if="
          !isKnownZero(line.quantities.unprocessedQuantity) &&
          line.currentRound.status === 'finalized'
        "
        class="line-hint"
      >
        尚未入库或退回的去向：
        <template v-if="Number(line.quantities.undeterminedQuantity) > 0">
          待处理
          <strong>{{ quantityText(line.quantities.undeterminedQuantity) }} {{ line.unit }}</strong
          >；
        </template>
        <template v-if="Number(line.quantities.pendingInboundQuantity) > 0">
          待入库
          <strong>{{ quantityText(line.quantities.pendingInboundQuantity) }} {{ line.unit }}</strong
          >；
        </template>
        <template v-if="Number(line.quantities.pendingReturnQuantity) > 0">
          待退回
          <strong :class="receiptReturnQuantityClass(line.quantities.pendingReturnQuantity)"
            >{{ quantityText(line.quantities.pendingReturnQuantity) }} {{ line.unit }}</strong
          >。
        </template>
        <template v-if="!hasRemainingComponent">分配数量待核对。</template>
      </InlineHint>
      <InlineHint
        v-else-if="isReceiptVoided(line) || !isKnownZero(line.quantities.unprocessedQuantity)"
        :tone="phaseTone"
        class="line-hint"
        >{{ phaseHint }}</InlineHint
      >
    </template>
    <InlineHint
      v-if="section === 'all' && line.overReceiptNote"
      tone="warning"
      class="line-hint"
    >
      超量接受依据：{{ line.overReceiptNote }}
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
  receiptReturnQuantityClass,
  isReceiptVoided,
} from '../receipt-round-presentation';

const props = withDefaults(
  defineProps<{
    line: ProcurementReceiptLine;
    section?: 'all' | 'identity';
  }>(),
  { section: 'all' },
);
const registeredQuantity = computed(() =>
  isReceiptVoided(props.line)
    ? props.line.registeredQuantity || null
    : props.line.quantities.receivedQuantity,
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
    case 'voided':
      return '到货登记已作废，原始数量和历史依据保留，未执行授权已失效。';
    case 'reviewing':
      return '本轮检验进行中，尚未形成正常定稿与入库资格。';
    case 'reinspection_required':
      return '本轮待复检；质量阻断期间不能正常定稿或入库。';
    case 'quality_rejected':
      return '本轮检验未放行；正常定稿与入库仍被阻断。';
    case 'awaiting_acceptance':
      return '本轮检查已放行，待库管核对正式去向。';
    case 'uninspected':
      return '尚未入库或退回的实物待发起检验，尚无可执行分配。';
    default:
      return '请核对本轮阶段和当前正式分配。';
  }
});
const quantityText = (value: string): string =>
  value.trim() && Number.isFinite(Number(value)) ? String(Number(value)) : '待核对';
const isKnownZero = (value: string): boolean => value.trim() !== '' && Number(value) === 0;
</script>
<style scoped>
.line-summary :deep(.el-descriptions__cell) {
  overflow-wrap: anywhere;
}
.round-number {
  margin-left: 8px;
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
.line-hint strong.quantity-return,
.quantity-return {
  color: var(--el-color-warning-dark-2);
  font-weight: 700;
}
.quantity-definition {
  margin: 8px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
