<template>
  <div class="flow-mode">
    <el-radio-group
      v-model="mode"
      size="small"
    >
      <el-radio-button
        v-for="value in PRODUCTION_DASHBOARD_FLOW_MODES"
        :key="value"
        :value="value"
        >{{ PRODUCTION_DASHBOARD_FLOW_MODE_LABELS[value] }}</el-radio-button
      >
    </el-radio-group>
    <span v-if="mode === 'current'">实时在制，不限任务开始日期；执行中的任务也可能没有在制品</span>
    <span v-else>{{ range.startDate }} 至 {{ range.endDate }} · 跟随顶部日期范围</span>
  </div>
  <DashboardPeriodFlow
    v-if="mode === 'period'"
    ref="periodPanel"
    :batch-id="batchId"
    :range="range"
  />
  <template v-else>
    <div class="flow-toolbar">
      <strong>{{ flow.state.data?.batch.workOrderNo }} {{ flow.state.data?.batch.batchNo }}</strong
      ><span v-if="flow.state.data?.routeCode">路线 {{ flow.state.data.routeCode }}</span
      ><el-button
        size="small"
        :disabled="!batchId"
        :loading="flow.state.loading"
        @click="load"
        >刷新工序</el-button
      >
    </div>
    <el-empty
      v-if="!batchId"
      description="请选择查看任务，也可从甘特图快捷查看工序"
      :image-size="60"
    />
    <el-alert
      v-else-if="flow.state.error"
      :title="flow.state.error"
      type="error"
      :closable="false"
      show-icon
    />
    <div
      v-else
      v-loading="flow.state.loading"
      class="flow-body"
    >
      <template v-if="flow.state.data">
        <DashboardFlowRoute
          v-if="flow.state.data.steps.length"
          :steps="flow.state.data.steps"
          :selected-step="selectedStep"
          :unit="flow.state.data.batch.unit"
          :as-of="flow.state.data.asOf"
          :output-quantity="flow.state.data.outputQuantity"
          @select="selectStep"
        />
        <el-empty
          v-else
          description="本任务尚无冻结工序；研发任务不配置工序路线"
          :image-size="50"
        />
        <div class="summary">
          <span
            >任务计划 <b>{{ quantity(flow.state.data.batch.plannedQuantity) }}</b>
            {{ flow.state.data.batch.unit }}</span
          ><span
            >未到站卡量 <b>{{ quantity(flow.state.data.unusedQuantity) }}</b></span
          ><span
            >当前在制 <b>{{ quantity(flow.state.data.inProgressQuantity) }}</b></span
          ><span
            >有效产出 <b>{{ quantity(flow.state.data.outputQuantity) }}</b></span
          >
        </div>
        <template v-if="selectedStep">
          <div class="details-heading">
            <strong>{{ selectedName }} · 在制明细</strong>
            <span
              >累计交接 {{ quantity(selectedStepData?.reportedQuantity ?? '0') }}
              {{ flow.state.data.batch.unit }} · 按到站时间排序</span
            >
          </div>
          <el-alert
            v-if="cards.state.error"
            :title="cards.state.error"
            type="error"
            :closable="false"
            ><el-button
              link
              @click="loadCards"
              >重试</el-button
            ></el-alert
          >
          <el-table
            v-else
            v-loading="cards.state.loading"
            :data="cards.state.data?.items ?? []"
            empty-text="该工序暂无在制追踪卡"
          >
            <el-table-column
              prop="cardNo"
              label="追踪卡"
              min-width="220"
            />
            <el-table-column
              label="数量"
              width="110"
              ><template #default="{ row }"
                >{{ quantity(row.quantity) }} {{ flow.state.data.batch.unit }}</template
              ></el-table-column
            >
            <el-table-column
              prop="personnelName"
              label="登记人员"
              min-width="110"
            />
            <el-table-column
              label="停留时间"
              min-width="130"
              ><template #default="{ row }">{{
                dwell(row.arrivedAt, flow.state.data.asOf)
              }}</template></el-table-column
            >
            <el-table-column
              prop="openAbnormalityCount"
              label="待处理异常"
              width="120"
            />
            <el-table-column
              v-if="canTrace"
              label="操作"
              width="90"
              ><template #default="{ row }"
                ><el-button
                  link
                  type="primary"
                  @click="trace(row.id)"
                  >查看</el-button
                ></template
              ></el-table-column
            >
          </el-table>
          <PaginationFooter
            :total="cards.state.data?.total ?? 0"
            :current-page="page"
            :page-size="pageSize"
            :disabled="cards.state.loading"
            @page-change="changePage"
            @update:page-size="changeSize"
          />
        </template>
        <p class="hint">
          停留时长包含等待，不等于加工工时；未设置阈值时不判定超时。各站累计交接量不相加作为最终产量。
        </p>
      </template>
    </div>
  </template>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  PRODUCTION_DASHBOARD_FLOW_MODES,
  PRODUCTION_DASHBOARD_FLOW_MODE_LABELS,
} from '@company/constants';
import type {
  ProductionDashboardFlowMode,
  ProductionDashboardPeriodQuery,
} from '@company/contracts';
import DashboardPeriodFlow from './DashboardPeriodFlow.vue';
import type {
  PageResult,
  ProductionDashboardFlow,
  ProductionDashboardCard,
} from '@company/contracts';
import { productionDashboardApi } from '../../../api/production/dashboard';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import { useDashboardRead } from './use-dashboard-read';
import { dwell, quantity } from './dashboard-presentation';
import DashboardFlowRoute from './DashboardFlowRoute.vue';
const props = defineProps<{ batchId: string | null; range: ProductionDashboardPeriodQuery }>();
const mode = defineModel<ProductionDashboardFlowMode>('mode', { default: 'current' });
const periodPanel = ref<{ refresh: () => Promise<void> }>();
const router = useRouter();
const { canAccessRoute } = useRouteAccess();
const canTrace = computed(() => canAccessRoute({ name: 'production-tracking' }));
const flow = useDashboardRead<ProductionDashboardFlow>();
const cards = useDashboardRead<PageResult<ProductionDashboardCard>>();
const selectedStep = ref<string | null>(null);
const page = ref(1);
const pageSize = ref(10);
const selectedStepData = computed(() =>
  flow.state.data?.steps.find((step) => step.id === selectedStep.value),
);
const selectedName = computed(() => selectedStepData.value?.name);
async function load(): Promise<void> {
  cards.clear();
  selectedStep.value = null;
  flow.clear();
  if (!props.batchId || mode.value !== 'current') return;
  const id = props.batchId;
  const data = await flow.load((signal) =>
    productionDashboardApi.flow(id, { signal, skipErrorHandling: true }),
  );
  if (!data) return;
  selectedStep.value =
    data.steps.find((step) => step.cardCount > 0)?.id ?? data.steps[0]?.id ?? null;
  page.value = 1;
  await loadCards();
}
async function loadCards(): Promise<void> {
  if (!props.batchId || !selectedStep.value) return;
  const id = props.batchId;
  const stepId = selectedStep.value;
  await cards.load((signal) =>
    productionDashboardApi.cards(
      id,
      { page: page.value, pageSize: pageSize.value, stepId },
      { signal, skipErrorHandling: true },
    ),
  );
}
function selectStep(id: string): void {
  selectedStep.value = id;
  page.value = 1;
  void loadCards();
}
function changePage(value: number): void {
  page.value = value;
  void loadCards();
}
function changeSize(value: number): void {
  pageSize.value = value;
  changePage(1);
}
function trace(cardId: string): void {
  void router.push({
    name: 'production-tracking',
    query: { batchId: props.batchId ?? undefined, cardId },
  });
}
watch(
  () => [props.batchId, mode.value],
  () => {
    void load();
  },
  { immediate: true },
);
async function refresh(): Promise<void> {
  if (mode.value === 'period') await periodPanel.value?.refresh();
  else await load();
}
defineExpose({ refresh });
</script>
<style scoped>
.flow-mode {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}
.flow-mode > span {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.flow-toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.flow-toolbar span {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.flow-toolbar .el-button {
  margin-left: auto;
}
.flow-body {
  min-height: 110px;
}
.summary {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
  padding: 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  font-size: 13px;
}
.details-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;
  padding: 16px 0 8px;
}
.details-heading span,
.hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.hint {
  margin-bottom: 0;
}
</style>
