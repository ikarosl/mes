<template>
  <div class="current-card-block">
    <section
      v-if="card"
      class="current-card"
      :class="{ 'is-paused': card.isPaused }"
      aria-live="polite"
    >
      <div class="current-card-heading">
        <div class="current-status">
          <span>当前盘</span>
          <el-tag :type="trackingCardStatus(card.status).type">{{
            trackingCardStatus(card.status).label
          }}</el-tag>
        </div>
        <el-button
          link
          @click="$emit('clear')"
          >清空当前显示</el-button
        >
      </div>
      <p
        v-if="resultLabel"
        class="scan-result"
      >
        {{ resultLabel }}
      </p>
      <el-alert
        v-if="attention"
        :title="attention.message"
        :type="attention.type"
        :closable="false"
        show-icon
      />
      <div class="card-number">{{ card.cardNo }}</div>
      <div class="task-identity">
        {{ card.batchNo }} · {{ card.productCode }} / {{ card.productName }}
      </div>
      <div class="card-details">
        <div class="card-detail">
          <span>本盘当前位置</span>
          <strong>{{ location }}</strong>
        </div>
        <div class="card-detail">
          <span>当前工作工序 / 登记人</span>
          <strong
            >{{ selectedStep?.stepName || '未选择工序' }} /
            {{ personnelName || '未选择人员' }}</strong
          >
        </div>
        <div class="card-detail">
          <span>当前剩余盘量</span>
          <strong class="card-quantity"
            >{{ formatQuantity(card.quantity) }}<small>{{ card.unit }}</small></strong
          >
        </div>
        <div class="card-detail">
          <span>随盘异常</span>
          <el-button
            v-if="card.openAbnormalityCount"
            link
            type="danger"
            @click="$emit('detail')"
          >
            {{ card.openAbnormalityCount }} 条{{
              card.status === 'voided' ? '未处理记录' : '待处理'
            }}
            · 查看异常
          </el-button>
          <strong v-else>无待处理异常</strong>
        </div>
      </div>
      <div
        class="card-steps"
        aria-label="本盘工序流转"
      >
        <span
          v-for="step in steps"
          :key="step.stepRecordId"
          class="card-step"
          :class="stepState(step)"
        >
          {{ step.stepOrder }}. {{ step.stepName }} · {{ stepLabel(step) }}
        </span>
      </div>
      <p class="flow-hint">{{ flowHint }}</p>
    </section>
    <section
      v-else
      class="scan-empty"
    >
      <span class="scan-illustration"
        ><el-icon><FullScreen /></el-icon
      ></span>
      <strong>等待识别条形码标签</strong>
      <p>选择任务、当前工序与登记人后扫码到站。<br />首工序可先建卡，后续工序沿用同一个追踪码。</p>
    </section>
    <div
      v-if="card"
      class="card-actions"
    >
      <el-button
        v-if="canConfirmOutput"
        type="primary"
        :disabled="disabled || card.openAbnormalityCount > 0"
        @click="$emit('action', 'output')"
      >
        终检确认产出
      </el-button>
      <el-button
        v-if="canReportAbnormality"
        type="warning"
        plain
        :disabled="disabled"
        @click="$emit('action', 'abnormality')"
        >上报异常</el-button
      >
      <el-button @click="$emit('detail')">查看追踪</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { FullScreen } from '@element-plus/icons-vue';
import type { ProductionTrackingCardDetail, ProductionTrackingStep } from '@company/contracts';
import { formatQuantity } from '../../../utils/quantity';
import { trackingCardStatus, type TrackingCardAction } from './tracking-presentation';

const props = defineProps<{
  card: ProductionTrackingCardDetail | null;
  steps: ProductionTrackingStep[];
  stepId: string;
  personnelName: string;
  resultLabel: string;
  disabled: boolean;
}>();
defineEmits<{
  (event: 'clear'): void;
  (event: 'detail'): void;
  (event: 'action', action: TrackingCardAction): void;
}>();
const selectedStep = computed(() => props.steps.find((step) => step.stepRecordId === props.stepId));
const canReportAbnormality = computed(
  () =>
    props.card &&
    Number(props.card.quantity) > 0 &&
    !['voided', 'completed', 'scrapped'].includes(props.card.status),
);
const canConfirmOutput = computed(
  () =>
    props.card?.status === 'in_progress' &&
    Number(props.card.quantity) > 0 &&
    props.steps.length > 0 &&
    props.card.currentStepRecordId === props.steps.at(-1)?.stepRecordId,
);
const location = computed(() => {
  if (!props.card) return '—';
  if (props.card.status === 'completed') return '已完成终检定稿';
  if (props.card.status === 'scrapped') return '已整盘报废';
  if (props.card.status === 'voided') return '已人工作废';
  return props.card.currentStepName || '等待首站到站';
});
const attention = computed<{ type: 'error' | 'warning' | 'info'; message: string } | null>(() => {
  const card = props.card;
  if (!card) return null;
  if (card.status === 'voided')
    return { type: 'info', message: `本盘已人工作废：${card.voidReason || '—'}` };
  if (card.status === 'scrapped')
    return { type: 'error', message: '本盘已整盘报废，异常已全部结算，无产出、无需入库。' };
  if (card.openAbnormalityCount)
    return {
      type: 'error',
      message:
        Number(card.quantity) === 0
          ? '本盘剩余盘量为0，仍有异常待处理；请继续完成异常结算。'
          : '本盘有待处理异常，已暂停整盘流转；全部处理完成后才能继续。',
    };
  return null;
});
const flowHint = computed(() => {
  const card = props.card;
  if (!card) return '';
  if (card.status === 'voided') return '到站、报工与异常历史保留，可打开追踪详情核对。';
  if (card.status === 'scrapped')
    return '整盘报废后保留到站、报工与异常结算记录，不能继续流转或更改盘量。';
  if (Number(card.quantity) === 0 && card.openAbnormalityCount > 0)
    return '剩余异常可关联本盘其他问题中已登记的报废记录，本次新增报废填写0。';
  if (card.openAbnormalityCount > 0) return '请打开追踪详情逐条处理随盘问题，当前盘暂停流转。';
  if (card.availableQuantity !== null)
    return `实际可用产出已确认：${formatQuantity(card.availableQuantity)} ${card.unit}。`;
  if (card.status === 'unused') return '追踪卡已生成。建卡与打印不登记到站，请在首工序扫码。';
  if (canConfirmOutput.value)
    return '本盘已到达末站。加工完成并处理全部异常后，以当前剩余盘量确认终检产出；后续单独办理成品入库。';
  return '本盘已到站。流转至下一工序后，由下一站扫码完成本站交接，无需再次确认。';
});
function stepState(step: ProductionTrackingStep): 'is-completed' | 'is-current' | '' {
  const visit = props.card?.visits.find((item) => item.stepRecordId === step.stepRecordId);
  if (visit?.completedAt) return 'is-completed';
  return visit ? 'is-current' : '';
}
function stepLabel(step: ProductionTrackingStep): string {
  const state = stepState(step);
  if (state === 'is-completed') return '已完成';
  return state === 'is-current' ? '已到站' : '待到站';
}
</script>

<style scoped>
.current-card,
.scan-empty {
  min-height: 250px;
  margin-top: 20px;
  padding: 20px;
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
}
.current-card {
  border: 1px solid var(--el-color-primary-light-5);
  background: var(--el-bg-color);
}
.current-card.is-paused {
  border-color: var(--el-color-danger);
}
.current-card-heading,
.current-status {
  display: flex;
  align-items: center;
  gap: 8px;
}
.current-card-heading {
  justify-content: space-between;
  gap: 12px;
}
.current-status > span {
  color: var(--el-text-color-regular);
  font-size: 12px;
}
.current-card .el-alert {
  margin-top: 12px;
}
.scan-result {
  margin: 12px 0 0;
  color: var(--el-color-success);
  font-size: 14px;
  line-height: 1.6;
}
.card-number {
  margin-top: 14px;
  color: var(--el-text-color-primary);
  font-size: 24px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.task-identity {
  margin-top: 6px;
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.card-details {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px 24px;
  margin-top: 20px;
}
.card-detail {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 7px;
  min-width: 0;
  font-size: 14px;
  line-height: 1.6;
}
.card-detail > span {
  color: var(--el-text-color-regular);
  font-size: 12px;
}
.card-detail strong {
  color: var(--el-text-color-primary);
  font-weight: 500;
  overflow-wrap: anywhere;
}
.card-detail .el-button {
  height: auto;
  font-size: 14px;
  white-space: normal;
}
.card-detail .card-quantity {
  font-size: 28px;
  font-weight: 600;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}
.card-quantity small {
  margin-left: 6px;
  font-size: 12px;
  font-weight: 400;
}
.card-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 20px;
}
.card-step {
  padding: 5px 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.6;
}
.card-step.is-current {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}
.card-step.is-completed {
  background: var(--el-color-success-light-9);
  color: var(--el-color-success);
}
.flow-hint {
  margin: 14px 0 0;
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.7;
}
.scan-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}
.scan-illustration {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  margin-bottom: 16px;
  border-radius: 16px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  font-size: 32px;
}
.scan-empty > strong {
  color: var(--el-text-color-regular);
  font-size: 16px;
  font-weight: 500;
}
.scan-empty > p {
  margin: 8px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.8;
}
.card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}
.card-actions .el-button + .el-button {
  margin-left: 0;
}
</style>
