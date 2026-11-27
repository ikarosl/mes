<template>
  <div class="gantt-tools">
    <el-button
      size="small"
      @click="collapsed = []"
      >展开本页</el-button
    ><el-button
      size="small"
      @click="collapsed = groups.map((group) => group.id)"
      >收起本页</el-button
    ><span class="legend"
      ><i class="planned" />计划<i class="actual" />实际<i class="delayed" />延期区段</span
    ><el-button
      size="small"
      :disabled="zoom <= 10"
      @click="zoom = Math.max(10, zoom - 10)"
      >缩小</el-button
    ><el-button
      size="small"
      :disabled="zoom >= 100"
      @click="zoom = Math.min(100, zoom + 10)"
      >放大</el-button
    ><el-button
      size="small"
      @click="today"
      >回到今天</el-button
    >
  </div>
  <div
    ref="viewport"
    class="gantt-scroll"
    tabindex="0"
    aria-label="排期时间轴，可横向滚动"
    @scroll.passive="syncScroll"
  >
    <div :style="{ width: `${labelWidth + trackWidth}px`, '--label-width': `${labelWidth}px` }">
      <div class="timeline-row head">
        <div class="fixed-label">工单 / 任务</div>
        <div
          class="axis"
          :style="{ width: `${timelineWidth}px` }"
        >
          <span
            v-for="tick in ticks"
            :key="tick.date"
            :style="{ left: `${tick.left}px` }"
            >{{ tick.date.slice(5) }}</span
          >
        </div>
      </div>
      <template
        v-for="group in groups"
        :key="group.id"
      >
        <div class="timeline-row group">
          <div class="fixed-label">
            <button
              class="expander"
              :aria-expanded="!collapsed.includes(group.id)"
              :aria-label="`${collapsed.includes(group.id) ? '展开' : '收起'}${group.label}`"
              @click="toggle(group.id)"
            >
              {{ collapsed.includes(group.id) ? '›' : '⌄' }}
            </button>
            <span :title="group.label">{{ group.label }}</span>
          </div>
          <div
            class="track group-track"
            :style="{ width: `${timelineWidth}px` }"
          >
            <template v-if="group.planBar">
              <div
                class="bar planned"
                :style="group.planBar.style"
                :title="group.planBar.title"
              />
              <span
                v-if="planLabels.has(group.planBar)"
                class="plan-label"
                :style="planLabels.get(group.planBar)"
                :title="group.planBar.title"
                >{{ group.planBar.label }}</span
              >
            </template>
            <span
              v-else
              class="missing"
              :style="noticePosition"
              :title="group.planText"
              >{{ group.hasPlanDates ? '工单计划在当前范围之外' : group.planText }}</span
            >
          </div>
        </div>
        <template v-if="!collapsed.includes(group.id)">
          <div
            v-for="{ item, planBar, actualBar, delayedBar, delayLabel } in group.rows"
            :key="item.batchId ?? `order-${item.workOrderId}`"
            class="timeline-row task"
            :class="{ selected: item.batchId && item.batchId === selectedId }"
          >
            <div class="fixed-label task-label">
              <div class="label-content">
                <span :title="item.batchNo ?? '尚未创建任务'">{{
                  item.batchNo ?? '尚未创建任务'
                }}</span
                ><small
                  >{{ taskStatus(item) }} · {{ quantity(item.plannedQuantity) }}
                  {{ item.unit }}</small
                >
                <strong
                  v-if="delayLabel"
                  class="delay-label"
                  >{{ delayLabel }}</strong
                >
              </div>
              <el-button
                v-if="item.batchId"
                link
                type="primary"
                @click="$emit('select', item)"
                >{{ item.batchId === selectedId ? '已选工序' : '查看工序' }}</el-button
              >
            </div>
            <div
              class="track"
              :style="{ width: `${timelineWidth}px`, backgroundSize: `${tickDays * zoom}px 100%` }"
            >
              <template v-if="planBar">
                <div
                  class="bar planned"
                  :style="planBar.style"
                  :title="planBar.title"
                />
                <span
                  v-if="planLabels.has(planBar)"
                  class="plan-label"
                  :style="planLabels.get(planBar)"
                  :title="planBar.title"
                  >{{ planBar.label }}</span
                >
              </template>
              <span
                v-else-if="item.batchId"
                class="missing"
                :style="noticePosition"
                :title="planDates(item.planStartDate, item.planEndDate)"
                >{{
                  item.planStartDate && item.planEndDate
                    ? '计划在当前范围之外'
                    : planDates(item.planStartDate, item.planEndDate)
                }}</span
              >
              <div
                v-if="actualBar"
                class="bar actual"
                :style="actualBar"
                :title="`实际 ${item.startedAt} 至 ${item.endedAt ?? '当前'}`"
              />
              <div
                v-if="delayedBar"
                class="bar actual delayed"
                :style="delayedBar"
                :title="`${delayLabel} · 实际 ${item.startedAt} 至 ${item.endedAt ?? '当前'}`"
              />
              <div
                v-if="todayPosition >= 0 && todayPosition <= timelineWidth"
                class="today-line"
                :style="{ left: `${todayPosition}px` }"
                title="今天"
              />
            </div>
          </div>
        </template>
      </template>
    </div>
  </div>
  <span
    ref="shortLabelMeasure"
    class="plan-label label-measure"
    aria-hidden="true"
    >00-00 至 00-00</span
  >
  <span
    ref="longLabelMeasure"
    class="plan-label label-measure"
    aria-hidden="true"
    >0000-00-00 至 0000-00-00</span
  >
  <p class="hint">
    按任务分页，未建任务的工单单独显示；选择任务查看下方工序。实际条截至结束时间或当前时间，不用于推算加工工时。
  </p>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { CSSProperties } from 'vue';
import type { ProductionDashboardScheduleItem } from '@company/contracts';
import {
  beijingDate,
  dateValue,
  shiftDate,
  dayMilliseconds,
  taskScheduleDelay,
  taskStatus,
  quantity,
} from './dashboard-presentation';
const props = defineProps<{
  items: ProductionDashboardScheduleItem[];
  startDate: string;
  endDate: string;
  selectedId: string | null;
}>();
defineEmits<{ select: [item: ProductionDashboardScheduleItem] }>();
const collapsed = ref<string[]>([]);
const zoom = ref(30);
const viewport = ref<HTMLDivElement>();
const shortLabelMeasure = ref<HTMLSpanElement>();
const longLabelMeasure = ref<HTMLSpanElement>();
const shortLabelWidth = ref(0);
const longLabelWidth = ref(0);
const viewportWidth = ref(0);
const scrollLeft = ref(0);
const labelGap = 6;
const labelWidth = computed(() =>
  viewportWidth.value
    ? Math.min(310, Math.max(154, viewportWidth.value - longLabelWidth.value - 2 * labelGap))
    : 310,
);
const visibleWidth = computed(() => Math.max(0, viewportWidth.value - labelWidth.value));
const noticePosition = computed(() => ({ left: `${scrollLeft.value + labelGap}px` }));
function syncScroll(): void {
  scrollLeft.value = viewport.value?.scrollLeft ?? 0;
}
watch(
  viewport,
  (element, _, onCleanup) => {
    if (!element) return;
    const measure = () => {
      viewportWidth.value = element.clientWidth;
      shortLabelWidth.value = Math.ceil(
        shortLabelMeasure.value?.getBoundingClientRect().width ?? 0,
      );
      longLabelWidth.value = Math.ceil(longLabelMeasure.value?.getBoundingClientRect().width ?? 0);
      syncScroll();
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (shortLabelMeasure.value) observer.observe(shortLabelMeasure.value);
    if (longLabelMeasure.value) observer.observe(longLabelMeasure.value);
    onCleanup(() => observer.disconnect());
  },
  { flush: 'post' },
);
const days = computed(() =>
  Math.max(
    1,
    Math.round((dateValue(props.endDate) - dateValue(props.startDate)) / dayMilliseconds) + 1,
  ),
);
const timelineWidth = computed(() => days.value * zoom.value);
const trackWidth = computed(() => Math.max(timelineWidth.value, visibleWidth.value));
const tickDays = computed(() => (zoom.value >= 60 ? 1 : 7));
const ticks = computed(() =>
  Array.from({ length: Math.ceil(days.value / tickDays.value) }, (_, index) => ({
    date: shiftDate(props.startDate, index * tickDays.value),
    left: index * tickDays.value * zoom.value,
  })),
);
const todayPosition = computed(
  () => ((dateValue(beijingDate()) - dateValue(props.startDate)) / dayMilliseconds) * zoom.value,
);
type BarBounds = { left: number; width: number };
type PlannedBar = BarBounds & {
  style: CSSProperties;
  label: string;
  title: string;
  showsYears: boolean;
};
type ScheduleRow = {
  item: ProductionDashboardScheduleItem;
  planBar?: PlannedBar;
  actualBar?: CSSProperties;
  delayedBar?: CSSProperties;
  delayLabel?: string;
};
const groups = computed(() => {
  const now = Date.now();
  const result = new Map<
    string,
    {
      id: string;
      label: string;
      planText: string;
      planBar?: PlannedBar;
      hasPlanDates: boolean;
      rows: ScheduleRow[];
    }
  >();
  for (const item of props.items) {
    let group = result.get(item.workOrderId);
    if (!group) {
      group = {
        id: item.workOrderId,
        label: `${item.workOrderNo} · ${item.productName}`,
        planText: planDates(item.workOrderPlanStartDate, item.workOrderPlanEndDate),
        planBar: plannedBar(item.workOrderPlanStartDate, item.workOrderPlanEndDate),
        hasPlanDates: Boolean(item.workOrderPlanStartDate && item.workOrderPlanEndDate),
        rows: [],
      };
      result.set(item.workOrderId, group);
    }
    const delay = taskScheduleDelay(item, now);
    const actualStart = Date.parse(item.startedAt ?? '');
    const actualEnd = item.endedAt ? Date.parse(item.endedAt) : now;
    group.rows.push({
      item,
      planBar: plannedBar(item.planStartDate, item.planEndDate),
      actualBar: bar(actualStart, actualEnd),
      delayedBar:
        delay && delay.overdueFrom < actualEnd
          ? bar(Math.max(actualStart, delay.overdueFrom), actualEnd)
          : undefined,
      delayLabel: delay?.label,
    });
  }
  return [...result.values()];
});
const planLabels = computed(() => {
  const labels = new Map<PlannedBar, CSSProperties>();
  for (const group of groups.value) {
    for (const plan of [group.planBar, ...group.rows.map((row) => row.planBar)]) {
      if (!plan) continue;
      const style = placePlanLabel(plan);
      if (style) labels.set(plan, style);
    }
  }
  return labels;
});
function placePlanLabel(plan: PlannedBar): CSSProperties | undefined {
  const left = scrollLeft.value;
  const right = Math.min(trackWidth.value, left + visibleWidth.value);
  const width = plan.showsYears ? longLabelWidth.value : shortLabelWidth.value;
  const barEnd = plan.left + plan.width;
  const visibleStart = Math.max(left, plan.left);
  const visibleEnd = Math.min(right, barEnd);
  if (!width || visibleEnd <= visibleStart || right - left < width) return;

  if (visibleEnd - visibleStart >= width) {
    return {
      left: `${(visibleStart + visibleEnd - width) / 2}px`,
      background: 'var(--el-color-primary-light-9)',
    };
  }
  if (right - barEnd >= width + labelGap) return { left: `${barEnd + labelGap}px` };
  if (plan.left - left >= width + labelGap) return { left: `${plan.left - width - labelGap}px` };
  // The second line keeps the label close even when the visible bar blocks both sides.
  return { left: `${Math.min(visibleStart, right - width)}px`, top: '28px' };
}
function barBounds(start: number, end: number): BarBounds | undefined {
  const rangeStart = dateValue(props.startDate);
  const rangeEnd = dateValue(props.endDate) + dayMilliseconds;
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= rangeStart ||
    start >= rangeEnd ||
    end < start
  )
    return;
  return {
    left: Math.max(0, ((start - rangeStart) / dayMilliseconds) * zoom.value),
    width: Math.max(
      3,
      ((Math.min(end, rangeEnd) - Math.max(start, rangeStart)) / dayMilliseconds) * zoom.value,
    ),
  };
}
function barStyle({ left, width }: BarBounds): CSSProperties {
  return { left: `${left}px`, width: `${width}px` };
}
function bar(start: number, end: number): CSSProperties | undefined {
  const bounds = barBounds(start, end);
  if (bounds) return barStyle(bounds);
}
function plannedBar(start: string | null, end: string | null): PlannedBar | undefined {
  if (!start || !end) return;
  const bounds = barBounds(dateValue(start), dateValue(end) + dayMilliseconds);
  if (!bounds) return;
  const showsYears = start.slice(0, 4) !== end.slice(0, 4);
  const label = showsYears ? `${start} 至 ${end}` : `${start.slice(5)} 至 ${end.slice(5)}`;
  return { ...bounds, style: barStyle(bounds), label, title: planDates(start, end), showsYears };
}
function planDates(start: string | null, end: string | null): string {
  if (start && end) return `计划 ${start} 至 ${end}`;
  if (start) return `计划开始 ${start}，结束未设置`;
  if (end) return `计划结束 ${end}，开始未设置`;
  return '计划日期未完整设置';
}
function toggle(id: string): void {
  collapsed.value = collapsed.value.includes(id)
    ? collapsed.value.filter((value) => value !== id)
    : [...collapsed.value, id];
}
function today(): void {
  viewport.value?.scrollTo({ left: Math.max(0, todayPosition.value - 160), behavior: 'smooth' });
}
</script>
<style scoped>
.gantt-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.legend {
  margin-left: auto;
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 12px;
}
.legend i {
  width: 20px;
  height: 10px;
  border-radius: 2px;
}
.gantt-scroll {
  overflow: auto;
  max-height: 570px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}
.timeline-row {
  display: flex;
  min-height: 38px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.fixed-label {
  width: var(--label-width);
  flex-shrink: 0;
  box-sizing: border-box;
  padding: 8px 12px;
  position: sticky;
  left: 0;
  background: var(--el-bg-color);
  z-index: 3;
  border-right: 1px solid var(--el-border-color-lighter);
  display: flex;
  align-items: center;
  gap: 6px;
}
.fixed-label span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.head {
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--el-fill-color-light);
}
.head .fixed-label,
.group .fixed-label {
  background: var(--el-fill-color-light);
  font-weight: 600;
}
.axis {
  position: relative;
  height: 38px;
}
.axis span {
  position: absolute;
  top: 10px;
  padding-left: 5px;
  font-size: 12px;
}
.track {
  position: relative;
  flex-shrink: 0;
  background-image: linear-gradient(to right, var(--el-border-color-lighter) 1px, transparent 1px);
}
.group-track {
  background: var(--el-fill-color-lighter);
  box-sizing: border-box;
}
.group {
  min-height: 48px;
}
.task-label {
  justify-content: space-between;
  padding-left: 28px;
}
.label-content {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.task-label small {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.plan-label {
  position: absolute;
  top: 8px;
  z-index: 2;
  width: max-content;
  border-radius: 3px;
  padding: 0 4px;
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 18px;
  white-space: nowrap;
}
.group-track .plan-label {
  background: var(--el-fill-color-lighter);
}
.label-measure {
  position: fixed;
  top: 0;
  left: 0;
  visibility: hidden;
  pointer-events: none;
}
.delay-label {
  align-self: flex-start;
  background: var(--el-color-danger-light-9);
  border: 1px solid var(--el-color-danger-light-5);
  border-radius: 4px;
  color: var(--el-text-color-primary);
  padding: 1px 5px;
  font-size: 12px;
  font-weight: 600;
}
.task {
  min-height: 72px;
}
.selected .fixed-label {
  background: var(--el-color-primary-light-9);
}
.bar {
  position: absolute;
  height: 20px;
  box-sizing: border-box;
  border-radius: 4px;
}
.planned {
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-5);
  top: 7px;
}
.actual {
  background: var(--el-color-primary);
  top: 48px;
}
.delayed {
  background: var(--el-color-danger);
}
.today-line {
  position: absolute;
  height: 100%;
  border-left: 2px dashed var(--el-color-warning);
  z-index: 1;
}
.missing {
  position: absolute;
  top: 9px;
  white-space: nowrap;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.expander {
  flex-shrink: 0;
  background: transparent;
  border: 0;
  cursor: pointer;
  font-size: 22px;
  width: 24px;
  color: var(--el-text-color-primary);
}
.hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin: 10px 0 0;
}
</style>
