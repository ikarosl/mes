<template>
  <div
    ref="container"
    class="route-container"
  >
    <ol
      class="route-grid"
      :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 220px))` }"
      aria-label="工序流转，按编号顺序呈 S 型排列"
    >
      <li
        v-for="(node, index) in nodes"
        :key="node?.id ?? 'output'"
        class="route-node"
        :style="position(index)"
      >
        <button
          v-if="node"
          class="step"
          :class="{ selected: selectedStep === node.id }"
          :aria-pressed="selectedStep === node.id"
          @click="$emit('select', node.id)"
        >
          <span class="step-heading"
            ><span class="step-number">{{ String(node.order).padStart(2, '0') }}</span
            ><strong :title="node.name">{{ node.name }}</strong></span
          >
          <template v-if="'arrivedCardCount' in node">
            <span class="step-quantity"
              >到站 {{ node.arrivedCardCount }} 盘 · 完成交接 {{ node.completedCardCount }} 盘</span
            >
            <span class="step-quantity"
              >交接 <b>{{ quantity(node.reportedQuantity) }}</b> {{ unit }}</span
            >
            <small>期间异常 {{ node.abnormalityCount }} 条</small>
          </template>
          <template v-else>
            <span class="step-quantity"
              >在制 <b>{{ quantity(node.quantity) }}</b> {{ unit }} · {{ node.cardCount }} 盘</span
            >
            <small>{{
              node.cardCount ? `最长停留 ${dwell(node.oldestArrival, asOf)}` : '暂无在制'
            }}</small>
          </template>
        </button>
        <div
          v-else
          class="step output"
        >
          <strong>{{ period ? '期间有效产出' : '有效产出' }}</strong
          ><span class="step-quantity"
            ><b>{{ quantity(outputQuantity) }}</b> {{ unit }}</span
          >
        </div>
        <span
          v-if="index < nodes.length - 1"
          class="connector"
          :class="direction(index)"
          aria-hidden="true"
        />
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch, type CSSProperties } from 'vue';
import type { ProductionDashboardStep, ProductionDashboardPeriodStep } from '@company/contracts';
import { dwell, quantity } from './dashboard-presentation';

const props = defineProps<{
  steps: (ProductionDashboardStep | ProductionDashboardPeriodStep)[];
  period?: boolean;
  selectedStep: string | null;
  unit: string;
  asOf: string;
  outputQuantity: string;
}>();
defineEmits<{ select: [id: string] }>();
const container = ref<HTMLDivElement>();
const width = ref(0);
const nodes = computed(() => [...props.steps, null]);
const columns = computed(() =>
  Math.min(nodes.value.length, Math.max(1, Math.floor((width.value + 32) / 252))),
);
let observer: ResizeObserver | undefined;
watch(
  container,
  (element) => {
    observer?.disconnect();
    if (!element) return;
    width.value = element.clientWidth;
    observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) width.value = entry.contentRect.width;
    });
    observer.observe(element);
  },
  { flush: 'post' },
);
onBeforeUnmount(() => observer?.disconnect());

// DOM and keyboard order follow the real route; only visual grid positions reverse.
function position(index: number): CSSProperties {
  const row = Math.floor(index / columns.value);
  const offset = index % columns.value;
  return { gridRow: row + 1, gridColumn: row % 2 ? columns.value - offset : offset + 1 };
}
function direction(index: number): 'down' | 'left' | 'right' {
  if ((index + 1) % columns.value === 0) return 'down';
  return Math.floor(index / columns.value) % 2 ? 'left' : 'right';
}
</script>

<style scoped>
.route-container {
  min-width: 0;
  padding: 4px 0 16px;
}
.route-grid {
  display: grid;
  gap: 32px;
  padding: 0;
  margin: 0;
  list-style: none;
}
.route-node {
  position: relative;
  min-width: 0;
  display: flex;
}
.step {
  box-sizing: border-box;
  width: 100%;
  min-height: 116px;
  padding: 14px 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-primary);
  font: inherit;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 10px;
  text-align: left;
  cursor: pointer;
}
.step:hover {
  border-color: var(--el-color-primary-light-5);
}
.step:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}
.step.selected {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.step-heading {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
}
.step-heading strong {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 14px;
  line-height: 20px;
}
.step-number {
  flex-shrink: 0;
  font-size: 12px;
  line-height: 20px;
  color: var(--el-text-color-secondary);
}
.selected .step-number {
  color: var(--el-color-primary);
}
.step-quantity {
  font-size: 14px;
  line-height: 20px;
  overflow-wrap: anywhere;
}
.step small {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 18px;
}
.step.output {
  border-color: var(--el-color-success-light-5);
  cursor: default;
}
.output > strong {
  color: var(--el-color-success);
  font-size: 14px;
}
.connector {
  position: absolute;
  pointer-events: none;
  color: var(--el-text-color-placeholder);
}
.connector::after {
  content: '';
  position: absolute;
  width: 6px;
  height: 6px;
  border-top: 1.5px solid currentColor;
  border-right: 1.5px solid currentColor;
}
.right,
.left {
  top: 50%;
  width: 24px;
  border-top: 1.5px solid currentColor;
}
.right {
  left: calc(100% + 4px);
}
.right::after {
  right: 0;
  top: -4px;
  transform: rotate(45deg);
}
.left {
  right: calc(100% + 4px);
}
.left::after {
  left: 0;
  top: -4px;
  transform: rotate(-135deg);
}
.down {
  top: calc(100% + 4px);
  left: 50%;
  height: 24px;
  border-left: 1.5px solid currentColor;
}
.down::after {
  bottom: 0;
  left: -4px;
  transform: rotate(135deg);
}
</style>
