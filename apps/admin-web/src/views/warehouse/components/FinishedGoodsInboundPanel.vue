<template>
  <section class="finished-inbounds">
    <el-radio-group
      v-model="view"
      @change="refreshActive"
    >
      <el-radio-button value="candidates">待入库</el-radio-button>
      <el-radio-button value="history">已入库记录</el-radio-button>
    </el-radio-group>
    <template v-if="view === 'candidates'">
      <InlineHint class="inbound-hint">
        按<strong>当前有效余量</strong>分次、分批入库；同一入库单限<strong>同一生产任务</strong>，确认时重新核对资格。
      </InlineHint>
      <el-form
        :inline="true"
        class="query-panel"
        @submit.prevent="searchCandidates"
      >
        <el-form-item label="关键字"
          ><el-input
            v-model="candidateKeyword"
            clearable
            placeholder="工单 / 任务 / 成品"
            @keyup.enter="searchCandidates"
        /></el-form-item>
        <el-form-item label="来源类别"
          ><el-select
            v-model="candidateSource"
            clearable
            placeholder="全部类别"
          >
            <el-option
              v-for="source in FINISHED_GOODS_INBOUND_SOURCES"
              :key="source"
              :value="source"
              :label="FINISHED_GOODS_INBOUND_SOURCE_LABELS[source]"
            /> </el-select
        ></el-form-item>
        <el-form-item
          ><el-button
            type="primary"
            :loading="candidateLoading"
            @click="searchCandidates"
            >查询</el-button
          ><el-button @click="resetCandidates">重置</el-button></el-form-item
        >
      </el-form>
      <el-alert
        v-if="candidateError"
        :title="candidateError"
        type="error"
        :closable="false"
      />
      <div class="table-panel">
        <TableToolbar :total="candidateTotal"
          ><template #actions>
            <el-button
              type="primary"
              :disabled="!selected.length && !editorDialog?.hasDraft()"
              @click="openCreate"
              >{{
                selected.length ? `核对入库（${selected.length} 条目标明细）` : '继续核对草稿'
              }}</el-button
            >
            <el-button
              :disabled="(!selected.length && !editorDialog?.hasDraft()) || visible"
              @click="clearSelection"
              >放弃草稿</el-button
            >
            <span class="muted">按明细分页，工单分组仅含本页；跨页保留已选</span> </template
          ><template #tools
            ><el-button
              :icon="Refresh"
              text
              circle
              :loading="candidateLoading"
              aria-label="刷新可入库明细"
              @click="loadCandidates" /></template
        ></TableToolbar>
        <FinishedGoodsInboundCandidateGroups
          :rows="candidates"
          :loading="candidateLoading"
          :selected-task-id="selectedTaskId"
          :is-selected="isSelected"
          :can-view-inspection="auth.can(PERMISSIONS.quality.finishedInspections.view)"
          :empty-text="
            candidateError
              ? '读取失败，请刷新重试'
              : candidateKeyword || candidateSource
                ? '当前筛选无可入库明细，请清除筛选'
                : '暂无可入库明细；请先核对成品质检与批准产出清单'
          "
          @toggle="toggle"
          @open="openFromCandidate"
          @inspection="goInspection"
        />
        <PaginationFooter
          :total="candidateTotal"
          :current-page="candidatePage"
          :page-size="10"
          total-suffix="条明细"
          @page-change="changeCandidatePage"
        />
      </div>
    </template>
    <template v-else>
      <el-form
        :inline="true"
        class="query-panel"
        @submit.prevent="searchHistory"
      >
        <el-form-item label="关键字"
          ><el-input
            v-model="query.keyword"
            clearable
            placeholder="入库单 / 工单 / 任务 / 成品"
            @keyup.enter="searchHistory"
        /></el-form-item>
        <el-form-item label="来源类别"
          ><el-select
            v-model="query.sourceType"
            clearable
            placeholder="全部类别"
            ><el-option
              v-for="source in FINISHED_GOODS_INBOUND_SOURCES"
              :key="source"
              :value="source"
              :label="FINISHED_GOODS_INBOUND_SOURCE_LABELS[source]" /></el-select
        ></el-form-item>
        <el-form-item
          ><el-button
            type="primary"
            :loading="loading"
            @click="searchHistory"
            >查询</el-button
          ><el-button @click="resetHistory">重置</el-button></el-form-item
        >
      </el-form>
      <el-alert
        v-if="error"
        type="error"
        :closable="false"
        :title="error"
      />
      <div class="table-panel">
        <TableToolbar :total="total"
          ><template #tools
            ><el-button
              :icon="Refresh"
              text
              circle
              :loading="loading"
              aria-label="刷新成品入库记录"
              @click="refreshHistory" /></template
        ></TableToolbar>
        <section
          v-if="locatedInboundId && !locatedOnPage"
          class="current-location"
        >
          <div
            v-if="detachedOrder"
            class="current-location-note"
          >
            此定位单不计入当前筛选页
          </div>
          <div
            v-else
            class="current-location-heading"
          >
            <strong>当前定位</strong>
            <span>此入库单不计入当前筛选页</span>
            <el-button
              link
              @click="clearHistoryLocation"
              >取消定位</el-button
            >
          </div>
          <div
            v-if="!detachedOrder"
            v-loading="list.detailLoading[locatedInboundId]"
            class="current-location-body"
          >
            <el-alert
              v-if="list.detailErrors[locatedInboundId]"
              :title="list.detailErrors[locatedInboundId]"
              type="error"
              :closable="false"
            />
            <el-button
              v-if="list.detailErrors[locatedInboundId]"
              type="primary"
              link
              @click="retryHistoryDetail(locatedInboundId)"
              >重试读取定位单</el-button
            >
            <div
              v-if="!list.detailErrors[locatedInboundId]"
              class="location-status"
            >
              {{ loading ? '正在核对当前页…' : '正在读取定位单…' }}
            </div>
          </div>
          <FinishedGoodsInboundHistoryGroups
            v-if="detachedOrder"
            :rows="[detachedOrder]"
            :loading="false"
            empty-text=""
            :details="list.details"
            :detail-loading="list.detailLoading"
            :detail-errors="list.detailErrors"
            :located-inbound-id="locatedInboundId"
            @expand="loadHistoryDetail"
            @retry="retryHistoryDetail"
            @batch="goBatch"
            @approval="goApproval"
            @inspection="goInspection"
            @clear-location="clearHistoryLocation"
          />
        </section>
        <FinishedGoodsInboundHistoryGroups
          ref="historyGroups"
          :rows="rows"
          :loading="loading"
          :empty-text="
            error
              ? '读取失败，请刷新重试'
              : query.keyword || query.sourceType
                ? '当前筛选无已入库记录，请清除筛选'
                : '暂无已确认成品入库记录；可切换到待入库办理'
          "
          :details="list.details"
          :detail-loading="list.detailLoading"
          :detail-errors="list.detailErrors"
          :located-inbound-id="locatedInboundId"
          @expand="loadHistoryDetail"
          @retry="retryHistoryDetail"
          @batch="goBatch"
          @approval="goApproval"
          @inspection="goInspection"
          @clear-location="clearHistoryLocation"
        />
        <PaginationFooter
          :total="total"
          :current-page="query.page ?? 1"
          :page-size="query.pageSize ?? 20"
          @update:page-size="changeHistoryPageSize"
          @page-change="changeHistoryPage"
        />
      </div>
    </template>
    <FinishedGoodsInboundDialog
      ref="editorDialog"
      v-model:visible="visible"
      v-model:selected="selected"
      :active="active"
      @changed="onChanged"
    />
  </section>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onActivated,
  onDeactivated,
  onMounted,
  onScopeDispose,
  ref,
  watch,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import { Refresh } from '@element-plus/icons-vue';
import type { FinishedGoodsInboundCandidate, FinishedGoodsInboundSource } from '@company/contracts';
import {
  FINISHED_GOODS_INBOUND_SOURCES,
  FINISHED_GOODS_INBOUND_SOURCE_LABELS,
  PERMISSIONS,
} from '@company/constants';
import { productionApi } from '../../../api/production';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { useTabsStore } from '../../../stores/tabs';
import { useAuthStore } from '../../../stores/auth';
import TableToolbar from '../../../components/TableToolbar.vue';
import InlineHint from '../../../components/InlineHint.vue';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import { useFinishedGoodsInbounds } from '../composables/useFinishedGoodsInbounds';
import type { FinishedInboundSelection } from '../finished-inbound-selection';
import FinishedGoodsInboundDialog from './FinishedGoodsInboundDialog.vue';
import FinishedGoodsInboundCandidateGroups from './FinishedGoodsInboundCandidateGroups.vue';
import FinishedGoodsInboundHistoryGroups from './FinishedGoodsInboundHistoryGroups.vue';

defineOptions({ name: 'FinishedGoodsInboundPanel' });
const props = defineProps<{ requestedInboundId?: string | null; active: boolean }>();
const view = ref<'candidates' | 'history'>('candidates');
const candidateKeyword = ref('');
const candidateSource = ref<FinishedGoodsInboundSource | ''>('');
const candidatePage = ref(1);
const candidates = ref<FinishedGoodsInboundCandidate[]>([]);
const candidateTotal = ref(0);
const candidateLoading = ref(false);
const candidateError = ref('');
const candidateRead = useLatestReadRequest(() => {
  candidateLoading.value = false;
});
const selected = ref<FinishedInboundSelection[]>([]);
const selectedTaskId = computed(() => selected.value[0]?.source.productionBatchId ?? null);
const list = useFinishedGoodsInbounds();
const { query, rows, total, loading, error } = list;
const route = useRoute();
const router = useRouter();
const { canAccessRoute } = useRouteAccess();
const auth = useAuthStore();
const editorDialog = ref<InstanceType<typeof FinishedGoodsInboundDialog> | null>(null);
const historyGroups = ref<InstanceType<typeof FinishedGoodsInboundHistoryGroups> | null>(null);
const visible = ref(false);
const locatedInboundId = ref<string | null>(null);
const locationOrigin = ref<'route' | 'confirmed' | null>(null);
const locatedOnPage = computed(
  () =>
    !!locatedInboundId.value && rows.value.some((row) => row.inboundId === locatedInboundId.value),
);
const detachedOrder = computed(() =>
  locatedInboundId.value && !locatedOnPage.value
    ? (list.details[locatedInboundId.value] ?? null)
    : null,
);
let changingTarget = false;
let historyLoadSequence = 0;
let pageActive = true;

async function loadCandidates(): Promise<void> {
  if (!pageActive || !props.active || view.value !== 'candidates' || !candidateRead.isActive())
    return;
  const current = candidateRead.begin(
    () => pageActive && props.active && view.value === 'candidates',
  );
  candidateLoading.value = true;
  candidateError.value = '';
  try {
    const page = await productionApi.finishedGoodsInboundCandidates({
      keyword: candidateKeyword.value.trim() || undefined,
      sourceType: candidateSource.value || undefined,
      page: candidatePage.value,
      pageSize: 10,
    });
    if (!current.isCurrent()) return;
    candidates.value = page.items;
    candidateTotal.value = page.total;
  } catch (failure) {
    if (!current.isCurrent()) return;
    candidateError.value = '可入库明细读取失败，请重试';
    EMessage.error(failure);
  } finally {
    if (current.isCurrent()) candidateLoading.value = false;
  }
}
function searchCandidates(): void {
  candidatePage.value = 1;
  void loadCandidates();
}
function resetCandidates(): void {
  candidateKeyword.value = '';
  candidateSource.value = '';
  searchCandidates();
}
function changeCandidatePage(page: number): void {
  candidatePage.value = page;
  void loadCandidates();
}
function isSelected(allocationId: string): boolean {
  return selected.value.some((item) => item.source.allocationId === allocationId);
}
async function toggle(source: FinishedGoodsInboundCandidate): Promise<void> {
  if (visible.value || editorDialog.value?.isLocked()) return;
  if (isSelected(source.allocationId)) {
    const targetCount = selected.value.filter(
      (item) => item.source.allocationId === source.allocationId,
    ).length;
    if (targetCount > 1) {
      try {
        await RouteMessageBox.confirm(
          `取消整份授权将移除 ${targetCount} 条目标明细，确定继续吗？`,
          '取消已选授权',
          { type: 'warning', confirmButtonText: '移除整份授权' },
        );
      } catch {
        return;
      }
    }
    // A candidate checkbox represents the whole authorization, including every split target.
    selected.value = selected.value.filter(
      (item) => item.source.allocationId !== source.allocationId,
    );
    return;
  }
  if (
    !source.canConfirm ||
    (selectedTaskId.value && selectedTaskId.value !== source.productionBatchId)
  )
    return;
  selected.value.push({
    detailKey: crypto.randomUUID(),
    source: { ...source },
    quantity: source.remainingQuantity,
    target: { mode: 'new', clientKey: crypto.randomUUID() },
  });
}
async function openFromCandidate(source: FinishedGoodsInboundCandidate): Promise<void> {
  if (!isSelected(source.allocationId)) await toggle(source);
  if (isSelected(source.allocationId)) await openCreate();
}
async function goInspection(batchId: string, inspectionId?: string): Promise<void> {
  if (!canAccessRoute({ name: 'quality-finished-inspections' })) return;
  if (editorDialog.value?.isLocked()) {
    EMessage.warning('请先完成当前入库操作的核对或原操作重试');
    return;
  }
  await router.push({
    name: 'quality-finished-inspections',
    query: { batchId, ...(inspectionId ? { inspectionId } : {}) },
  });
}
async function goBatch(itemBatchId: string): Promise<void> {
  if (!canAccessRoute({ name: 'warehouse-inventory' })) return;
  if (editorDialog.value?.isLocked()) {
    EMessage.warning('请先完成当前入库操作的核对或原操作重试');
    return;
  }
  await router.push({ name: 'warehouse-inventory', query: { itemBatchId } });
}
async function goApproval(instanceId: string): Promise<void> {
  if (!canAccessRoute({ name: 'approval-inbox' })) return;
  if (editorDialog.value?.isLocked()) {
    EMessage.warning('请先完成当前入库操作的核对或原操作重试');
    return;
  }
  await router.push({ name: 'approval-inbox', query: { instanceId } });
}
async function prepareTargetSwitch(): Promise<boolean> {
  if (!editorDialog.value) return !selected.value.length;
  if (!(await editorDialog.value.prepareTargetSwitch())) return false;
  await nextTick();
  return true;
}
async function openCreate(): Promise<void> {
  if (changingTarget || (!selected.value.length && !editorDialog.value?.hasDraft())) return;
  if (visible.value) return;
  changingTarget = true;
  try {
    visible.value = true;
  } finally {
    changingTarget = false;
  }
}
async function clearSelection(): Promise<void> {
  if (!editorDialog.value) return;
  await editorDialog.value.discardDraft();
}
async function restoreCurrentNavigation(rejectedId: string): Promise<void> {
  if (route.name !== 'warehouse-inbound' || route.query.inboundId !== rejectedId) return;
  await router.replace({
    query: { ...route.query, inboundId: locatedInboundId.value ?? undefined },
  });
}
function retainVisibleDetails(): void {
  list.retainDetails([
    ...rows.value.map((row) => row.inboundId),
    ...(locatedInboundId.value ? [locatedInboundId.value] : []),
  ]);
}
function loadHistoryDetail(id: string): void {
  if (pageActive && props.active && view.value === 'history') void list.loadDetail(id);
}
function retryHistoryDetail(id: string): void {
  if (pageActive && props.active && view.value === 'history') void list.loadDetail(id, true);
}
async function loadHistory(refreshExpanded = false): Promise<void> {
  if (!pageActive || !props.active || view.value !== 'history') return;
  const sequence = ++historyLoadSequence;
  if (locatedInboundId.value) void list.loadDetail(locatedInboundId.value, refreshExpanded);
  const loaded = await list.load();
  if (
    !loaded ||
    sequence !== historyLoadSequence ||
    !pageActive ||
    !props.active ||
    view.value !== 'history'
  )
    return;
  retainVisibleDetails();
  if (locatedInboundId.value && !locatedOnPage.value)
    void list.loadDetail(locatedInboundId.value, refreshExpanded);
  await nextTick();
  for (const id of historyGroups.value?.expandedIds() ?? [])
    void list.loadDetail(id, refreshExpanded);
}
function searchHistory(): void {
  query.page = 1;
  void loadHistory();
}
function resetHistory(): void {
  query.keyword = undefined;
  query.sourceType = undefined;
  searchHistory();
}
function changeHistoryPage(page: number): void {
  query.page = page;
  void loadHistory();
}
function changeHistoryPageSize(size: number): void {
  query.pageSize = size;
  searchHistory();
}
function refreshHistory(): void {
  void loadHistory(true);
}
function clearHistoryLocation(): void {
  const oldId = locatedInboundId.value;
  locatedInboundId.value = null;
  locationOrigin.value = null;
  retainVisibleDetails();
  if (oldId && route.name === 'warehouse-inbound' && route.query.inboundId === oldId)
    void router.replace({ query: { ...route.query, inboundId: undefined } });
}
function onChanged(id: string): void {
  candidateRead.invalidate();
  visible.value = false;
  view.value = 'history';
  locatedInboundId.value = id;
  locationOrigin.value = 'confirmed';
  if (route.name === 'warehouse-inbound' && route.query.inboundId)
    void router.replace({ query: { ...route.query, inboundId: undefined } });
  void loadHistory();
}
function refreshActive(): void {
  if (!pageActive || !props.active) return;
  if (view.value === 'candidates') void loadCandidates();
  else {
    candidateRead.invalidate();
    void loadHistory(true);
  }
}
let navigating = false;
let pendingLocation: string | null | undefined;
async function locate(id: string | null | undefined): Promise<void> {
  if (!pageActive) {
    pendingLocation = id;
    return;
  }
  if (!id) {
    if (navigating) {
      pendingLocation = null;
      return;
    }
    if (locationOrigin.value === 'route') clearHistoryLocation();
    return;
  }
  if (navigating) {
    pendingLocation = id;
    return;
  }
  if (id === locatedInboundId.value && view.value === 'history') return;
  navigating = true;
  try {
    if (!(await prepareTargetSwitch())) {
      await restoreCurrentNavigation(id);
      return;
    }
    if (id !== props.requestedInboundId || route.name !== 'warehouse-inbound') return;
    view.value = 'history';
    locatedInboundId.value = id;
    locationOrigin.value = 'route';
    retainVisibleDetails();
    void loadHistory();
  } finally {
    navigating = false;
    const next = pendingLocation;
    pendingLocation = undefined;
    if (next !== undefined && next === props.requestedInboundId) void locate(next);
  }
}
watch(
  () => props.requestedInboundId,
  (id) => {
    void locate(id);
  },
  { immediate: true },
);
watch(view, (value) => {
  if (value === 'history') candidateRead.invalidate();
  else {
    historyLoadSequence++;
    list.cancelList();
    list.cancelDetails();
  }
});
onMounted(() => {
  if (!props.requestedInboundId) refreshActive();
});
watch(
  () => props.active,
  (active) => {
    if (active) refreshActive();
    else {
      candidateRead.invalidate();
      historyLoadSequence++;
      list.cancelList();
      list.cancelDetails();
    }
  },
);
let activated = false;
onActivated(() => {
  pageActive = true;
  const hasPendingLocation = pendingLocation !== undefined;
  let locatingNewTarget = false;
  if (hasPendingLocation) {
    const next = pendingLocation;
    pendingLocation = undefined;
    locatingNewTarget = !!next && (next !== locatedInboundId.value || view.value !== 'history');
    void locate(next);
  }
  if (activated && props.active && !locatingNewTarget) refreshActive();
  activated = true;
});
onDeactivated(() => {
  pageActive = false;
  candidateRead.invalidate();
  historyLoadSequence++;
  list.cancelList();
  list.cancelDetails();
});
onScopeDispose(
  useTabsStore().registerCloseGuard('warehouse-inbound', async () =>
    editorDialog.value ? editorDialog.value.discardDraft() : !selected.value.length,
  ),
);
</script>

<style scoped>
.finished-inbounds {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.query-panel,
.table-panel {
  border: 1px solid var(--el-border-color);
  background: #fff;
  border-radius: 6px;
}
.query-panel {
  padding: 16px 16px 0;
}
.query-panel :deep(.el-select) {
  width: 170px;
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.7;
}
.inbound-hint {
  margin: 0;
}
</style>
