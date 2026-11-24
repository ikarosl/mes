<template>
  <div class="mark-workspace">
    <form
      class="row-tools"
      @submit.prevent="search"
    >
      <el-input
        v-model="filters.keyword"
        placeholder="搜索实际单件刻码"
        clearable
        aria-label="搜索实际单件刻码"
      />
      <el-input
        v-model="filters.cardNo"
        placeholder="筛选追踪卡号"
        clearable
        aria-label="筛选追踪卡号"
      />
      <el-select
        v-model="filters.status"
        clearable
        placeholder="全部状态"
        aria-label="状态"
        @change="search"
      >
        <el-option
          v-for="value in PRODUCTION_TRACKING_MARK_WORKSPACE_STATUSES"
          :key="value"
          :value="value"
          :label="labels[value]"
        />
      </el-select>
      <el-button native-type="submit">查询</el-button
      ><el-button @click="refreshWorkspace">刷新</el-button>
    </form>
    <el-alert
      v-if="error"
      type="error"
      :title="error"
      :closable="false"
      show-icon
    />
    <el-table
      v-loading="loading"
      :data="rows"
      :row-key="rowKey"
      border
      empty-text="暂无匹配记录"
      @expand-change="expanded"
    >
      <el-table-column
        type="expand"
        width="42"
      >
        <template #default="{ row }">
          <div class="details">
            <span v-if="row.item.scrap"
              >报废时间 {{ formatDateTimeForDisplay(row.item.scrap.createdAt) }}</span
            >
            <span v-else-if="row.item.output"
              >终检时间 {{ formatDateTimeForDisplay(row.item.output.confirmedAt) }}</span
            >
            <span v-else>尚未终检</span>
            <div
              v-for="receipt in row.item.outputReceipts"
              :key="receipt.inboundId"
            >
              本盘入库单
              <el-button
                v-if="canAccessRoute({ name: 'warehouse-finished-inbound' })"
                link
                type="primary"
                @click="openReceipt(receipt.inboundId)"
                >{{ receipt.inboundNo }}</el-button
              >
              <span v-else>{{ receipt.inboundNo }}</span> · 库存批次 {{ receipt.batchCode }}
            </div>
            <TrackingItemMarkCorrectionHistory
              v-if="expandedKeys.includes(rowKey(row))"
              :item="row.item"
              :enabled="true"
            />
          </div>
        </template>
      </el-table-column>
      <el-table-column
        prop="cardNo"
        label="追踪卡号"
        min-width="165"
      />
      <el-table-column
        label="编码"
        min-width="150"
      >
        <template #default="{ row }">
          <WorkspaceMarkCodeInput
            :id="'grid-' + rowKey(row)"
            :model-value="drafts.get(rowKey(row))?.input ?? row.item.markCode"
            :label="`${row.cardNo} 编码`"
            :disabled="editLocked || Boolean(drafts.get(rowKey(row))?.transferTarget)"
            :feedback="fields.get(rowKey(row))"
            @update:model-value="edit(row, $event)"
            @retry="retry(drafts.get(rowKey(row))?.input ?? '')"
          />
          <el-text
            v-if="drafts.get(rowKey(row))?.transferTarget"
            size="small"
            >待换绑到 {{ drafts.get(rowKey(row))?.transferTarget?.cardNo }}</el-text
          >
          <el-text
            v-if="drafts.has(rowKey(row)) && stale(row)"
            type="warning"
            size="small"
          >
            当前记录为 {{ row.item.markCode }}，版本已变化。
            <el-button
              v-if="!drafts.get(rowKey(row))?.transferTarget"
              link
              type="primary"
              :disabled="editLocked"
              @click="rebase(row)"
              >核对并沿用输入</el-button
            >
          </el-text>
        </template>
      </el-table-column>
      <el-table-column
        label="状态"
        width="85"
        ><template #default="{ row }">
          <el-tag :type="trackingItemMarkStatus(row.item.status).type">{{
            trackingItemMarkStatus(row.item.status).label
          }}</el-tag>
        </template></el-table-column
      >
      <el-table-column
        label="绑定登记人"
        min-width="108"
        ><template #default="{ row }">{{ row.item.personnelName }}</template></el-table-column
      >
      <el-table-column
        label="绑定时间"
        min-width="155"
        ><template #default="{ row }">{{
          formatDateTimeForDisplay(row.item.createdAt)
        }}</template></el-table-column
      >
      <el-table-column
        label="操作"
        width="120"
        ><template #default="{ row }">
          <el-button
            v-if="drafts.get(rowKey(row))?.transferTarget"
            link
            :disabled="editLocked"
            @click="discard(row)"
            >撤回换绑</el-button
          >
          <el-button
            v-else-if="row.item.scrap"
            link
            type="primary"
            :disabled="editLocked"
            @click="emit('correctScrap', row.item)"
            >更正报废</el-button
          >
          <el-button
            v-else-if="canStageTransfer(row)"
            link
            type="primary"
            :disabled="editLocked || !transferSlots"
            @click="stageTransfer(row)"
            >换绑到当前卡</el-button
          >
        </template></el-table-column
      >
    </el-table>
    <PaginationFooter
      :total="total"
      :current-page="page"
      :page-size="pageSize"
      compact
      @page-change="go"
      @update:page-size="resize"
    />
    <section
      v-if="activeDrafts.length || recovery !== 'idle'"
      class="save-bar"
      aria-label="刻码更改"
    >
      <div class="save-bar-main">
        <div
          class="save-summary"
          role="status"
        >
          <strong>待保存 {{ activeDrafts.length }} 处</strong>
          <span
            v-if="issues"
            class="issue-count"
            >{{ issues }} 处需处理</span
          >
          <span v-else-if="checking">正在查重…</span>
        </div>
        <div class="save-actions">
          <el-button
            link
            type="primary"
            @click="reviewVisible = true"
            >查看更改</el-button
          >
          <label
            v-if="activeDrafts.length"
            class="reason"
          >
            <span>更改原因</span>
            <el-input
              v-model="reason"
              :disabled="editLocked"
              maxlength="5000"
              aria-label="更改原因"
              placeholder="必填"
            />
          </label>
          <el-button
            type="primary"
            :loading="saving"
            :disabled="!canSave"
            @click="save"
            >保存更改</el-button
          >
        </div>
      </div>
      <div
        v-if="!props.personnelId && !editLocked"
        class="save-note"
      >
        保存前请<el-button
          link
          type="primary"
          @click="emit('choosePersonnel')"
          >选择登记人员</el-button
        >
      </div>
      <el-text
        v-if="staleTransfer"
        type="warning"
        role="status"
        >换绑涉及的卡或绑定已变化，请撤回相关换绑并重新核对。</el-text
      >
      <el-text
        v-if="feedback"
        type="danger"
        role="status"
        >{{ feedback }}</el-text
      >
      <SubmissionRecoveryNotice
        v-if="recovery !== 'idle'"
        :status="recovery"
        :busy="saving"
        records-label="全局操作日志及当前刻码"
        allow-restart
        @retry="save"
        @restart="restart"
      />
    </section>
    <el-dialog
      v-model="reviewVisible"
      title="待保存的更改"
      :width="DialogWidth.md"
      destroy-on-close
    >
      <div class="review-list">
        <div
          v-for="draft in activeDrafts"
          :key="rowKey(draft.row)"
          class="review-row"
        >
          <div class="review-identity">
            <strong>{{ draft.row.cardNo }}</strong>
            <span>原码 {{ draft.row.item.markCode }}</span>
            <span v-if="draft.transferTarget">待换绑到 {{ draft.transferTarget.cardNo }}</span>
          </div>
          <WorkspaceMarkCodeInput
            :id="'review-' + rowKey(draft.row)"
            :label="draft.row.cardNo + ' 待保存编码'"
            :model-value="draft.input"
            :disabled="editLocked || Boolean(draft.transferTarget)"
            :feedback="fields.get(rowKey(draft.row))"
            @update:model-value="edit(draft.row, $event)"
            @retry="retry(draft.input)"
          />
          <el-button
            link
            :disabled="editLocked"
            @click="discard(draft.row)"
            >撤回改动</el-button
          >
        </div>
      </div>
      <template #footer><el-button @click="reviewVisible = false">返回表格</el-button></template>
    </el-dialog>
  </div>
</template>
<script setup lang="ts">
import { computed, onActivated, onDeactivated, onScopeDispose, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type {
  ProductionTrackingCardDetail,
  ProductionTrackingItemMark,
  ProductionTrackingItemMarkWorkspaceChange,
  ProductionTrackingItemMarkWorkspaceQuery,
  ProductionTrackingItemMarkWorkspaceRow as Row,
  SaveProductionTrackingItemMarkWorkspacePayload,
} from '@company/contracts';
import {
  PRODUCTION_TRACKING_MARK_WORKSPACE_STATUSES,
  PRODUCTION_TRACKING_ITEM_MARK_STATUS_LABELS as labels,
} from '@company/constants';
import { normalizeTrackingCardNo, TRACKING_ITEM_MARK_CODE_PATTERN } from '@company/utils';
import { DialogWidth } from '../../../utils/dialog';
import WorkspaceMarkCodeInput from './WorkspaceMarkCodeInput.vue';
import {
  canonicalDraftCode as normal,
  workspaceMarkRowKey as rowKey,
  useWorkspaceMarkValidation,
  type WorkspaceMarkDraft,
} from './use-workspace-mark-validation';
import { productionTrackingApi } from '../../../api/production/tracking';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import SubmissionRecoveryNotice from '../../../components/SubmissionRecoveryNotice.vue';
import {
  useIdempotentIntent,
  type IdempotentIntentStatus,
} from '../../../composables/idempotency/useIdempotentIntent';
import { confirmSubmissionClose } from '../../../composables/idempotency/submission-recovery';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import { useTabsStore } from '../../../stores/tabs';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { EMessage } from '../../../utils/message';
import { trackingItemMarkPending, trackingItemMarkStatus } from './tracking-presentation';
import TrackingItemMarkCorrectionHistory from './TrackingItemMarkCorrectionHistory.vue';

defineOptions({ name: 'TrackingItemMarkWorkspace' });
const props = defineProps<{
  batchId: string;
  personnelId: string;
  locked: boolean;
  targetCard?: ProductionTrackingCardDetail | null;
}>();
const emit = defineEmits<{
  saved: [];
  choosePersonnel: [];
  lock: [value: boolean];
  correctScrap: [item: ProductionTrackingItemMark];
}>();
const router = useRouter();
const { canAccessRoute } = useRouteAccess();
function openReceipt(id: string) {
  return router.push({
    name: 'warehouse-finished-inbound',
    query: { documentId: id, sourceType: 'finished_product' },
  });
}
const rows = ref<Row[]>([]),
  page = ref(1),
  pageSize = ref(10),
  total = ref(0),
  loading = ref(false),
  error = ref(''),
  feedback = ref('');
const filters = reactive({
  keyword: '',
  cardNo: '',
  status: undefined as ProductionTrackingItemMarkWorkspaceQuery['status'],
});
const applied = ref<ProductionTrackingItemMarkWorkspaceQuery>({});
const expandedKeys = ref<string[]>([]);

function expanded(_row: Row, open: Row[]) {
  expandedKeys.value = open.map(rowKey);
}
const reads = useLatestReadRequest(() => {
  loading.value = false;
});
async function load() {
  if (!reads.isActive()) return;
  const read = reads.begin();
  loading.value = true;
  error.value = '';
  try {
    const result = await productionTrackingApi.itemMarkWorkspace(
      {
        ...applied.value,
        batchId: props.batchId || undefined,
        page: page.value,
        pageSize: pageSize.value,
      },
      { signal: read.signal, skipErrorHandling: true },
    );
    if (!read.isCurrent()) return;
    total.value = result.total;
    const last = Math.max(1, Math.ceil(result.total / pageSize.value));
    if (page.value > last) {
      await go(last);
      return;
    }
    rows.value = result.items;
  } catch (e) {
    if (read.isCurrent()) error.value = e instanceof Error ? e.message : '刻码列表加载失败';
  } finally {
    if (read.isCurrent()) loading.value = false;
  }
}
async function go(value: number) {
  page.value = value;
  await load();
}
async function resize(value: number) {
  pageSize.value = value;
  await go(1);
}
async function search() {
  filters.cardNo = normalizeTrackingCardNo(filters.cardNo);
  applied.value = {
    keyword: filters.keyword.trim() || undefined,
    cardNo: filters.cardNo || undefined,
    status: filters.status || undefined,
  };
  await go(1);
}
watch(
  () => props.batchId,
  () => {
    filters.cardNo = '';
    filters.keyword = '';
    filters.status = undefined;
    rows.value = [];
    total.value = 0;
    feedback.value = '';
    void search();
  },
  { immediate: true },
);
onActivated(() => void load());
const drafts = reactive(new Map<string, WorkspaceMarkDraft>());
const reasons = reactive(new Map<string, string>());
const draftBatch = computed(
  () => props.batchId || drafts.values().next().value?.row.productionBatchId || '',
);
const activeDrafts = computed(() =>
  [...drafts.values()].filter((d) => d.row.productionBatchId === draftBatch.value),
);
const reason = computed({
  get: () => reasons.get(draftBatch.value) ?? '',
  set: (value: string) => reasons.set(draftBatch.value, value),
});
const transferTarget = computed(() => {
  const card = props.targetCard;
  if (
    !card ||
    card.productionBatchId !== props.batchId ||
    (card.status !== 'unused' && card.status !== 'in_progress') ||
    card.output ||
    card.openAbnormalityCount ||
    !trackingItemMarkPending(card)
  )
    return null;
  return card;
});
const transferSlots = computed(() => {
  const card = transferTarget.value;
  if (!card) return 0;
  const staged = activeDrafts.value.filter((draft) => draft.transferTarget?.id === card.id).length;
  return Math.max(0, trackingItemMarkPending(card) - staged);
});
const intent = useIdempotentIntent('保存单件刻码');
const recovery = ref<IdempotentIntentStatus>('idle'),
  saving = ref(false);
const editLocked = computed(() => props.locked || saving.value || recovery.value !== 'idle');
watch(
  () => saving.value || recovery.value !== 'idle',
  (v) => emit('lock', v),
  { flush: 'sync' },
);
function canStageTransfer(row: Row) {
  const target = transferTarget.value;
  return (
    target &&
    target.productionBatchId === row.productionBatchId &&
    target.id !== row.trackingCardId &&
    row.canClear &&
    TRACKING_ITEM_MARK_CODE_PATTERN.test(row.item.markCode) &&
    !drafts.has(rowKey(row))
  );
}
function stageTransfer(row: Row) {
  const target = transferTarget.value;
  if (editLocked.value || !target || !transferSlots.value || !canStageTransfer(row)) return;
  drafts.set(rowKey(row), {
    row,
    input: row.item.markCode,
    transferTarget: { id: target.id, cardNo: target.cardNo, version: target.version },
  });
  feedback.value = '';
}
function discard(row: Row) {
  drafts.delete(rowKey(row));
  if (![...drafts.values()].some((d) => d.row.productionBatchId === row.productionBatchId))
    reasons.delete(row.productionBatchId);
  feedback.value = '';
}
function edit(row: Row, input: string) {
  if (editLocked.value) return;
  if (!props.batchId && draftBatch.value && draftBatch.value !== row.productionBatchId) {
    feedback.value = '请先保存当前任务的改动，或选择目标任务继续编辑';
    return;
  }
  const key = rowKey(row);
  const draft = drafts.get(key);
  if (draft?.transferTarget) return;
  const original = draft?.row ?? row;
  if (normal(input) === original.item.markCode) discard(original);
  else drafts.set(key, { row: original, input });
  feedback.value = '';
}
function stale(row: Row) {
  const original = drafts.get(rowKey(row))?.row;
  return (
    original &&
    (original.cardVersion !== row.cardVersion || original.item.version !== row.item.version)
  );
}
function rebase(row: Row) {
  const draft = drafts.get(rowKey(row));
  if (draft && !draft.transferTarget) {
    const input = draft.input;
    drafts.delete(rowKey(row));
    edit(row, input);
  }
}
const staleTransfer = computed(() => {
  const target = props.targetCard;
  return (
    rows.value.some(
      (row) =>
        row.productionBatchId === draftBatch.value &&
        drafts.get(rowKey(row))?.transferTarget &&
        (!row.canClear || stale(row)),
    ) ||
    activeDrafts.value.some(
      (draft) =>
        draft.transferTarget &&
        target?.id === draft.transferTarget.id &&
        (target.version !== draft.transferTarget.version || !transferTarget.value),
    )
  );
});
const reviewVisible = ref(false);
onDeactivated(() => {
  reviewVisible.value = false;
});
watch([draftBatch, () => activeDrafts.value.length], ([batch, count], [old]) => {
  if (!count || batch !== old) reviewVisible.value = false;
});
const {
  fields,
  issues,
  checking,
  retry,
  refresh: refreshChecks,
} = useWorkspaceMarkValidation(activeDrafts);
const canSave = computed(
  () =>
    activeDrafts.value.length > 0 &&
    !editLocked.value &&
    !issues.value &&
    !checking.value &&
    !staleTransfer.value &&
    !!props.personnelId &&
    !!reason.value.trim(),
);
async function refreshWorkspace() {
  refreshChecks();
  await load();
}
let pending: {
  batchId: string;
  body: SaveProductionTrackingItemMarkWorkspacePayload;
  keys: string[];
} | null = null;
async function save() {
  if (saving.value || props.locked) return;
  if (!pending) {
    if (!canSave.value) return;
    pending = {
      batchId: draftBatch.value,
      keys: activeDrafts.value.map((d) => rowKey(d.row)),
      body: {
        personnelId: props.personnelId,
        reason: reason.value.trim(),
        changes: activeDrafts.value.flatMap<ProductionTrackingItemMarkWorkspaceChange>(
          ({ row, input, transferTarget }) => {
            const source = {
              cardId: row.trackingCardId,
              cardVersion: row.cardVersion,
              markId: row.item.id,
              previousMarkCode: row.item.markCode,
              version: row.item.version,
              markCode: transferTarget ? null : normal(input) || null,
            };
            if (!transferTarget) return [source];
            return [
              source,
              {
                cardId: transferTarget.id,
                cardVersion: transferTarget.version,
                markId: null,
                previousMarkCode: null,
                version: null,
                markCode: row.item.markCode,
              },
            ];
          },
        ),
      },
    };
  }
  const command = pending;
  saving.value = true;
  feedback.value = '';
  try {
    await intent.execute(
      {
        intentType: 'production.tracking.item-mark.save',
        params: { batchId: command.batchId },
        query: {},
        body: command.body,
      },
      (key) => productionTrackingApi.saveItemMarkWorkspace(command.batchId, command.body, key),
    );
    for (const key of command.keys) drafts.delete(key);
    reasons.delete(command.batchId);
    EMessage.success(`已保存 ${command.keys.length} 处更改`);
    await load();
  } catch (e) {
    feedback.value = e instanceof Error ? e.message : '保存失败，草稿已保留';
    if (intent.getStatus() === 'idle') await refreshWorkspace();
    return;
  } finally {
    recovery.value = intent.getStatus();
    if (recovery.value === 'idle') pending = null;
    saving.value = false;
  }
  emit('saved');
}
function restart() {
  if (saving.value) return;
  intent.reset();
  recovery.value = 'idle';
  pending = null;
  feedback.value = '请核对当前记录和待保存的改动';
  void load();
}
onScopeDispose(
  useTabsStore().registerCloseGuard(
    'production-workbench',
    async () =>
      !saving.value &&
      (await confirmSubmissionClose(intent.getStatus(), {
        entityLabel: '刻码列表',
        dirty: drafts.size > 0,
      })),
  ),
);
defineExpose({ reload: refreshWorkspace });
</script>
<style scoped>
.mark-workspace {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.row-tools {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.row-tools .el-input {
  width: 210px;
}
.row-tools .el-select {
  width: 128px;
}
.row-tools .el-button + .el-button {
  margin-left: 0;
}
.details {
  display: grid;
  gap: 8px;
  padding: 8px 20px;
}
.save-bar {
  position: sticky;
  bottom: 8px;
  z-index: 5;
  padding: 12px 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-bg-color);
  box-shadow: var(--el-box-shadow-light);
}
.save-bar-main,
.save-summary,
.save-actions,
.reason,
.save-note {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
}
.save-bar-main {
  justify-content: space-between;
}
.save-summary,
.save-note,
.reason,
.review-identity span {
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.save-summary strong {
  font-size: 14px;
  color: var(--el-text-color-primary);
}
.issue-count {
  color: var(--el-color-danger);
}
.save-actions {
  margin-inline-start: auto;
}
.reason .el-input {
  width: clamp(95px, 12vw, 160px);
}
.save-note {
  margin-block-start: 5px;
  gap: 2px;
}
.save-bar :deep(.el-button + .el-button) {
  margin-left: 0;
}
.review-row {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) minmax(130px, 1fr) auto;
  align-items: start;
  gap: 12px;
  padding: 10px 0;
}
.review-row + .review-row {
  border-top: 1px solid var(--el-border-color-lighter);
}
.review-identity {
  display: grid;
  gap: 4px;
  overflow-wrap: anywhere;
}
@media (max-width: 800px) {
  .review-row {
    grid-template-columns: 1fr auto;
  }
  .review-identity {
    grid-column: 1/-1;
  }
}
</style>
