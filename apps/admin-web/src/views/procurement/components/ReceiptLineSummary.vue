<template>
  <div class="line-summary">
    <el-descriptions
      v-if="section !== 'quantities'"
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
      <el-descriptions-item label="到货明细 ID">id:{{ line.id }}</el-descriptions-item>
    </el-descriptions>

    <div
      v-if="section === 'quantities'"
      class="quantity-focus"
    >
      <dl v-if="!isReceiptVoided(line)">
        <div>
          <dt>本轮剩余</dt>
          <dd :class="{ 'quantity-zero': isKnownZero(line.quantities.unprocessedQuantity) }">
            {{ quantityText(line.quantities.unprocessedQuantity) }} <small>{{ line.unit }}</small>
          </dd>
        </div>
        <div>
          <dt>待入库</dt>
          <dd :class="{ 'quantity-zero': isKnownZero(line.quantities.pendingInboundQuantity) }">
            {{ quantityText(line.quantities.pendingInboundQuantity) }}
            <small>{{ line.unit }}</small>
          </dd>
        </div>
        <div>
          <dt>待退回</dt>
          <dd :class="{ 'quantity-zero': isKnownZero(line.quantities.pendingReturnQuantity) }">
            {{ quantityText(line.quantities.pendingReturnQuantity) }} <small>{{ line.unit }}</small>
          </dd>
        </div>
        <div>
          <dt>待明确去向</dt>
          <dd :class="{ 'quantity-zero': isKnownZero(line.quantities.undeterminedQuantity) }">
            {{ quantityText(line.quantities.undeterminedQuantity) }} <small>{{ line.unit }}</small>
          </dd>
        </div>
      </dl>
      <div class="actual-quantities">
        <span
          >{{ isReceiptVoided(line) ? '作废前核实量' : '本批核实总量' }}
          <strong
            >{{ registeredQuantity === null ? '见实收修订' : quantityText(registeredQuantity) }}
            <template v-if="registeredQuantity !== null">{{ line.unit }}</template></strong
          ></span
        >
        <span
          >累计已入
          <strong>{{ quantityText(line.quantities.inboundQuantity) }} {{ line.unit }}</strong></span
        >
        <span
          >累计已退
          <strong
            >{{ quantityText(line.quantities.returnedQuantity) }} {{ line.unit }}</strong
          ></span
        >
      </div>
    </div>
    <template v-if="section === 'all'">
      <el-descriptions
        :column="4"
        border
        size="small"
        class="quantity-summary"
      >
        <el-descriptions-item :label="isReceiptVoided(line) ? '作废前核实量' : '本批核实总量'">
          {{ registeredQuantity === null ? '见实收修订' : quantityText(registeredQuantity) }}
          <template v-if="registeredQuantity !== null">{{ line.unit }}</template>
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
        <el-descriptions-item
          v-if="!isReceiptVoided(line)"
          label="本轮剩余"
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
        v-else-if="isReceiptVoided(line) || !isKnownZero(line.quantities.unprocessedQuantity)"
        :tone="phaseTone"
        class="line-hint"
        >{{ phaseHint }}</InlineHint
      >
    </template>
    <InlineHint
      v-if="section !== 'identity' && line.overReceiptNote"
      :tone="section === 'quantities' ? 'warning' : 'info'"
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
  isReceiptVoided,
} from '../receipt-round-presentation';

const props = withDefaults(
  defineProps<{
    line: ProcurementReceiptLine;
    section?: 'all' | 'identity' | 'quantities';
  }>(),
  { section: 'all' },
);
const registeredQuantity = computed(() =>
  isReceiptVoided(props.line)
    ? (props.line.revisions.find((revision) => revision.id === props.line.currentReceiptRevisionId)
        ?.receivedQuantity ?? null)
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
.quantity-focus dl {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
  padding: 12px 0;
  border-top: 1px solid var(--el-border-color-lighter);
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.quantity-focus dt {
  color: var(--el-text-color-regular);
  font-size: 13px;
}
.quantity-focus dd {
  margin: 5px 0 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  overflow-wrap: anywhere;
}
.quantity-focus dd.quantity-zero {
  color: var(--el-text-color-placeholder);
  font-weight: 400;
}
.quantity-focus small {
  font-size: 13px;
  font-weight: 400;
}
.actual-quantities {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 20px;
  margin-top: 10px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.actual-quantities strong {
  color: var(--el-text-color-primary);
}
@media (max-width: 720px) {
  .quantity-focus dl {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
