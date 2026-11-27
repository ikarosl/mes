<template>
  <div class="date-toolbar">
    <el-radio-group
      v-model="period"
      size="small"
      @change="choosePeriod"
      ><el-radio-button value="week">本周</el-radio-button
      ><el-radio-button value="month">本月</el-radio-button
      ><el-radio-button value="quarter">本季度</el-radio-button
      ><el-radio-button value="custom">自定义</el-radio-button></el-radio-group
    ><el-date-picker
      v-model="dates"
      type="daterange"
      value-format="YYYY-MM-DD"
      format="YYYY/MM/DD"
      start-placeholder="开始日期"
      end-placeholder="结束日期"
      range-separator="至"
      :clearable="false"
      @change="period = 'custom'"
    /><el-button
      size="small"
      @click="applyDates"
      >应用日期</el-button
    ><span>排期与期间统计日期，最长366天；当前在制看实时状态</span>
  </div>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue';
import { PRODUCTION_DASHBOARD_MAX_DAYS } from '@company/constants';
import { EMessage } from '../../../utils/message';
import { beijingDate, dateValue, shiftDate, dayMilliseconds } from './dashboard-presentation';
type Range = { startDate: string; endDate: string };
const props = defineProps<{ range: Range }>();
const emit = defineEmits<{ apply: [range: Range] }>();
const dates = ref<[string, string]>([props.range.startDate, props.range.endDate]);
const first = beijingDate().slice(0, 7) + '-01';
const period = ref(
  props.range.startDate === first && props.range.endDate === monthEnd(first, 1)
    ? 'month'
    : 'custom',
);
watch(
  () => [props.range.startDate, props.range.endDate] as const,
  ([start, end]) => {
    dates.value = [start, end];
  },
);
function applyDates(): void {
  if (!dates.value || dates.value.length !== 2) {
    EMessage.warning('请选择完整日期范围');
    return;
  }
  const difference = (dateValue(dates.value[1]) - dateValue(dates.value[0])) / dayMilliseconds;
  if (
    !Number.isFinite(difference) ||
    difference < 0 ||
    difference >= PRODUCTION_DASHBOARD_MAX_DAYS
  ) {
    EMessage.warning('日期范围须在366天以内');
    return;
  }
  emit('apply', { startDate: dates.value[0], endDate: dates.value[1] });
}
function monthEnd(start: string, months: number): string {
  const d = new Date(start + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}
function choosePeriod(): void {
  if (period.value === 'custom') return;
  const current = beijingDate();
  const first = current.slice(0, 7) + '-01';
  if (period.value === 'week') {
    const day = new Date(current + 'T00:00:00Z').getUTCDay();
    const start = shiftDate(current, -((day + 6) % 7));
    dates.value = [start, shiftDate(start, 6)];
  } else if (period.value === 'quarter') {
    const start = `${current.slice(0, 4)}-${String(Math.floor((Number(current.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
    dates.value = [start, monthEnd(start, 3)];
  } else dates.value = [first, monthEnd(first, 1)];
  applyDates();
}
</script>
<style scoped>
.date-toolbar {
  margin-bottom: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}
.date-toolbar > span {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.date-toolbar :deep(.el-date-editor) {
  flex-grow: 0;
  width: 270px;
}
</style>
