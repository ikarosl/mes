<template>
  <div class="tools">
    <el-radio-group
      v-model="groupBy"
      size="small"
      ><el-radio-button
        v-for="value in PRODUCTION_DASHBOARD_ABNORMALITY_GROUPS"
        :key="value"
        :value="value"
        >{{ PRODUCTION_DASHBOARD_ABNORMALITY_LABELS[value] }}</el-radio-button
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
    class="chart"
  >
    <el-empty
      v-if="read.state.data && !read.state.data.items.length"
      description="当前范围暂无有效异常记录"
      :image-size="55"
    /><button
      v-for="item in read.state.data?.items ?? []"
      :key="item.key"
      class="bar-row"
      :aria-label="`查看${item.label}的异常明细`"
      :disabled="read.state.loading"
      @click="openDetails(item)"
    >
      <span
        class="label"
        :title="item.label"
        >{{ item.label }}</span
      ><span class="bar-track"
        ><span
          class="bar"
          :style="{ width: `${(item.count / maximum) * 100}%` }" /></span
      ><strong>{{ item.count }} 次</strong>
    </button>
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
      groupBy === 'reason'
        ? '按标签出现次数统计，多标签可重复计次，不等于不良件数。'
        : '同名冻结工序跨任务合并统计，未指定工序单独列示。'
    }}已排除作废异常。<span v-if="read.state.data && !read.state.error"
      >当前范围共 {{ read.state.data.abnormalityCount }} 条有效异常。</span
    >
  </p>
  <el-dialog
    v-model="detailsOpen"
    :title="`异常明细 · ${detailLabel}`"
    :width="DialogWidth.xl"
  >
    <el-alert
      v-if="details.state.error"
      :title="details.state.error"
      type="error"
      :closable="false"
      ><el-button
        link
        @click="loadDetails"
        >重试</el-button
      ></el-alert
    >
    <el-table
      v-else
      v-loading="details.state.loading"
      :data="details.state.data?.items ?? []"
      ><el-table-column
        prop="batchNo"
        label="任务"
        min-width="170"
      /><el-table-column
        prop="cardNo"
        label="追踪卡"
        min-width="180"
      /><el-table-column
        prop="stepName"
        label="工序"
        min-width="100"
      /><el-table-column
        prop="description"
        label="异常描述"
        min-width="220"
        show-overflow-tooltip
      /><el-table-column
        v-if="canTrace"
        label="操作"
        width="80"
        ><template #default="{ row }"
          ><el-button
            link
            type="primary"
            @click="trace(row)"
            >查看</el-button
          ></template
        ></el-table-column
      ></el-table
    >
    <PaginationFooter
      :total="details.state.data?.total ?? 0"
      :current-page="detailPage"
      :page-size="detailPageSize"
      :show-page-size="false"
      compact
      :disabled="details.state.loading"
      @page-change="changeDetailPage"
    />
  </el-dialog>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type {
  PageResult,
  ProductionDashboardAbnormalityItem,
  ProductionDashboardAbnormalityDetail,
  ProductionDashboardAbnormalityDetailQuery,
} from '@company/contracts';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import { DialogWidth } from '../../../utils/dialog';
import type {
  ProductionDashboardQuery,
  ProductionDashboardAbnormalityGroup,
  ProductionDashboardAbnormalityResult,
} from '@company/contracts';
import {
  PRODUCTION_DASHBOARD_ABNORMALITY_GROUPS,
  PRODUCTION_DASHBOARD_ABNORMALITY_LABELS,
} from '@company/constants';
import { productionDashboardApi } from '../../../api/production/dashboard';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import { useDashboardRead } from './use-dashboard-read';
const props = defineProps<{ query: ProductionDashboardQuery }>();
const groupBy = ref<ProductionDashboardAbnormalityGroup>('reason');
const page = ref(1);
const pageSize = 6;
const detailPageSize = 10;
const read = useDashboardRead<ProductionDashboardAbnormalityResult>({ keepPreviousData: true });
const router = useRouter();
const { canAccessRoute } = useRouteAccess();
const canTrace = computed(() => canAccessRoute({ name: 'production-tracking' }));
const details = useDashboardRead<PageResult<ProductionDashboardAbnormalityDetail>>({
  keepPreviousData: true,
});
const detailsOpen = ref(false);
const detailLabel = ref('');
const detailPage = ref(1);
const detailQuery = ref<ProductionDashboardAbnormalityDetailQuery>();
function openDetails(item: ProductionDashboardAbnormalityItem): void {
  details.clear();
  detailQuery.value = { ...props.query, groupBy: groupBy.value, groupKey: item.key };
  detailLabel.value = item.label;
  detailPage.value = 1;
  detailsOpen.value = true;
  void loadDetails();
}
async function loadDetails(): Promise<void> {
  if (!detailQuery.value || !detailsOpen.value) return;
  const query = { ...detailQuery.value, page: detailPage.value, pageSize: detailPageSize };
  await details.load((signal) =>
    productionDashboardApi.abnormalityDetails(query, { signal, skipErrorHandling: true }),
  );
}
function changeDetailPage(value: number): void {
  if (details.state.loading || value === detailPage.value) return;
  detailPage.value = value;
  void loadDetails();
}
function trace(row: ProductionDashboardAbnormalityDetail): void {
  void router.push({
    name: 'production-tracking',
    query: { batchId: row.batchId, cardId: row.cardId },
  });
}
watch(detailsOpen, (open) => {
  if (!open) details.clear();
});
const maximum = computed(() =>
  Math.max(1, ...(read.state.data?.items.map((item) => item.count) ?? [])),
);
async function load(): Promise<void> {
  await read.load((signal) =>
    productionDashboardApi.abnormalities(
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
.tools {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
}
.chart {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 260px;
}
.bar-row {
  display: grid;
  width: 100%;
  background: transparent;
  border: 0;
  padding: 4px 0;
  color: inherit;
  cursor: pointer;
  grid-template-columns: minmax(100px, 35%) 1fr 58px;
  gap: 10px;
  align-items: center;
  font-size: 13px;
  text-align: left;
}
.label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bar-track {
  min-width: 0;
}
.bar {
  display: block;
  background: var(--el-color-warning);
  height: 20px;
  border-radius: 0 4px 4px 0;
}
.bar-row strong {
  text-align: right;
  font-weight: 500;
}
.hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}
</style>
