<template>
  <div class="tracking-page">
    <section class="panel query-panel">
      <el-form
        :inline="true"
        :model="query"
        class="query-form"
        @submit.prevent="search"
      >
        <el-form-item label="生产任务"
          ><RemoteSearchSelect
            v-model="query.batchId"
            :options="taskSearch.options.value"
            :loading="taskSearch.loading.value"
            :error="taskSearch.error.value"
            :has-more="taskSearch.hasMore.value"
            placeholder="搜索任务号 / 产品"
            @search="taskSearch.search"
            @open="taskSearch.search"
            @refresh="taskSearch.search"
            @update:model-value="changeBatch"
        /></el-form-item>
        <el-form-item label="站点"
          ><el-select
            v-model="query.stepRecordId"
            clearable
            :disabled="!context || contextLoading"
            placeholder="全部站点"
            ><el-option
              v-for="step in context?.steps || []"
              :key="step.stepRecordId"
              :label="`${step.stepOrder}. ${step.stepName}`"
              :value="step.stepRecordId" /></el-select
        ></el-form-item>
        <el-form-item
          v-if="view === 'cards'"
          label="卡状态"
          ><el-select
            v-model="query.status"
            clearable
            placeholder="全部"
            ><el-option
              v-for="status in PRODUCTION_TRACKING_CARD_STATUSES"
              :key="status"
              :label="PRODUCTION_TRACKING_CARD_STATUS_LABELS[status]"
              :value="status" /></el-select
        ></el-form-item>
        <el-form-item
          v-if="view === 'cards'"
          label="随盘异常"
          ><el-select
            v-model="query.abnormalityStatus"
            clearable
            placeholder="全部"
            ><el-option
              v-for="status in PRODUCTION_TRACKING_ABNORMALITY_STATUSES"
              :key="status"
              :label="PRODUCTION_TRACKING_ABNORMALITY_STATUS_LABELS[status]"
              :value="status" /></el-select
        ></el-form-item>
        <el-form-item
          v-if="view === 'cards'"
          label="追踪码"
          ><el-input
            v-model="query.keyword"
            clearable
            placeholder="扫码枪 / 手输追踪码"
            @keyup.enter="search"
        /></el-form-item>
        <el-form-item
          ><el-button
            type="primary"
            :loading="loading"
            @click="search"
            >查询</el-button
          ><el-button @click="reset">重置</el-button></el-form-item
        >
      </el-form>
      <InlineHint>此处扫码仅查询。到站与前站交接在员工工作台办理。</InlineHint>
    </section>

    <section
      v-if="query.batchId"
      v-loading="contextLoading"
      class="panel overview-panel"
    >
      <el-alert
        v-if="contextError"
        :title="contextError"
        type="error"
        :closable="false"
        show-icon
      />
      <template v-if="context">
        <div class="section-heading">
          <div class="task-heading">
            <strong>{{ context.batch.batchNo }}</strong
            ><span>{{ context.batch.productName }}</span
            ><el-tag :type="batchStatusMeta(context.batch.status).type">{{
              batchStatusMeta(context.batch.status).label
            }}</el-tag>
          </div>
          <el-button
            v-if="canAccessRoute({ name: 'production-workbench' })"
            type="primary"
            plain
            @click="openWorkbench"
            >打开员工工作台</el-button
          >
        </div>
        <el-descriptions :column="4"
          ><el-descriptions-item label="计划数量">{{
            formatQuantity(context.batch.plannedQuantity)
          }}</el-descriptions-item
          ><el-descriptions-item label="有效追踪卡"
            >{{
              context.summary.totalCardCount - context.summary.voidedCardCount
            }}
            盘</el-descriptions-item
          ><el-descriptions-item label="已确认产出">{{
            formatQuantity(context.summary.availableQuantity)
          }}</el-descriptions-item
          ><el-descriptions-item label="待处理异常"
            >{{ context.summary.openAbnormalityCount }} 条</el-descriptions-item
          ><el-descriptions-item label="整盘报废"
            >{{ context.summary.scrappedCardCount }} 盘</el-descriptions-item
          ></el-descriptions
        >
        <div class="step-grid">
          <button
            v-for="(step, index) in context.steps"
            :key="step.stepRecordId"
            type="button"
            class="step-card"
            :class="{ 'is-selected': query.stepRecordId === step.stepRecordId }"
            @click="selectStep(step.stepRecordId)"
          >
            <div class="step-card-heading">
              <strong>{{ step.stepOrder }}. {{ step.stepName }}</strong
              ><el-tag
                v-if="index === context.steps.length - 1"
                size="small"
                effect="plain"
                >终检</el-tag
              >
            </div>
            <div class="step-metrics">
              <span
                >在站 <strong>{{ step.currentCardCount }}</strong> 盘</span
              ><span
                >已交接 <strong>{{ step.completedCardCount }}</strong> 盘</span
              ><span
                >报工 <strong>{{ formatQuantity(step.reportedQuantity) }}</strong> 件次</span
              >
            </div>
          </button>
        </div>
      </template>
    </section>

    <section class="panel list-panel">
      <TableToolbar
        ><template #actions
          ><el-radio-group
            v-model="view"
            @change="search"
            ><el-radio-button value="cards">追踪卡</el-radio-button
            ><el-radio-button value="history">报工历史</el-radio-button></el-radio-group
          ></template
        ><template #tools
          ><el-button
            :icon="Refresh"
            text
            :loading="loading"
            @click="refresh"
            >刷新</el-button
          ></template
        ></TableToolbar
      >
      <el-alert
        v-if="listError"
        :title="listError"
        type="error"
        :closable="false"
        show-icon
      />
      <el-table
        v-if="view === 'cards'"
        v-loading="loading"
        :data="cards"
        row-key="id"
        highlight-current-row
        :current-row-key="selectedId"
        @row-click="selectCard"
      >
        <el-table-column
          label="追踪卡 / 任务"
          min-width="215"
          ><template #default="{ row }"
            ><el-button
              link
              type="primary"
              @click.stop="selectCard(row)"
              >{{ row.cardNo }}</el-button
            >
            <div class="secondary">{{ row.batchNo }}</div></template
          ></el-table-column
        >
        <el-table-column
          label="产品"
          min-width="170"
          ><template #default="{ row }"
            ><strong>{{ row.productName }}</strong>
            <div class="secondary">{{ row.productCode }}</div></template
          ></el-table-column
        >
        <el-table-column
          label="剩余盘量"
          width="100"
          align="right"
          ><template #default="{ row }"
            >{{ formatQuantity(row.quantity) }} {{ row.unit }}</template
          ></el-table-column
        >
        <el-table-column
          label="当前站点"
          min-width="150"
          ><template #default="{ row }">{{
            row.currentStepName || '尚未到站'
          }}</template></el-table-column
        >
        <el-table-column
          label="状态 / 异常"
          min-width="170"
          ><template #default="{ row }"
            ><el-tag :type="trackingCardStatus(row.status).type">{{
              trackingCardStatus(row.status).label
            }}</el-tag>
            <div
              v-if="row.openAbnormalityCount"
              class="secondary danger"
            >
              {{ row.status === 'voided' ? '保留未处理异常' : '暂停流转' }} ·
              {{ row.openAbnormalityCount }} 条
            </div></template
          ></el-table-column
        >
        <el-table-column
          label="实际可用产出"
          min-width="130"
          align="right"
          ><template #default="{ row }">{{ trackingOutputLabel(row) }}</template></el-table-column
        >
        <el-table-column
          prop="personnelName"
          label="建卡登记人"
          min-width="110"
        />
        <el-table-column
          label="操作"
          width="105"
          fixed="right"
          ><template #default="{ row }"
            ><el-button
              link
              type="primary"
              @click.stop="selectCard(row)"
              >查看详情</el-button
            ></template
          ></el-table-column
        >
      </el-table>
      <el-table
        v-else
        v-loading="loading"
        :data="reports"
        row-key="id"
      >
        <el-table-column
          label="追踪卡 / 任务"
          min-width="220"
          ><template #default="{ row }"
            ><el-button
              link
              type="primary"
              @click="openCard(row.trackingCardId)"
              >{{ row.cardNo }}</el-button
            >
            <div class="secondary">{{ row.batchNo }}</div></template
          ></el-table-column
        ><el-table-column
          prop="stepName"
          label="工序"
          min-width="150"
        /><el-table-column
          prop="personnelName"
          label="到站登记人"
          min-width="120"
        /><el-table-column
          label="交接 / 完工量"
          width="150"
          align="right"
          ><template #default="{ row }"
            >{{ formatQuantity(row.reportedQuantity) }} {{ row.unit }}</template
          ></el-table-column
        ><el-table-column
          label="到站时间"
          min-width="180"
          ><template #default="{ row }">{{
            formatDateTimeForDisplay(row.arrivedAt)
          }}</template></el-table-column
        ><el-table-column
          label="交接 / 完工时间"
          min-width="180"
          ><template #default="{ row }">{{
            formatDateTimeForDisplay(row.completedAt)
          }}</template></el-table-column
        >
      </el-table>
      <PaginationFooter
        :total="total"
        :current-page="page"
        :page-size="pageSize"
        @page-change="changePage"
        @update:page-size="changePageSize"
      />
    </section>

    <section
      v-if="selectedId"
      v-loading="detailLoading"
      class="panel detail-panel"
    >
      <el-alert
        v-if="detailError"
        :title="detailError"
        type="error"
        :closable="false"
        show-icon
      /><TrackingCardEvidence
        v-if="selectedCard"
        :card="selectedCard"
        :steps="selectedSteps"
        :loading="detailLoading"
        @refresh="loadDetail"
        @label="labelVisible = true"
        @action="openAction"
      /><el-button
        v-else-if="detailError"
        @click="loadDetail"
        >重试详情</el-button
      >
    </section>
    <TrackingCardActionDialog
      v-model:visible="actionVisible"
      :action="action"
      :card="selectedCard"
      :abnormality="abnormality"
      route-name="production-tracking"
      @changed="cardChanged"
    />
    <TrackingLabelDialog
      v-model:visible="labelVisible"
      :card="selectedCard"
    />
  </div>
</template>

<script setup lang="ts">
import { onActivated, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Refresh } from '@element-plus/icons-vue';
import {
  PRODUCTION_TRACKING_ABNORMALITY_STATUSES,
  PRODUCTION_TRACKING_ABNORMALITY_STATUS_LABELS,
  PRODUCTION_TRACKING_CARD_STATUSES,
  PRODUCTION_TRACKING_CARD_STATUS_LABELS,
} from '@company/constants';
import type {
  ProductionTrackingAbnormality,
  ProductionTrackingAbnormalityStatus,
  ProductionTrackingCardDetail,
  ProductionTrackingCardItem,
  ProductionTrackingCardStatus,
  ProductionTrackingStep,
  ProductionTrackingVisit,
  ProductionTrackingWorkbench,
} from '@company/contracts';
import { productionTrackingApi } from '../../../api/production/tracking';
import InlineHint from '../../../components/InlineHint.vue';
import TableToolbar from '../../../components/TableToolbar.vue';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import RemoteSearchSelect from '../../../components/RemoteSearchSelect.vue';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { usePageInitialLoad } from '../../../composables/requests/usePageInitialLoad';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { formatQuantity } from '../../../utils/quantity';
import { batchStatusMeta } from '../shared/production-status';
import TrackingCardEvidence from './TrackingCardEvidence.vue';
import TrackingCardActionDialog from './TrackingCardActionDialog.vue';
import TrackingLabelDialog from './TrackingLabelDialog.vue';
import {
  trackingCardStatus,
  trackingOutputLabel,
  type TrackingCardAction,
} from './tracking-presentation';
import { useTrackingTaskSearch } from './use-tracking-task-search';

defineOptions({ name: 'ProductionTrackingPage' });
const route = useRoute(),
  router = useRouter();
const { canAccessRoute } = useRouteAccess();
const view = ref('cards'),
  page = ref(1),
  pageSize = ref(10),
  total = ref(0);
const query = reactive<{
  batchId: string | null;
  stepRecordId: string;
  keyword: string;
  status: ProductionTrackingCardStatus | '';
  abnormalityStatus: ProductionTrackingAbnormalityStatus | '';
}>({ batchId: null, stepRecordId: '', keyword: '', status: '', abnormalityStatus: '' });
const cards = ref<ProductionTrackingCardItem[]>([]),
  reports = ref<ProductionTrackingVisit[]>([]),
  loading = ref(false),
  listError = ref('');
const context = ref<ProductionTrackingWorkbench | null>(null),
  contextLoading = ref(false),
  contextError = ref('');
const taskSearch = useTrackingTaskSearch(() => context.value?.batch ?? null);
const listReads = useLatestReadRequest(() => {
    loading.value = false;
  }),
  contextReads = useLatestReadRequest(() => {
    contextLoading.value = false;
  });
async function loadContext(): Promise<void> {
  const id = query.batchId;
  contextReads.invalidate();
  if (!id) {
    context.value = null;
    return;
  }
  if (!contextReads.isActive()) return;
  const read = contextReads.begin(() => query.batchId === id);
  contextLoading.value = true;
  contextError.value = '';
  try {
    const value = await productionTrackingApi.workbench(id, {
      signal: read.signal,
      skipErrorHandling: true,
    });
    if (read.isCurrent()) context.value = value;
  } catch (error) {
    if (read.isCurrent()) {
      context.value = null;
      contextError.value = error instanceof Error ? error.message : '工序概览加载失败';
    }
  } finally {
    if (read.isCurrent()) contextLoading.value = false;
  }
}
async function loadList(): Promise<void> {
  if (!listReads.isActive()) return;
  const read = listReads.begin();
  loading.value = true;
  listError.value = '';
  const params = {
    page: page.value,
    pageSize: pageSize.value,
    batchId: query.batchId || undefined,
    stepRecordId: query.stepRecordId || undefined,
  };
  try {
    if (view.value === 'history') {
      const value = await productionTrackingApi.reports(params, {
        signal: read.signal,
        skipErrorHandling: true,
      });
      if (!read.isCurrent()) return;
      reports.value = value.items;
      total.value = value.total;
    } else {
      const value = await productionTrackingApi.list(
        {
          ...params,
          keyword: query.keyword.trim() || undefined,
          status: query.status || undefined,
          abnormalityStatus: query.abnormalityStatus || undefined,
        },
        { signal: read.signal, skipErrorHandling: true },
      );
      if (!read.isCurrent()) return;
      cards.value = value.items;
      total.value = value.total;
    }
  } catch (error) {
    if (read.isCurrent())
      listError.value = error instanceof Error ? error.message : '追踪记录加载失败';
  } finally {
    if (read.isCurrent()) loading.value = false;
  }
}
async function search(): Promise<void> {
  page.value = 1;
  await loadList();
}
async function refresh(): Promise<void> {
  await Promise.all([loadContext(), loadList()]);
}
async function changeBatch(): Promise<void> {
  query.stepRecordId = '';
  context.value = null;
  await loadContext();
}
async function reset(): Promise<void> {
  Object.assign(query, {
    batchId: null,
    stepRecordId: '',
    keyword: '',
    status: '',
    abnormalityStatus: '',
  });
  context.value = null;
  contextReads.invalidate();
  await search();
}
async function selectStep(id: string): Promise<void> {
  query.stepRecordId = query.stepRecordId === id ? '' : id;
  await search();
}
async function changePage(value: number): Promise<void> {
  page.value = value;
  await loadList();
}
async function changePageSize(value: number): Promise<void> {
  pageSize.value = value;
  await search();
}
async function openWorkbench(): Promise<void> {
  if (query.batchId)
    await router.push({
      name: 'production-workbench',
      query: {
        batchId: query.batchId,
        ...(query.stepRecordId ? { stepRecordId: query.stepRecordId } : {}),
      },
    });
}

const selectedId = ref(''),
  selectedCard = ref<ProductionTrackingCardDetail | null>(null),
  selectedSteps = ref<ProductionTrackingStep[]>([]),
  detailLoading = ref(false),
  detailError = ref('');
const detailReads = useLatestReadRequest(() => {
  detailLoading.value = false;
});
async function loadDetail(): Promise<void> {
  const id = selectedId.value;
  if (!id || !detailReads.isActive()) return;
  const read = detailReads.begin(() => selectedId.value === id);
  detailLoading.value = true;
  detailError.value = '';
  try {
    const card = await productionTrackingApi.detail(id, {
      signal: read.signal,
      skipErrorHandling: true,
    });
    const workbench = await productionTrackingApi.workbench(card.productionBatchId, {
      signal: read.signal,
      skipErrorHandling: true,
    });
    if (read.isCurrent()) {
      selectedCard.value = card;
      selectedSteps.value = workbench.steps;
    }
  } catch (error) {
    if (read.isCurrent()) {
      selectedCard.value = null;
      detailError.value = error instanceof Error ? error.message : '追踪卡详情加载失败';
    }
  } finally {
    if (read.isCurrent()) detailLoading.value = false;
  }
}
async function openCard(id: string): Promise<void> {
  if (actionVisible.value) return;
  selectedId.value = id;
  selectedCard.value = null;
  selectedSteps.value = [];
  await loadDetail();
}
async function selectCard(card: ProductionTrackingCardItem): Promise<void> {
  await openCard(card.id);
}
const labelVisible = ref(false),
  actionVisible = ref(false),
  action = ref<TrackingCardAction>('abnormality'),
  abnormality = ref<ProductionTrackingAbnormality | null>(null);
function openAction(value: TrackingCardAction, item?: ProductionTrackingAbnormality): void {
  if (actionVisible.value || detailLoading.value) return;
  action.value = value;
  abnormality.value = item ?? null;
  actionVisible.value = true;
}
async function cardChanged(card: ProductionTrackingCardDetail): Promise<void> {
  if (selectedId.value === card.id) {
    detailReads.invalidate();
    detailError.value = '';
    selectedCard.value = card;
  }
  cards.value = cards.value.map((item) => (item.id === card.id ? card : item));
  await refresh();
}
let consumedLocation = '';
async function locate(): Promise<void> {
  if (route.name !== 'production-tracking' || !contextReads.isActive()) return;
  const batchId = typeof route.query.batchId === 'string' ? route.query.batchId : '';
  const cardId = typeof route.query.cardId === 'string' ? route.query.cardId : '';
  const key = `${batchId}/${cardId}/${String(route.query.stepRecordId || '')}/${String(route.query.view || '')}`;
  if (key === consumedLocation) return;
  consumedLocation = key;
  query.batchId = batchId || null;
  query.stepRecordId = typeof route.query.stepRecordId === 'string' ? route.query.stepRecordId : '';
  view.value = route.query.view === 'history' ? 'history' : 'cards';
  await refresh();
  if (cardId) await openCard(cardId);
}
watch(
  () => [
    route.name,
    route.query.batchId,
    route.query.cardId,
    route.query.stepRecordId,
    route.query.view,
  ],
  () => {
    void locate();
  },
);
let initiallyLoaded = false;
onActivated(() => {
  if (initiallyLoaded) void locate();
});
usePageInitialLoad(async () => {
  await taskSearch.search('');
  if (route.query.batchId || route.query.cardId) await locate();
  else {
    consumedLocation = '///';
    await loadList();
  }
  initiallyLoaded = true;
});
</script>

<style scoped>
.tracking-page {
  display: grid;
  gap: 16px;
}
.panel {
  min-width: 0;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
}
.query-panel,
.overview-panel,
.detail-panel {
  padding: 20px;
}
.query-form {
  display: flex;
  flex-wrap: wrap;
  gap: 0 20px;
}
.query-form :deep(.el-form-item) {
  margin-right: 0;
}
.query-form :deep(.el-input),
.query-form :deep(.el-select) {
  width: 180px;
}
.query-form :deep(.remote-search-select) {
  width: 290px;
}
.section-heading,
.task-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}
.section-heading {
  justify-content: space-between;
  margin-bottom: 16px;
}
.task-heading strong {
  font-size: 16px;
}
.step-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 12px;
  margin-top: 8px;
}
.step-card {
  padding: 14px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-bg-color);
  text-align: left;
  color: var(--el-text-color-primary);
  cursor: pointer;
  font: inherit;
}
.step-card:hover,
.step-card.is-selected {
  border-color: var(--el-color-primary);
}
.step-card.is-selected {
  background: var(--el-color-primary-light-9);
}
.step-card:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}
.step-card-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.step-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  font-size: 12px;
  color: var(--el-text-color-regular);
}
.step-metrics strong {
  color: var(--el-text-color-primary);
}
.list-panel {
  overflow: hidden;
}
.list-panel :deep(.el-table__header th) {
  background: var(--el-fill-color-light);
}
.secondary {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.danger {
  color: var(--el-color-danger);
}
</style>
