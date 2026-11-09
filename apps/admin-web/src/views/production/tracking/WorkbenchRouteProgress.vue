<template>
  <section
    class="route-card"
    :aria-busy="loading"
  >
    <header class="card-heading">
      <div>
        <h2>任务工序进度</h2>
        <p>{{ routeDescription }}</p>
      </div>
      <el-button
        v-if="context && canOpenTracking"
        link
        type="primary"
        @click="$emit('history')"
      >
        记录 <el-icon><ArrowRight /></el-icon>
      </el-button>
    </header>
    <div class="route-body">
      <template v-if="context?.steps.length">
        <div class="route-identity">
          <span>{{ context.batch.productName }}</span>
          <span
            >计划 <strong>{{ formatQuantity(context.batch.plannedQuantity) }}</strong></span
          >
        </div>
        <ol class="route-list">
          <li
            v-for="(step, index) in context.steps"
            :key="step.stepRecordId"
            class="route-step"
          >
            <span
              class="step-number"
              :class="{ 'is-current': step.stepRecordId === stepId }"
            >
              {{ String(step.stepOrder).padStart(2, '0') }}
            </span>
            <div class="step-content">
              <div class="step-heading">
                <strong>{{ step.stepName }}</strong>
                <el-tag
                  v-if="step.stepRecordId === stepId"
                  size="small"
                  >当前</el-tag
                >
                <span
                  v-else-if="index === context.steps.length - 1"
                  class="terminal-label"
                  >终检</span
                >
              </div>
              <div class="step-quantity">
                <span>报工量 {{ formatQuantity(step.reportedQuantity) }}</span>
                <span>{{ completionPercent(step) }}%</span>
              </div>
              <el-progress
                :percentage="Math.min(100, completionPercent(step))"
                :stroke-width="4"
                :show-text="false"
              />
              <div class="step-meta">
                <span>在站 {{ step.currentCardCount }} 盘</span>
                <span>已完成 {{ step.completedCardCount }} 盘</span>
              </div>
              <el-button
                v-if="step.sopFileId"
                link
                type="primary"
                class="sop-link"
                @click="$emit('sop', step)"
              >
                {{ step.sopFileName || '技术文件' }}
              </el-button>
            </div>
          </li>
        </ol>
        <div class="route-note">
          <span
            >待首站到站 <strong>{{ context.summary.unusedCardCount }}</strong> 盘</span
          >
          <span
            >待处理异常
            <strong :class="{ 'has-abnormality': context.summary.openAbnormalityCount > 0 }">{{
              context.summary.openAbnormalityCount
            }}</strong>
            条</span
          >
          <span
            >整盘报废 <strong>{{ context.summary.scrappedCardCount }}</strong> 盘</span
          >
          <p>
            进度按本站报工量与任务计划数量核对。下一站扫码完成前站交接，末站以剩余盘量确认产出。
          </p>
        </div>
      </template>
      <el-empty
        v-else
        :description="emptyDescription"
        :image-size="64"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ArrowRight } from '@element-plus/icons-vue';
import type { ProductionTrackingStep, ProductionTrackingWorkbench } from '@company/contracts';
import { formatQuantity } from '../../../utils/quantity';

const props = defineProps<{
  context: ProductionTrackingWorkbench | null;
  stepId: string;
  loading: boolean;
  canOpenTracking: boolean;
}>();
defineEmits<{
  (event: 'history'): void;
  (event: 'sop', step: ProductionTrackingStep): void;
}>();
const routeDescription = computed(() => {
  if (!props.context) return '选择任务后查看工艺路线';
  const batch = props.context.batch;
  return [batch.routeCode, batch.routeVersion].filter(Boolean).join(' · ') || '任务工艺路线';
});
const emptyDescription = computed(() => {
  if (props.loading) return '正在读取任务工序';
  if (props.context?.batch.orderType === 'research') return '研发任务不使用工序追踪卡';
  return props.context ? '当前任务没有工序' : '选择任务后查看工序进度';
});
function completionPercent(step: ProductionTrackingStep): number {
  const planned = Number(props.context?.batch.plannedQuantity ?? 0);
  if (planned <= 0) return 0;
  return Math.max(0, Math.round((Number(step.reportedQuantity) / planned) * 100));
}
</script>

<style scoped>
.route-card {
  min-width: 0;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
}
.card-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.card-heading h2 {
  margin: 0;
  color: var(--el-text-color-primary);
  font-size: 16px;
  font-weight: 600;
}
.card-heading p {
  margin: 6px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  overflow-wrap: anywhere;
  line-height: 1.6;
}
.card-heading .el-button {
  flex-shrink: 0;
}
.route-body {
  padding: 20px;
}
.route-identity {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 24px;
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.6;
}
.route-identity strong {
  color: var(--el-text-color-primary);
  font-weight: 600;
}
.route-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.route-step {
  position: relative;
  display: flex;
  gap: 12px;
  padding-bottom: 24px;
}
.route-step:not(:last-child)::before {
  position: absolute;
  top: 34px;
  bottom: 6px;
  left: 15px;
  width: 1px;
  background: var(--el-border-color-lighter);
  content: '';
}
.route-step:last-child {
  padding-bottom: 0;
}
.step-number {
  display: grid;
  flex: 0 0 30px;
  place-items: center;
  height: 30px;
  border: 1px solid var(--el-border-color);
  border-radius: 50%;
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-weight: 600;
}
.step-number.is-current {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}
.step-content {
  flex: 1;
  min-width: 0;
  padding-top: 3px;
}
.step-heading,
.step-quantity,
.step-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.step-heading strong {
  color: var(--el-text-color-primary);
  font-size: 14px;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.terminal-label,
.step-quantity,
.step-meta {
  color: var(--el-text-color-regular);
  font-size: 12px;
}
.step-heading .el-tag,
.terminal-label {
  flex-shrink: 0;
}
.step-quantity {
  margin: 10px 0 8px;
  font-variant-numeric: tabular-nums;
}
.step-meta {
  margin-top: 8px;
}
.sop-link {
  max-width: 100%;
  height: auto;
  margin-top: 8px;
  font-size: 12px;
  white-space: normal;
}
.sop-link :deep(span) {
  overflow-wrap: anywhere;
}
.route-note {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.7;
}
.route-note p {
  width: 100%;
  margin: 0;
}
.has-abnormality {
  color: var(--el-color-warning);
}
</style>
