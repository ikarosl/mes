<template>
  <section
    class="processing-card"
    :class="`processing-card--${guide.tone}`"
    aria-label="当前处理"
  >
    <div class="processing-heading">
      <div class="processing-guide">
        <span class="processing-eyebrow">当前处理 · 第 {{ line.currentRound.roundNo }} 轮</span>
        <h3>{{ receiptLineStageLabel(line) }}</h3>
        <p><strong>下一步：</strong>{{ guide.nextStep }}</p>
      </div>
    </div>
    <dl
      v-if="!isReceiptVoided(line)"
      class="processing-quantities"
    >
      <div>
        <dt>待入库</dt>
        <dd
          :class="{ 'quantity-zero': parseQuantity(line.quantities.pendingInboundQuantity) === 0 }"
        >
          {{ quantityText(line.quantities.pendingInboundQuantity) }} <small>{{ line.unit }}</small>
        </dd>
      </div>
      <div>
        <dt>待退回</dt>
        <dd
          :class="receiptReturnQuantityClass(parseQuantity(line.quantities.pendingReturnQuantity))"
        >
          {{ quantityText(line.quantities.pendingReturnQuantity) }} <small>{{ line.unit }}</small>
        </dd>
      </div>
      <div>
        <dt>待明确去向</dt>
        <dd :class="{ 'quantity-zero': parseQuantity(line.quantities.undeterminedQuantity) === 0 }">
          {{ quantityText(line.quantities.undeterminedQuantity) }} <small>{{ line.unit }}</small>
        </dd>
      </div>
    </dl>
    <div class="processing-actions"><slot /></div>
    <div class="flow-heading">本轮处理流程</div>
    <ol class="receipt-flow">
      <li
        v-for="(step, index) in guide.steps"
        :key="step.label"
        :class="`flow-step--${step.tone}`"
      >
        <span class="flow-number">{{ index + 1 }}</span>
        <div>
          <strong>{{ step.label }}</strong
          ><span>{{ step.detail }}</span>
        </div>
      </li>
    </ol>
    <p class="flow-note">{{ guide.note }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ProcurementReceiptLine } from '@company/contracts';
import {
  isReceiptVoided,
  receiptLineStageLabel,
  receiptProcessingGuide,
  receiptReturnQuantityClass,
} from '../receipt-round-presentation';

const props = defineProps<{ line: ProcurementReceiptLine }>();
const guide = computed(() => receiptProcessingGuide(props.line));
const parseQuantity = (value: string): number | null => {
  if (!value.trim()) return null;
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : null;
};
const quantityText = (value: string): string => parseQuantity(value)?.toString() ?? '待核对';
</script>

<style scoped>
.processing-card {
  --processing-color: var(--el-color-primary);
  padding: 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-top: 3px solid var(--processing-color);
  border-radius: var(--el-border-radius-base);
  background: var(--el-bg-color);
}
.processing-card--warning {
  --processing-color: var(--el-color-warning);
}
.processing-card--danger {
  --processing-color: var(--el-color-danger);
}
.processing-card--success {
  --processing-color: var(--el-color-success);
}
.processing-heading {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px 20px;
}
.processing-guide {
  flex: 1 1 320px;
}
.processing-eyebrow {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
h3 {
  margin: 5px 0 8px;
  color: var(--processing-color);
  font-size: 20px;
}
.processing-guide p {
  margin: 0;
  color: var(--el-text-color-regular);
  line-height: 1.6;
}
.processing-guide p strong {
  color: var(--el-text-color-primary);
}
.processing-actions {
  margin-top: 12px;
}
.processing-quantities {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 12px 0 0;
  padding: 12px 0;
  border-top: 1px solid var(--el-border-color-lighter);
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.processing-quantities dt {
  color: var(--el-text-color-regular);
  font-size: 13px;
}
.processing-quantities dd {
  margin: 5px 0 0;
  color: var(--el-text-color-primary);
  font-size: 18px;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.processing-quantities dd.quantity-zero {
  color: var(--el-text-color-placeholder);
  font-weight: 400;
}
.processing-quantities dd.quantity-return {
  color: var(--el-color-warning-dark-2);
}
.processing-quantities small {
  font-size: 13px;
  font-weight: 400;
}
.flow-heading {
  margin-top: 16px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.receipt-flow {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}
.receipt-flow li {
  --step-color: var(--el-text-color-secondary);
  display: flex;
  align-items: flex-start;
  flex: 1 1 125px;
  gap: 7px;
  padding: 8px;
  background: var(--el-fill-color-light);
  border-radius: var(--el-border-radius-base);
  border-bottom: 2px solid transparent;
  color: var(--el-text-color-primary);
}
.receipt-flow .flow-step--primary {
  --step-color: var(--el-color-primary);
  border-color: var(--el-color-primary);
}
.receipt-flow .flow-step--warning {
  --step-color: var(--el-color-warning);
  border-color: var(--el-color-warning);
}
.receipt-flow .flow-step--danger {
  --step-color: var(--el-color-danger);
  border-color: var(--el-color-danger);
}
.receipt-flow .flow-step--success {
  --step-color: var(--el-color-success);
  border-color: var(--el-color-success);
}
.flow-number {
  color: var(--step-color);
  font-weight: 700;
}
.receipt-flow strong {
  display: block;
  color: var(--step-color);
  font-size: 14px;
}
.receipt-flow li div > span {
  display: block;
  margin-top: 3px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
.flow-note {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 1.5;
}
</style>
