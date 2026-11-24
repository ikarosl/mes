<template>
  <div
    v-if="collapsible"
    class="mark-disclosure"
  >
    <DisclosureToggle
      :expanded="candidatesExpanded"
      :aria-controls="candidatesId"
      label="报废编码"
      @toggle="expanded = !expanded"
    />
    <el-text
      v-if="minimumSelection > 0"
      :type="modelValue.length < minimumSelection ? 'danger' : undefined"
      role="status"
      >至少选择 {{ formatQuantity(minimumSelection) }} 个实际报废编码。</el-text
    >
    <span
      v-else
      class="selection-hint"
      >{{
        selectionTarget !== undefined
          ? '按实物逐件选码。'
          : '已绑定的报废实物请选码，未绑定的按数量扣减。'
      }}
    </span>
  </div>
  <div
    v-show="candidatesExpanded"
    :id="candidatesId"
    class="item-mark-list"
  >
    <section
      v-if="selectable && retainedMarks.length"
      class="retained-scrap"
      aria-label="更正前报废编码"
    >
      <div>更正前报废编码（{{ retainedMarks.length }} 个）</div>
      <div class="retained-scrap-codes">
        <el-checkbox
          v-for="mark in retainedPageMarks"
          :key="mark.itemMarkId"
          :model-value="modelValue.includes(mark.itemMarkId)"
          :disabled="locked || !enabled"
          @change="selectRetainedMark(mark.itemMarkId, Boolean($event))"
          >{{ mark.markCode }}</el-checkbox
        >
      </div>
      <PaginationFooter
        v-if="retainedMarks.length > 20"
        :total="retainedMarks.length"
        :current-page="retainedPage"
        :page-size="20"
        :show-page-size="false"
        compact
        @page-change="retainedPage = $event"
      />
    </section>
    <div class="mark-filters">
      <el-input
        v-model="keyword"
        placeholder="搜索实际单件刻码"
        clearable
        :disabled="!enabled"
        @keyup.enter="search"
      />
      <el-input
        v-if="!cardId"
        v-model="cardNo"
        placeholder="筛选追踪卡号"
        clearable
        :disabled="!enabled"
        @keyup.enter="search"
      />
      <el-select
        v-if="!selectable"
        v-model="status"
        placeholder="全部状态"
        clearable
        :disabled="!enabled"
        @change="search"
      >
        <el-option
          v-for="value in PRODUCTION_TRACKING_ITEM_MARK_STATUSES"
          :key="value"
          :value="value"
          :label="PRODUCTION_TRACKING_ITEM_MARK_STATUS_LABELS[value]"
        />
      </el-select>
      <el-button
        :disabled="!enabled || loading"
        @click="search"
        >查询</el-button
      >
      <el-button
        :disabled="!enabled"
        :loading="loading"
        @click="load"
        >刷新</el-button
      >
      <span
        v-if="selectable"
        class="selection-hint"
        >勾选表头只选择本页，已选编码跨页保留</span
      >
    </div>
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      show-icon
      :closable="false"
    />
    <div
      v-if="restoredCodes.length || addedScrapCodes.length"
      class="scrap-selection-impact"
    >
      <div v-if="restoredCodes.length">恢复为有效绑定 · {{ restoredCodes.join('、') }}</div>
      <div v-if="addedScrapCodes.length">新增报废 · {{ addedScrapCodes.join('、') }}</div>
    </div>
    <el-table
      ref="tableRef"
      v-loading="loading"
      :data="items"
      row-key="id"
      border
      :empty-text="
        !batchId && !cardId && !keyword.trim() && !cardNo.trim()
          ? '输入实际刻码查询，或先选择任务'
          : '暂无单件刻码记录'
      "
      @expand-change="setExpanded"
    >
      <el-table-column
        v-if="!selectable"
        type="expand"
        width="42"
      >
        <template #default="{ row }">
          <div class="mark-followup-details">
            <template v-if="row.cancellation"
              >撤销：{{ row.cancellation.reason }} ·
              {{ formatDateTimeForDisplay(row.cancellation.createdAt) }}</template
            >
            <template v-else-if="row.status === 'cancelled'"
              >已释放，换绑详情见全局操作日志。</template
            >
            <template v-else-if="row.scrap"
              >报废：{{ formatDateTimeForDisplay(row.scrap.createdAt) }}</template
            >
            <template v-else-if="row.outputReceipts.length">
              <div>本盘入库单</div>
              <div
                v-for="receipt in row.outputReceipts"
                :key="receipt.inboundId"
                class="receipt-record"
              >
                <el-button
                  v-if="canAccessRoute({ name: 'warehouse-finished-inbound' })"
                  link
                  type="primary"
                  @click="openInbound(receipt)"
                  >{{ receipt.inboundNo }}</el-button
                >
                <span v-else>{{ receipt.inboundNo }}</span>
                <div class="record-note">库存批次 {{ receipt.batchCode }}</div>
              </div>
            </template>
            <template v-else-if="row.output"
              >已终检，待入库
              <div class="record-note">
                {{ formatDateTimeForDisplay(row.output.confirmedAt) }}
              </div></template
            >
            <span v-else>尚未终检</span>
          </div>
          <TrackingItemMarkCorrectionHistory
            v-if="expandedIds.includes(row.id)"
            :item="row"
            :enabled="enabled && expandedIds.includes(row.id)"
          />
        </template>
      </el-table-column>
      <el-table-column
        v-if="selectable"
        width="56"
        align="center"
      >
        <template #header>
          <el-checkbox
            :model-value="pageSelected"
            :indeterminate="pagePartiallySelected"
            :disabled="selectionLocked || !selectablePageIds.length"
            aria-label="选择本页有效编码"
            @change="selectPage(Boolean($event))"
          />
        </template>
        <template #default="{ row }">
          <el-checkbox
            :model-value="modelValue.includes(row.id)"
            :disabled="selectionLocked || row.status !== 'active'"
            :aria-label="`选择报废编码 ${row.fullCode}`"
            @change="selectRow(row.id, Boolean($event))"
          />
        </template>
      </el-table-column>
      <el-table-column
        prop="markCode"
        label="实际单件刻码"
        min-width="130"
      />
      <el-table-column
        v-if="!cardId"
        prop="cardNo"
        label="追踪卡号"
        min-width="220"
      />
      <el-table-column
        v-if="showFullCode"
        prop="fullCode"
        label="完整追溯码"
        min-width="270"
      />
      <el-table-column
        label="状态"
        width="110"
      >
        <template #default="{ row }"
          ><el-tag :type="trackingItemMarkStatus(row.status).type">{{
            trackingItemMarkStatus(row.status).label
          }}</el-tag></template
        >
      </el-table-column>
      <el-table-column
        v-if="!selectable"
        prop="personnelName"
        label="绑定登记人"
        min-width="110"
      />
      <el-table-column
        v-if="!selectable"
        label="绑定时间"
        min-width="170"
      >
        <template #default="{ row }">{{ formatDateTimeForDisplay(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column
        v-if="allowCancel || allowCorrect || allowCorrectScrap"
        label="操作"
        width="180"
        fixed="right"
      >
        <template #default="{ row }"
          ><el-button
            v-if="allowCorrect && row.status !== 'cancelled'"
            link
            type="primary"
            :disabled="locked || loading || Boolean(error)"
            @click="emit('correct', row)"
            >更正编码</el-button
          ><el-button
            v-if="
              allowCancel && row.status === 'active' && !row.output && !row.outputReceipts.length
            "
            link
            type="danger"
            :disabled="locked || loading || Boolean(error)"
            @click="emit('cancel', row)"
            >撤销</el-button
          ><el-button
            v-if="allowCorrectScrap && row.scrap"
            link
            type="primary"
            :disabled="locked || loading || Boolean(error)"
            @click="emit('correctScrap', row)"
            >更正报废</el-button
          ></template
        >
      </el-table-column>
    </el-table>
    <PaginationFooter
      :total="total"
      :current-page="page"
      :page-size="pageSize"
      :disabled="!enabled || loading"
      :compact="compact"
      @page-change="changePage"
      @update:page-size="changePageSize"
    />
    <Teleport
      v-if="selectable && selectionFooterHost"
      :to="selectionFooterHost"
    >
      <div
        class="selection-bar"
        :class="{ 'selection-bar--active': modelValue.length }"
      >
        <span
          ref="selectionStatus"
          role="status"
          tabindex="-1"
          >已选 <strong>{{ selectionCount }}</strong> 个报废编码</span
        >
        <div
          v-if="modelValue.length"
          class="selection-actions"
        >
          <el-button
            link
            type="primary"
            :disabled="false"
            aria-haspopup="dialog"
            @click="openSelectionReview"
            >查看已选</el-button
          >
          <el-button
            link
            :disabled="selectionReadOnly"
            @click="clearSelection"
            >清空选择</el-button
          >
        </div>
      </div>
    </Teleport>
    <el-dialog
      v-if="selectable && selectionReviewHost"
      v-model="reviewVisible"
      :append-to="selectionReviewHost"
      title="已选报废编码"
      :width="DialogWidth.sm"
      destroy-on-close
      @closed="restoreSelectionFocus"
    >
      <ul
        ref="reviewList"
        class="selected-codes"
      >
        <li
          v-for="(mark, index) in selectedPageMarks"
          :key="mark.id"
          class="selected-code"
        >
          <span>{{ mark.code }}</span>
          <el-button
            link
            type="danger"
            :disabled="selectionReadOnly"
            :aria-label="`取消选择 ${mark.code}`"
            @click="removeSelectedMark(mark.id, index)"
            >取消选择</el-button
          >
        </li>
      </ul>
      <PaginationFooter
        v-if="modelValue.length > SELECTED_PAGE_SIZE"
        :total="modelValue.length"
        total-suffix="个"
        :current-page="selectedPage"
        :page-size="SELECTED_PAGE_SIZE"
        :show-page-size="false"
        layout="prev, pager, next"
        compact
        @page-change="selectedPage = $event"
      />
      <template #footer>
        <el-button
          :disabled="selectionReadOnly || !modelValue.length"
          @click="clearSelection"
          >清空选择</el-button
        >
        <el-button
          :disabled="false"
          @click="reviewVisible = false"
          >{{ candidatesExpanded ? '返回表格' : '返回表单' }}</el-button
        >
      </template>
    </el-dialog>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, onDeactivated, ref, useId, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { TableInstance } from 'element-plus';
import type {
  ProductionOutputInboundResult,
  ProductionTrackingAbnormalityScrappedItemMark,
  ProductionTrackingItemMark,
  ProductionTrackingItemMarkStatus,
} from '@company/contracts';
import {
  PRODUCTION_TRACKING_ITEM_MARK_STATUSES,
  PRODUCTION_TRACKING_ITEM_MARK_STATUS_LABELS,
} from '@company/constants';
import { normalizeTrackingCardNo } from '@company/utils';
import { productionTrackingApi } from '../../../api/production/tracking';
import DisclosureToggle from '../../../components/DisclosureToggle.vue';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { DialogWidth } from '../../../utils/dialog';
import { formatQuantity } from '../../../utils/quantity';
import { trackingItemMarkStatus } from './tracking-presentation';
import TrackingItemMarkCorrectionHistory from './TrackingItemMarkCorrectionHistory.vue';

defineOptions({ name: 'TrackingItemMarkList' });
const props = withDefaults(
  defineProps<{
    batchId?: string;
    cardId?: string;
    enabled?: boolean;
    revision?: number;
    selectable?: boolean;
    modelValue?: string[];
    locked?: boolean;
    allowCancel?: boolean;
    allowCorrect?: boolean;
    allowCorrectScrap?: boolean;
    collapsible?: boolean;
    defaultExpanded?: boolean;
    minimumSelection?: number;
    retainedScrapMarks?: ProductionTrackingAbnormalityScrappedItemMark[];
    selectionTarget?: number | null;
    selectionFooterHost?: HTMLElement | null;
    selectionReviewHost?: HTMLElement | null;
    showFullCode?: boolean;
    compact?: boolean;
  }>(),
  {
    batchId: '',
    cardId: '',
    enabled: true,
    revision: 0,
    selectable: false,
    modelValue: () => [],
    locked: false,
    allowCancel: false,
    allowCorrect: false,
    allowCorrectScrap: false,
    collapsible: false,
    defaultExpanded: false,
    minimumSelection: 0,
    selectionTarget: undefined,
    selectionFooterHost: null,
    selectionReviewHost: null,
    showFullCode: true,
    compact: false,
  },
);
const expanded = defineModel<boolean>('expanded', { default: false });
const emit = defineEmits<{
  'update:modelValue': [ids: string[]];
  cancel: [item: ProductionTrackingItemMark];
  correct: [item: ProductionTrackingItemMark];
  correctScrap: [item: ProductionTrackingItemMark];
}>();
const router = useRouter();
const { canAccessRoute } = useRouteAccess();
const candidatesId = useId();
const candidatesExpanded = computed(() => !props.collapsible || expanded.value);
watch(
  () => props.defaultExpanded,
  (value) => {
    if (value) expanded.value = true;
  },
  { immediate: true },
);
watch(
  () => props.minimumSelection,
  (minimum) => {
    if (props.collapsible && minimum > props.modelValue.length) expanded.value = true;
  },
  { immediate: true },
);
const tableRef = ref<TableInstance>();
const expandedIds = ref<string[]>([]);
function setExpanded(_row: ProductionTrackingItemMark, rows: ProductionTrackingItemMark[]): void {
  expandedIds.value = rows.map((item) => item.id);
}
async function openInbound(receipt: ProductionOutputInboundResult): Promise<void> {
  await router.push({
    name: 'warehouse-finished-inbound',
    query: {
      documentId: receipt.inboundId,
      sourceType: 'finished_product',
    },
  });
}
const items = ref<ProductionTrackingItemMark[]>([]),
  loading = ref(false),
  error = ref(''),
  total = ref(0);
const page = ref(1),
  pageSize = ref(10),
  keyword = ref(''),
  cardNo = ref(''),
  status = ref<ProductionTrackingItemMarkStatus | ''>('');
const SELECTED_PAGE_SIZE = 20;
const selectedCodes = ref<Record<string, string>>({});
const selectedPage = ref(1);
const reviewVisible = ref(false);
const reviewList = ref<HTMLUListElement>();
const selectionStatus = ref<HTMLSpanElement>();
const retainedPage = ref(1);
const retainedMarks = computed(() => props.retainedScrapMarks ?? []);
const retainedPageMarks = computed(() =>
  retainedMarks.value.slice((retainedPage.value - 1) * 20, retainedPage.value * 20),
);
const retainedCodes = computed(
  () => new Map(retainedMarks.value.map((item) => [item.itemMarkId, item.markCode])),
);
const selectionCount = computed(() => {
  const count = props.modelValue.length;
  return typeof props.selectionTarget === 'number'
    ? `${count} / ${props.selectionTarget}`
    : String(count);
});
const selectedIds = computed(() => new Set(props.modelValue));
const restoredCodes = computed(() =>
  retainedMarks.value
    .filter((mark) => !selectedIds.value.has(mark.itemMarkId))
    .map((mark) => mark.markCode),
);
const addedScrapCodes = computed(() => {
  if (!props.retainedScrapMarks) return [];
  return props.modelValue
    .filter((id) => !retainedCodes.value.has(id))
    .map((id) => selectedCodes.value[id] ?? '已选编码');
});
const selectedPageMarks = computed(() => {
  const end = selectedPage.value * SELECTED_PAGE_SIZE;
  return props.modelValue.slice(end - SELECTED_PAGE_SIZE, end).map((id) => ({
    id,
    code: retainedCodes.value.get(id) ?? selectedCodes.value[id] ?? '已选编码',
  }));
});
const reads = useLatestReadRequest(() => {
  loading.value = false;
});
const selectionReadOnly = computed(() => props.locked || !props.enabled);
const selectionLocked = computed(
  () => selectionReadOnly.value || loading.value || Boolean(error.value),
);
const selectablePageIds = computed(() =>
  items.value.filter((item) => item.status === 'active').map((item) => item.id),
);
const pageSelected = computed(
  () =>
    selectablePageIds.value.length > 0 &&
    selectablePageIds.value.every((id) => selectedIds.value.has(id)),
);
const pagePartiallySelected = computed(
  () => !pageSelected.value && selectablePageIds.value.some((id) => selectedIds.value.has(id)),
);
function updateSelection(ids: string[]): void {
  if (selectionLocked.value) return;
  for (const item of items.value)
    if (ids.includes(item.id)) selectedCodes.value[item.id] = item.markCode;
  emit('update:modelValue', ids);
}
function selectRow(id: string, checked: boolean): void {
  updateSelection(
    checked
      ? [...new Set([...props.modelValue, id])]
      : props.modelValue.filter((value) => value !== id),
  );
}
function selectRetainedMark(id: string, checked: boolean): void {
  if (selectionReadOnly.value) return;
  emit(
    'update:modelValue',
    checked
      ? [...new Set([...props.modelValue, id])]
      : props.modelValue.filter((value) => value !== id),
  );
}
function selectPage(checked: boolean): void {
  const pageIds = new Set(selectablePageIds.value);
  updateSelection(
    checked
      ? [...new Set([...props.modelValue, ...pageIds])]
      : props.modelValue.filter((id) => !pageIds.has(id)),
  );
}
function openSelectionReview(): void {
  selectedPage.value = 1;
  reviewVisible.value = true;
}
function restoreSelectionFocus(): void {
  if (!props.modelValue.length) selectionStatus.value?.focus({ preventScroll: true });
}
async function removeSelectedMark(id: string, index: number): Promise<void> {
  if (selectionReadOnly.value) return;
  emit(
    'update:modelValue',
    props.modelValue.filter((value) => value !== id),
  );
  await nextTick();
  if (reviewVisible.value && reviewList.value) {
    const buttons = reviewList.value.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    buttons[Math.min(index, buttons.length - 1)]?.focus();
  }
}
async function clearSelection(): Promise<void> {
  if (selectionReadOnly.value) return;
  const clearingFromReview = reviewVisible.value;
  emit('update:modelValue', []);
  if (!clearingFromReview) {
    await nextTick();
    restoreSelectionFocus();
  }
}
async function load(): Promise<void> {
  if (!props.enabled || !candidatesExpanded.value || !reads.isActive()) return;
  if (!props.batchId && !props.cardId && !keyword.value.trim() && !cardNo.value.trim()) {
    reads.invalidate();
    items.value = [];
    total.value = 0;
    error.value = '';
    return;
  }
  const target = `${props.batchId}/${props.cardId}`;
  const read = reads.begin(
    () =>
      props.enabled && candidatesExpanded.value && target === `${props.batchId}/${props.cardId}`,
  );
  loading.value = true;
  error.value = '';
  try {
    const result = await productionTrackingApi.itemMarks(
      {
        batchId: props.batchId || undefined,
        cardId: props.cardId || undefined,
        cardNo: cardNo.value.trim() || undefined,
        keyword: keyword.value.trim() || undefined,
        status: props.selectable ? 'active' : status.value || undefined,
        page: page.value,
        pageSize: pageSize.value,
      },
      { signal: read.signal, skipErrorHandling: true },
    );
    if (!read.isCurrent()) return;
    for (const item of result.items)
      if (selectedIds.value.has(item.id)) selectedCodes.value[item.id] = item.markCode;
    items.value = result.items;
    total.value = result.total;
  } catch (failure) {
    if (read.isCurrent())
      error.value = failure instanceof Error ? failure.message : '单件刻码记录加载失败，请刷新重试';
  } finally {
    if (read.isCurrent()) loading.value = false;
  }
}
async function search(): Promise<void> {
  cardNo.value = normalizeTrackingCardNo(cardNo.value);
  page.value = 1;
  await load();
}
async function changePage(value: number): Promise<void> {
  page.value = value;
  await load();
}
async function changePageSize(value: number): Promise<void> {
  pageSize.value = value;
  await search();
}
watch(
  () =>
    [props.batchId, props.cardId, props.enabled, props.revision, candidatesExpanded.value] as const,
  (value, previous) => {
    reads.invalidate();
    if (!previous || value[0] !== previous[0] || value[1] !== previous[1]) {
      reviewVisible.value = false;
      items.value = [];
      total.value = 0;
      page.value = 1;
      keyword.value = '';
      cardNo.value = '';
      status.value = '';
      error.value = '';
    }
    if (props.enabled) void load();
  },
  { immediate: true },
);
watch(
  () => props.modelValue,
  (ids) => {
    selectedPage.value = Math.max(
      1,
      Math.min(selectedPage.value, Math.ceil(ids.length / SELECTED_PAGE_SIZE)),
    );
    if (!ids.length) {
      selectedCodes.value = {};
      reviewVisible.value = false;
    }
  },
);
watch(
  () => props.selectionFooterHost,
  (host) => {
    if (!host) reviewVisible.value = false;
  },
);
watch(retainedMarks, (marks) => {
  retainedPage.value = Math.max(1, Math.min(retainedPage.value, Math.ceil(marks.length / 20)));
});
onDeactivated(() => {
  reviewVisible.value = false;
});
defineExpose({ reload: load });
</script>
<style scoped>
.item-mark-list {
  display: grid;
  gap: 12px;
  min-width: 0;
}
.mark-disclosure {
  display: flex;
  align-items: center;
  gap: 8px;
}
.mark-filters {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.retained-scrap {
  padding: 8px 12px;
  border: 1px solid var(--el-border-color-lighter);
  line-height: 1.5;
}
.retained-scrap-codes {
  display: flex;
  flex-wrap: wrap;
  column-gap: 12px;
}
.retained-scrap-codes .el-checkbox {
  margin-right: 0;
}
.mark-filters .el-input {
  width: 240px;
}
.mark-filters .el-select {
  width: 140px;
}
.selection-hint {
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.selection-bar,
.selection-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.selection-bar {
  text-align: start;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.selection-bar strong {
  font-size: 14px;
  color: var(--el-text-color-primary);
}
.selection-bar--active {
  padding: 6px 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-bg-color);
  box-shadow: var(--el-box-shadow-light);
}
.selection-actions .el-button + .el-button {
  margin-left: 0;
}
.scrap-selection-impact {
  max-height: 8em;
  overflow: auto;
  overflow-wrap: anywhere;
  line-height: 1.65;
}
.selected-codes {
  margin: 0;
  padding: 0;
  list-style: none;
}
.selected-code {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  overflow-wrap: anywhere;
}
.selected-code + .selected-code {
  border-top: 1px solid var(--el-border-color-lighter);
}
.mark-filters .el-button + .el-button {
  margin-left: 0;
}
.record-note {
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.6;
}
.receipt-record + .receipt-record {
  margin-top: 8px;
}
</style>
