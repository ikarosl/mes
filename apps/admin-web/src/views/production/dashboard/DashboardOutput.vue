<template>
  <div class="chart-tools">
    <el-radio-group
      v-model="groupBy"
      size="small"
      ><el-radio-button
        v-for="value in PRODUCTION_DASHBOARD_OUTPUT_GROUPS"
        :key="value"
        :value="value"
        >{{ PRODUCTION_DASHBOARD_OUTPUT_LABELS[value] }}</el-radio-button
      ></el-radio-group
    ><el-button
      size="small"
      :loading="read.state.loading"
      @click="load"
      >刷新</el-button
    >
  </div>
  <el-alert
    v-if="read.state.error"
    :title="read.state.error"
    type="error"
    :closable="false"
  />
  <div
    v-else
    v-loading="read.state.loading"
    :aria-busy="read.state.loading"
    class="charts"
  >
    <el-empty
      v-if="read.state.data && !read.state.data.items.length"
      description="当前筛选范围暂无产出对比数据"
      :image-size="55"
    />
    <template v-else-if="items.length">
      <div class="legend">
        <span v-if="commonUnit">单位 {{ commonUnit }}</span>
        <span v-if="groupBy === 'task'"><i class="plan" />任务计划</span
        ><span><i class="actual" />有效产出</span>
      </div>
      <div class="plot-scroll">
        <div
          class="plot"
          :style="{ '--slot-count': pageSize }"
        >
          <div
            v-for="item in items"
            :key="item.key"
            class="bar-group"
          >
            <div class="columns">
              <div
                v-if="item.plannedQuantity !== null"
                class="column plan"
                :style="{ height: height(item.plannedQuantity) }"
              >
                <span>{{ quantity(item.plannedQuantity) }}</span>
              </div>
              <div
                class="column actual"
                :style="{ height: height(item.outputQuantity) }"
              >
                <span>{{ quantity(item.outputQuantity) }}</span>
              </div>
            </div>
            <div class="bar-label">
              <strong :title="item.label">{{ item.label }}</strong>
              <div class="bar-product">
                <span
                  class="bar-product-name"
                  :title="item.productName"
                  >{{ item.productName }}</span
                >
                <span
                  v-if="mixedUnits"
                  class="bar-unit"
                  >· {{ item.unit }}</span
                >
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
  <PaginationFooter
    :total="read.state.data?.total ?? 0"
    :current-page="page"
    :page-size="pageSize"
    :show-page-size="false"
    compact
    :disabled="read.state.loading"
    @page-change="changePage"
  />
  <p class="hint">
    {{
      groupBy === 'task'
        ? '日期范围筛选排期任务；对比任务全部计划与累计有效产出，不把计划拆成每日目标。'
        : '按北京时间归属产出日期；未显示的日期没有有效产出记录，不代表停工。'
    }}<span v-if="mixedUnits && !read.state.error">本页含不同单位，柱高仅在相同单位之间比较。</span>
  </p>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type {
  PageResult,
  ProductionDashboardQuery,
  ProductionDashboardOutputItem,
  ProductionDashboardOutputGroup,
} from '@company/contracts';
import {
  PRODUCTION_DASHBOARD_OUTPUT_GROUPS,
  PRODUCTION_DASHBOARD_OUTPUT_LABELS,
} from '@company/constants';
import { productionDashboardApi } from '../../../api/production/dashboard';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import { useDashboardRead } from './use-dashboard-read';
import { quantity } from './dashboard-presentation';
const props = defineProps<{ query: ProductionDashboardQuery }>();
const groupBy = ref<ProductionDashboardOutputGroup>('task');
const page = ref(1);
const pageSize = 6;
const read = useDashboardRead<PageResult<ProductionDashboardOutputItem>>({
  keepPreviousData: true,
});
const items = computed(() => read.state.data?.items ?? []);
const mixedUnits = computed(() => items.value.some((item) => item.unit !== items.value[0]?.unit));
const commonUnit = computed(() => (mixedUnits.value ? undefined : items.value[0]?.unit));
const maximum = computed(() =>
  Math.max(
    1,
    ...items.value.flatMap((item) => [
      Number(item.plannedQuantity ?? 0),
      Number(item.outputQuantity),
    ]),
  ),
);
function height(value: string): string {
  return `${(Number(value) / maximum.value) * 155}px`;
}
async function load(): Promise<void> {
  await read.load((signal) =>
    productionDashboardApi.output(
      { ...props.query, groupBy: groupBy.value, page: page.value, pageSize },
      { signal, skipErrorHandling: true },
    ),
  );
}
function changePage(value: number): void {
  if (read.state.loading || value === page.value) return;
  page.value = value;
  void load();
}
watch(
  [() => props.query, groupBy],
  () => {
    page.value = 1;
    read.clear();
    void load();
  },
  { deep: true, immediate: true },
);
defineExpose({ refresh: load });
</script>
<style scoped>
.chart-tools,
.legend {
  display: flex;
  align-items: center;
  gap: 12px;
}
.chart-tools {
  justify-content: space-between;
  margin-bottom: 12px;
}
.charts {
  min-height: 260px;
}
.legend,
.hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.legend {
  justify-content: flex-end;
  margin-bottom: 8px;
}
.legend span {
  display: flex;
  align-items: center;
  gap: 5px;
}
.legend i {
  width: 14px;
  height: 10px;
  border-radius: 2px;
}
.plot-scroll {
  overflow-x: auto;
}
.plot {
  --plot-height: 160px;
  --value-label-space: 22px;
  position: relative;
  display: grid;
  grid-template-columns: repeat(var(--slot-count), minmax(0, 1fr));
  min-width: calc(125px * var(--slot-count));
  padding-top: var(--value-label-space);
}
.plot::before {
  content: '';
  position: absolute;
  inset: var(--value-label-space) 0 auto;
  height: var(--plot-height);
  box-sizing: border-box;
  border-bottom: 1px solid var(--el-border-color);
  pointer-events: none;
  background: repeating-linear-gradient(
    to top,
    transparent 0,
    transparent 38px,
    var(--el-border-color-lighter) 39px,
    transparent 40px
  );
}
.bar-group {
  min-width: 0;
  text-align: center;
}
.columns {
  height: var(--plot-height);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 10px;
}
.column {
  width: 32px;
  position: relative;
  border-radius: 4px 4px 0 0;
}
.column span {
  position: absolute;
  bottom: 100%;
  margin-bottom: 4px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 12px;
  white-space: nowrap;
}
.plan {
  background: var(--el-color-primary-light-5);
}
.actual {
  background: var(--el-color-success);
}
.bar-label {
  display: grid;
  gap: 2px;
  padding: 8px 4px 0;
  font-size: 12px;
  line-height: 16px;
}
.bar-label strong,
.bar-product-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bar-product {
  display: flex;
  justify-content: center;
  gap: 4px;
  min-width: 0;
  color: var(--el-text-color-secondary);
}
.bar-unit {
  flex-shrink: 0;
  max-width: 50%;
  overflow-wrap: anywhere;
}
.hint {
  margin: 8px 0 0;
  line-height: 1.6;
}
</style>
