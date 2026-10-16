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
      <div class="processing-actions"><slot /></div>
    </div>
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
    <slot name="quantities" />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ProcurementReceiptLine } from '@company/contracts';
import { receiptLineStageLabel, receiptProcessingGuide } from '../receipt-round-presentation';

const props = defineProps<{ line: ProcurementReceiptLine }>();
const guide = computed(() => receiptProcessingGuide(props.line));
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
  flex: 1 1 100%;
  max-width: 100%;
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
  margin: 8px 0 12px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 1.5;
}
</style>
