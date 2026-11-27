<template>
  <div class="period-toolbar">
    <strong>{{ flow.state.data?.batch.workOrderNo }} {{ flow.state.data?.batch.batchNo }}</strong>
    <span v-if="flow.state.data?.routeCode">路线 {{ flow.state.data.routeCode }}</span>
    <el-button
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
  />
  <div
    v-else
    v-loading="flow.state.loading"
    class="period-body"
  >
    <template v-if="flow.state.data">
      <DashboardFlowRoute
        v-if="flow.state.data.steps.length"
        :steps="flow.state.data.steps"
        :selected-step="selectedStep"
        :unit="flow.state.data.batch.unit"
        :as-of="flow.state.data.asOf"
        :output-quantity="flow.state.data.outputQuantity"
        period
        @select="selectStep"
      />
      <el-empty
        v-else
        description="本任务没有冻结工序"
        :image-size="50"
      />
      <div class="period-summary">
        <span
          >期间有效产出 <b>{{ quantity(flow.state.data.outputQuantity) }}</b>
          {{ flow.state.data.batch.unit }}</span
        >
        <span
          >期间异常 <b>{{ flow.state.data.abnormalityCount }}</b> 条（含未指定工序）</span
        >
      </div>
      <template v-if="selectedStep">
        <div class="detail-heading">
          <strong>{{ selectedName }} · 期间流转记录</strong
          ><span>只列期间发生到站或完成交接的记录</span>
        </div>
        <el-alert
          v-if="visits.state.error"
          :title="visits.state.error"
          type="error"
          :closable="false"
          ><el-button
            link
            @click="loadVisits"
            >重试</el-button
          ></el-alert
        >
        <el-table
          v-else
          v-loading="visits.state.loading"
          :data="visits.state.data?.items ?? []"
          empty-text="该工序在所选时间内暂无流转记录"
        >
          <el-table-column
            prop="cardNo"
            label="追踪卡"
            min-width="190"
          />
          <el-table-column
            label="期间发生"
            min-width="140"
            ><template #default="{ row }"
              ><span v-if="row.arrivedInPeriod">到站</span
              ><span v-if="row.arrivedInPeriod && row.completedInPeriod">、</span
              ><span v-if="row.completedInPeriod">完成交接</span></template
            ></el-table-column
          >
          <el-table-column
            label="到站时间"
            min-width="165"
            ><template #default="{ row }">{{
              formatTime(row.arrivedAt)
            }}</template></el-table-column
          >
          <el-table-column
            label="完成交接时间"
            min-width="165"
            ><template #default="{ row }">{{
              formatTime(row.completedAt)
            }}</template></el-table-column
          >
          <el-table-column
            label="期间交接量"
            min-width="115"
            ><template #default="{ row }">{{
              row.completedInPeriod && row.reportedQuantity !== null
                ? quantity(row.reportedQuantity) + ' ' + flow.state.data.batch.unit
                : '—'
            }}</template></el-table-column
          >
          <el-table-column
            prop="personnelName"
            label="到站登记人员"
            min-width="120"
          />
          <el-table-column
            v-if="canTrace"
            label="操作"
            width="80"
            ><template #default="{ row }"
              ><el-button
                type="primary"
                link
                @click="trace(row.cardId)"
                >查看</el-button
              ></template
            ></el-table-column
          >
        </el-table>
        <PaginationFooter
          :total="visits.state.data?.total ?? 0"
          :current-page="page"
          :page-size="pageSize"
          :disabled="visits.state.loading"
          @page-change="changePage"
          @update:page-size="changeSize"
        />
      </template>
      <p class="hint">
        到站按盘数统计；交接量使用完成时的数量快照。各工序交接量不能相加作为最终产出；这里展示期间发生的流转，不还原历史在制。
      </p>
    </template>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type {
  PageResult,
  ProductionDashboardPeriodFlow,
  ProductionDashboardPeriodVisit,
  ProductionDashboardPeriodQuery,
} from '@company/contracts';
import { productionDashboardApi } from '../../../api/production/dashboard';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import DashboardFlowRoute from './DashboardFlowRoute.vue';
import { quantity } from './dashboard-presentation';
import { useDashboardRead } from './use-dashboard-read';
const props = defineProps<{ batchId: string | null; range: ProductionDashboardPeriodQuery }>();
const flow = useDashboardRead<ProductionDashboardPeriodFlow>();
const visits = useDashboardRead<PageResult<ProductionDashboardPeriodVisit>>();
const selectedStep = ref<string | null>(null);
const page = ref(1);
const pageSize = ref(10);
const selectedName = computed(
  () => flow.state.data?.steps.find((step) => step.id === selectedStep.value)?.name,
);
const router = useRouter();
const { canAccessRoute } = useRouteAccess();
const canTrace = computed(() => canAccessRoute({ name: 'production-tracking' }));
function formatTime(value: string | null): string {
  return value ? value.slice(0, 19).replace('T', ' ') : '—';
}
async function load(): Promise<void> {
  flow.clear();
  visits.clear();
  selectedStep.value = null;
  page.value = 1;
  if (!props.batchId) return;
  const id = props.batchId;
  const range = { startDate: props.range.startDate, endDate: props.range.endDate };
  const data = await flow.load((signal) =>
    productionDashboardApi.periodFlow(id, range, { signal, skipErrorHandling: true }),
  );
  if (!data) return;
  selectedStep.value =
    data.steps.find(
      (step) => step.arrivedCardCount || step.completedCardCount || step.abnormalityCount,
    )?.id ??
    data.steps[0]?.id ??
    null;
  await loadVisits();
}
async function loadVisits(): Promise<void> {
  if (!props.batchId || !selectedStep.value) return;
  const id = props.batchId;
  const query = {
    startDate: props.range.startDate,
    endDate: props.range.endDate,
    stepId: selectedStep.value,
    page: page.value,
    pageSize: pageSize.value,
  };
  await visits.load((signal) =>
    productionDashboardApi.periodVisits(id, query, { signal, skipErrorHandling: true }),
  );
}
function selectStep(id: string): void {
  selectedStep.value = id;
  changePage(1);
}
function changePage(value: number): void {
  page.value = value;
  void loadVisits();
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
  () => [props.batchId, props.range.startDate, props.range.endDate],
  () => {
    void load();
  },
  { immediate: true },
);
defineExpose({ refresh: load });
</script>
<style scoped>
.period-toolbar,
.period-summary,
.detail-heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.period-toolbar {
  margin-bottom: 16px;
}
.period-toolbar .el-button {
  margin-left: auto;
}
.period-toolbar > span,
.detail-heading > span,
.hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.period-body {
  min-height: 110px;
}
.period-summary {
  padding: 12px;
  gap: 24px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  font-size: 13px;
}
.detail-heading {
  justify-content: space-between;
  margin: 16px 0 8px;
}
.hint {
  margin-bottom: 0;
  line-height: 1.6;
}
</style>
