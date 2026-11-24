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
            @blur="normalizeKeyword"
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
            v-if="
              context.batch.status !== 'draft' && canAccessRoute({ name: 'production-workbench' })
            "
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
        <el-alert
          v-if="context.batch.status === 'draft'"
          title="任务草稿尚未下达，暂未生成工序或追踪卡；请在生产任务中下达后办理。"
          type="info"
          :closable="false"
        />
        <div
          v-else
          class="step-grid"
        >
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
            ><el-radio-button value="cards">追踪卡管理</el-radio-button
            ><el-radio-button value="history">报工历史</el-radio-button></el-radio-group
          ></template
        ><template #tools
          ><el-button
            :icon="Printer"
            :disabled="printer.busy.value"
            @click="printerSettingsVisible = true"
            >打印设置</el-button
          >
          <el-button
            v-if="view === 'cards'"
            :disabled="!selectedLabels.length || loading || !!listError || labelVisible"
            @click="openSelectedLabels"
            >打印所选（{{ selectedLabels.length }}）</el-button
          >
          <el-button
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
      <el-alert
        v-if="quantityError"
        :title="quantityError"
        type="error"
        :closable="false"
        show-icon
      >
        <el-button
          link
          type="primary"
          :loading="quantityLoading"
          :disabled="actionInProgress"
          @click="loadQuantityAction"
          >重新加载更正依据</el-button
        >
      </el-alert>
      <el-table
        v-if="view === 'cards'"
        ref="cardTable"
        v-loading="loading"
        :data="cards"
        row-key="id"
        highlight-current-row
        :current-row-key="selectedId"
        @row-click="selectCard"
        @selection-change="selectedLabels = $event"
      >
        <el-table-column
          type="selection"
          width="48"
        />
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
          label="异常标签"
          min-width="240"
          ><template #default="{ row }"
            ><TrackingAbnormalityTags :labels="row.abnormalityLabels" /></template
        ></el-table-column>
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
          width="270"
          fixed="right"
          ><template #default="{ row }"
            ><el-button
              link
              type="primary"
              @click.stop="selectCard(row)"
              >查看详情</el-button
            ><el-button
              link
              type="primary"
              :loading="labelLoading && labelTarget?.id === row.id"
              :disabled="labelVisible"
              @click.stop="openCardLabel(row)"
              >标签 / 打印</el-button
            ><el-button
              v-if="canCorrectTrackingQuantity(row)"
              link
              type="primary"
              :loading="quantityLoading && quantityTarget?.id === row.id"
              :disabled="actionInProgress"
              @click.stop="openQuantityAction(row)"
              >{{ TRACKING_ACTION_LABELS.quantity }}</el-button
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

    <TrackingCardEvidence
      v-model:visible="detailVisible"
      :card="selectedCard"
      :steps="selectedSteps"
      :loading="detailLoading"
      :error="detailError"
      :change-in-progress="actionInProgress"
      allow-actions
      @refresh="loadDetail"
      @label="openLabel"
      @action="openAction"
      @abnormality-correction="openAbnormalityCorrection"
    />
    <TrackingCardActionDialog
      v-model:visible="actionVisible"
      :action="action"
      :card="actionCard"
      :step-context="actionStepContext"
      :abnormality="abnormality"
      route-name="production-tracking"
      @changed="cardChanged"
      @basis-refreshed="cardBasisRefreshed"
    />
    <TrackingAbnormalityCorrectionDialog
      v-model:visible="correctionVisible"
      :target="correctionTarget"
      route-name="production-tracking"
      @changed="cardChanged"
    />
    <TrackingLabelDialog
      v-model:visible="labelVisible"
      route-name="production-tracking"
      :card="labelCard"
      :cards="labelCards"
      :card-no="labelTarget?.cardNo"
      :loading="labelLoading"
      :error="labelError"
      @refresh="loadLabel"
      @settings="printerSettingsVisible = true"
    />
    <LabelPrinterSettingsDialog
      v-model:visible="printerSettingsVisible"
      route-name="production-tracking"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Printer, Refresh } from '@element-plus/icons-vue';
import type { TableInstance } from 'element-plus';
import {
  PRODUCTION_TRACKING_ABNORMALITY_STATUSES,
  PRODUCTION_TRACKING_ABNORMALITY_STATUS_LABELS,
  PRODUCTION_TRACKING_CARD_STATUSES,
  PRODUCTION_TRACKING_CARD_STATUS_LABELS,
} from '@company/constants';
import type {
  ProductionTrackingAbnormality,
  ProductionTrackingCardDetail,
  ProductionTrackingCardItem,
  ProductionTrackingStep,
} from '@company/contracts';
import { productionTrackingApi } from '../../../api/production/tracking';
import InlineHint from '../../../components/InlineHint.vue';
import TableToolbar from '../../../components/TableToolbar.vue';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import RemoteSearchSelect from '../../../components/RemoteSearchSelect.vue';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { usePageInitialLoad } from '../../../composables/requests/usePageInitialLoad';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import { useLabelPrinter } from '../../../composables/printing/use-label-printer';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { EMessage } from '../../../utils/message';
import { formatQuantity } from '../../../utils/quantity';
import { batchStatusMeta } from '../shared/production-status';
import TrackingCardEvidence from './TrackingCardEvidence.vue';
import TrackingCardActionDialog from './TrackingCardActionDialog.vue';
import TrackingAbnormalityCorrectionDialog from './TrackingAbnormalityCorrectionDialog.vue';
import TrackingAbnormalityTags from './TrackingAbnormalityTags.vue';
import TrackingLabelDialog from './TrackingLabelDialog.vue';
import LabelPrinterSettingsDialog from './LabelPrinterSettingsDialog.vue';
import {
  canCorrectTrackingQuantity,
  TRACKING_ACTION_LABELS,
  trackingCardStatus,
  trackingOutputLabel,
} from './tracking-presentation';
import type { TrackingCardAction } from './tracking-presentation';
import type { TrackingCardActionStepContext } from './use-tracking-card-action';
import type {
  TrackingAbnormalityCorrectionAction,
  TrackingAbnormalityCorrectionTarget,
} from './use-tracking-abnormality-correction';
import { useTrackingTaskSearch } from './use-tracking-task-search';
import { useProductionTrackingList } from './use-production-tracking-list';
import {
  useTrackingQuantityCorrection,
  type TrackingQuantityTarget,
} from './use-tracking-quantity-correction';

defineOptions({ name: 'ProductionTrackingPage' });
const route = useRoute(),
  router = useRouter();
const { canAccessRoute } = useRouteAccess();
const cardTable = ref<TableInstance>();
const selectedLabels = ref<ProductionTrackingCardItem[]>([]);
const {
  view,
  page,
  pageSize,
  total,
  query,
  cards,
  reports,
  loading,
  listError,
  context,
  contextLoading,
  contextError,
  contextReads,
  loadContext,
  loadList,
  normalizeKeyword,
} = useProductionTrackingList(() => {
  selectedLabels.value = [];
  cardTable.value?.clearSelection();
});
const taskSearch = useTrackingTaskSearch(() => context.value?.batch ?? null);
async function search(): Promise<void> {
  normalizeKeyword();
  cancelQuantityAction();
  page.value = 1;
  await loadList();
}
async function refresh(): Promise<void> {
  cancelQuantityAction();
  await Promise.all([loadContext(), loadList()]);
}
async function changeBatch(): Promise<void> {
  cancelQuantityAction();
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
  cancelQuantityAction();
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

const detailVisible = ref(false),
  selectedId = ref(''),
  selectedCard = ref<ProductionTrackingCardDetail | null>(null),
  selectedSteps = ref<ProductionTrackingStep[]>([]),
  detailLoading = ref(false),
  detailError = ref('');
const detailReads = useLatestReadRequest(() => {
  detailLoading.value = false;
});
async function loadDetail(): Promise<void> {
  const id = selectedId.value;
  if (!id || !detailVisible.value || !detailReads.isActive()) return;
  const read = detailReads.begin(() => detailVisible.value && selectedId.value === id);
  detailLoading.value = true;
  detailError.value = '';
  selectedCard.value = null;
  try {
    const card = await productionTrackingApi.detail(id, {
      signal: read.signal,
      skipErrorHandling: true,
    });
    if (!read.isCurrent()) return;
    if (card.id !== id) throw new Error('详情与所选追踪卡不一致，请重新加载');
    const workbench = await productionTrackingApi.workbench(card.productionBatchId, {
      signal: read.signal,
      skipErrorHandling: true,
    });
    if (workbench.batch.id !== card.productionBatchId)
      throw new Error('任务工序资料与所选追踪卡不一致，请重新加载');
    if (read.isCurrent()) {
      selectedCard.value = card;
      selectedSteps.value = workbench.steps;
      updateCardFacts(card);
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
  if (!detailReads.isActive()) return;
  cancelQuantityAction();
  selectedId.value = id;
  selectedCard.value = null;
  selectedSteps.value = [];
  detailVisible.value = true;
  await loadDetail();
}
async function selectCard(
  card: ProductionTrackingCardItem,
  column?: { type?: string },
): Promise<void> {
  if (column?.type === 'selection') return;
  await openCard(card.id);
}
const labelVisible = ref(false),
  labelCard = ref<ProductionTrackingCardDetail | null>(null),
  labelCards = ref<Array<Pick<ProductionTrackingCardItem, 'id' | 'cardNo'>>>([]),
  labelTarget = ref<Pick<ProductionTrackingCardItem, 'id' | 'cardNo'> | null>(null),
  labelLoading = ref(false),
  labelError = ref(''),
  actionVisible = ref(false),
  actionCard = ref<ProductionTrackingCardDetail | null>(null),
  actionStepContext = ref<TrackingCardActionStepContext | null>(null),
  action = ref<TrackingCardAction>('abnormality'),
  abnormality = ref<ProductionTrackingAbnormality | null>(null);
const correctionVisible = ref(false);
const correctionTarget = ref<TrackingAbnormalityCorrectionTarget | null>(null);
const actionInProgress = computed(() => actionVisible.value || correctionVisible.value);
const printer = useLabelPrinter();
const printerSettingsVisible = ref(false);
const labelReads = useLatestReadRequest(() => {
  if (labelLoading.value) labelError.value = '标签预览加载已中断，请重试';
  labelLoading.value = false;
});
function openSelectedLabels(): void {
  if (
    !labelReads.isActive() ||
    labelVisible.value ||
    loading.value ||
    listError.value ||
    !selectedLabels.value.length
  )
    return;
  cancelQuantityAction();
  labelTarget.value = null;
  labelCard.value = null;
  labelCards.value = selectedLabels.value.map(({ id, cardNo }) => ({ id, cardNo }));
  labelError.value = '';
  labelVisible.value = true;
}
async function openCardLabel(
  card: Pick<ProductionTrackingCardItem, 'id' | 'cardNo'>,
): Promise<void> {
  if (labelVisible.value || !labelReads.isActive()) return;
  cancelQuantityAction();
  labelTarget.value = { id: card.id, cardNo: card.cardNo };
  labelCards.value = [];
  labelCard.value = null;
  labelError.value = '';
  labelVisible.value = true;
  await loadLabel();
}
async function loadLabel(): Promise<void> {
  const target = labelTarget.value;
  if (!target || !labelVisible.value || labelCard.value || !labelReads.isActive()) return;
  const read = labelReads.begin(() => labelVisible.value && labelTarget.value === target);
  labelLoading.value = true;
  labelError.value = '';
  try {
    const card = await productionTrackingApi.detail(target.id, {
      signal: read.signal,
      skipErrorHandling: true,
    });
    if (!read.isCurrent()) return;
    if (card.id !== target.id) throw new Error('标签与所选追踪卡不一致，请重新加载');
    updateCardFacts(card);
    // 打开后的标签快照不随详情浏览、列表刷新或盘量更正替换。
    labelCard.value = { ...card };
  } catch (error) {
    if (read.isCurrent())
      labelError.value = error instanceof Error ? error.message : '标签预览加载失败，请重试';
  } finally {
    if (read.isCurrent()) labelLoading.value = false;
  }
}
async function openLabel(): Promise<void> {
  const card = selectedCard.value;
  if (
    !card ||
    labelVisible.value ||
    !detailVisible.value ||
    detailLoading.value ||
    detailError.value ||
    !detailReads.isActive()
  )
    return;
  await openCardLabel(card);
}
function openAction(value: TrackingCardAction, item?: ProductionTrackingAbnormality): void {
  const card = selectedCard.value;
  if (
    !card ||
    !detailVisible.value ||
    actionInProgress.value ||
    detailLoading.value ||
    detailError.value ||
    !detailReads.isActive()
  )
    return;
  actionCard.value = { ...card };
  actionStepContext.value = {
    productionBatchId: card.productionBatchId,
    steps: selectedSteps.value.map((step) => ({
      stepRecordId: step.stepRecordId,
      stepOrder: step.stepOrder,
    })),
  };
  action.value = value;
  abnormality.value = item ?? null;
  actionVisible.value = true;
}
function openAbnormalityCorrection(
  action: TrackingAbnormalityCorrectionAction,
  abnormality: ProductionTrackingAbnormality,
): void {
  const card = selectedCard.value;
  if (
    !card ||
    !detailVisible.value ||
    detailLoading.value ||
    detailError.value ||
    actionInProgress.value ||
    !detailReads.isActive()
  )
    return;
  correctionTarget.value = {
    action,
    cardId: card.id,
    cardNo: card.cardNo,
    abnormalityId: abnormality.id,
  };
  correctionVisible.value = true;
}
const hasOpenOperation = () =>
  actionInProgress.value || labelVisible.value || printerSettingsVisible.value;
const {
  target: quantityTarget,
  loading: quantityLoading,
  error: quantityError,
  cancel: cancelQuantityAction,
  load: loadQuantityAction,
  open: readQuantityAction,
  consumeLocation: consumeQuantityLocation,
} = useTrackingQuantityCorrection(
  () => !hasOpenOperation() && !detailVisible.value,
  (card) => {
    selectedId.value = card.id;
    updateCardFacts(card);
    if (!canCorrectTrackingQuantity(card)) {
      EMessage.warning(`${card.cardNo} 当前已不能更正盘量，请查看最新详情`);
      return;
    }
    actionCard.value = { ...card };
    actionStepContext.value = null;
    action.value = 'quantity';
    abnormality.value = null;
    actionVisible.value = true;
  },
);
async function openQuantityAction(card: ProductionTrackingCardItem): Promise<void> {
  if (canCorrectTrackingQuantity(card)) await readQuantityAction(card);
}
async function locateQuantityAction(target: TrackingQuantityTarget): Promise<void> {
  if (hasOpenOperation()) {
    if (!(actionVisible.value && action.value === 'quantity' && actionCard.value?.id === target.id))
      EMessage.warning(`请先完成或关闭当前操作，再更正 ${target.cardNo} 的盘量`);
    return;
  }
  detailVisible.value = false;
  if (context.value?.batch.id !== target.productionBatchId) context.value = null;
  Object.assign(query, {
    batchId: target.productionBatchId,
    stepRecordId: '',
    keyword: target.cardNo,
    status: '',
    abnormalityStatus: '',
  });
  view.value = 'cards';
  page.value = 1;
  selectedId.value = '';
  await Promise.all([loadContext(), loadList(), readQuantityAction(target)]);
}
watch(detailVisible, (visible) => {
  if (!visible) detailReads.invalidate();
});
watch(labelVisible, (visible) => {
  if (visible) return;
  labelReads.invalidate();
  labelTarget.value = null;
  labelCard.value = null;
  labelError.value = '';
});
function updateCardFacts(card: ProductionTrackingCardDetail): void {
  cards.value = cards.value.map((item) =>
    item.id === card.id && item.version <= card.version ? card : item,
  );
  if (actionCard.value?.id === card.id && actionCard.value.version <= card.version)
    actionCard.value = card;
}
function cardBasisRefreshed(card: ProductionTrackingCardDetail): void {
  if (selectedCard.value?.id === card.id && selectedCard.value.version <= card.version)
    selectedCard.value = card;
  if (actionCard.value?.id === card.id && actionCard.value.version <= card.version)
    actionCard.value = card;
}
async function cardChanged(card: ProductionTrackingCardDetail): Promise<void> {
  if (detailVisible.value && selectedId.value === card.id) {
    detailReads.invalidate();
    detailError.value = '';
    if (!selectedCard.value || selectedCard.value.version <= card.version)
      selectedCard.value = card;
  }
  updateCardFacts(card);
  await refresh();
}
let consumedLocation = '';
async function locate(): Promise<void> {
  if (route.name !== 'production-tracking' || !contextReads.isActive()) return;
  const batchId = typeof route.query.batchId === 'string' ? route.query.batchId : '';
  const cardId = typeof route.query.cardId === 'string' ? route.query.cardId : '';
  const key = `${batchId}/${cardId}/${String(route.query.stepRecordId || '')}/${String(route.query.view || '')}`;
  const cardNo = route.query.quantityCorrection;
  if (batchId && cardId && typeof cardNo === 'string' && cardNo) {
    consumedLocation = key;
    if (await consumeQuantityLocation())
      await locateQuantityAction({ id: cardId, productionBatchId: batchId, cardNo });
    return;
  }
  if (key === consumedLocation) return;
  consumedLocation = key;
  query.batchId = batchId || null;
  query.stepRecordId = typeof route.query.stepRecordId === 'string' ? route.query.stepRecordId : '';
  view.value = route.query.view === 'history' ? 'history' : 'cards';
  await Promise.all([refresh(), cardId ? openCard(cardId) : Promise.resolve()]);
}
watch(
  () => [
    route.name,
    route.query.batchId,
    route.query.cardId,
    route.query.stepRecordId,
    route.query.view,
    route.query.quantityCorrection,
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
.overview-panel {
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
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
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
