<template>
  <el-dialog
    :model-value="visible"
    title="任务产出与成品入库"
    :width="DialogWidth.xl"
    :before-close="beforeClose"
    @update:model-value="requestClose"
  >
    <div class="output-workbench">
      <el-descriptions
        v-if="detail"
        :column="2"
        border
      >
        <el-descriptions-item label="任务">{{ detail.batchNo }}</el-descriptions-item>
        <el-descriptions-item label="成品"
          >{{ detail.productCode }} / {{ detail.productName }}</el-descriptions-item
        >
        <el-descriptions-item label="终检产出"
          ><BatchApprovedOutput :output="detail.finalOutput"
        /></el-descriptions-item>
        <el-descriptions-item label="入库 / 待入库"
          >{{ formatQuantity(detail.finalOutput.inboundQuantity) }} /
          {{ formatQuantity(detail.finalOutput.pendingInboundQuantity) }}</el-descriptions-item
        >
      </el-descriptions>
      <InlineHint
        >终检只登记产出。选择同一任务的待入库记录，按整条产出合并入库；本次入库将增加库存，已入库记录不能撤销。任务结束后仍可入库。</InlineHint
      >
      <SubmissionRecoveryNotice
        v-if="recovery"
        :status="intentStatus"
        :busy="submitting"
        records-label="产出记录与成品入库记录"
        :retry-disabled="!reads.isActive() || revokeSubmitting || Boolean(revokingOutput)"
        allow-restart
        @retry="submitInbound"
        @restart="restartInbound"
      />
      <el-alert
        v-if="error"
        :title="error"
        type="error"
        :closable="false"
        show-icon
      />
      <el-form
        :inline="true"
        :disabled="submitting || revokeSubmitting"
        class="query-form"
      >
        <el-form-item label="产出状态">
          <el-select
            v-model="status"
            clearable
            placeholder="全部状态"
            @change="search"
          >
            <el-option
              v-for="(label, value) in PRODUCTION_OUTPUT_STATUS_LABELS"
              :key="value"
              :value="value"
              :label="label"
            />
          </el-select>
        </el-form-item>
        <el-form-item
          ><el-button
            :loading="loading"
            @click="load"
            >刷新记录</el-button
          ></el-form-item
        >
      </el-form>
      <el-table
        ref="tableRef"
        v-loading="loading"
        :data="outputs"
        row-key="id"
        @selection-change="selectOutputs"
      >
        <el-table-column
          type="selection"
          width="45"
          :reserve-selection="true"
          :selectable="isSelectable"
        />
        <el-table-column
          label="产出来源"
          min-width="155"
        >
          <template #default="{ row }">
            <el-button
              v-if="row.trackingCardId && canAccessRoute({ name: 'production-tracking' })"
              link
              type="primary"
              @click="openCard(row)"
              >{{ row.cardNo }}</el-button
            >
            <span v-else>{{ row.cardNo || '研发产出' }}</span>
            <div class="secondary">产出记录 #{{ row.id }}</div>
          </template>
        </el-table-column>
        <el-table-column
          label="终检产出"
          width="110"
          align="right"
          ><template #default="{ row }"
            >{{ formatQuantity(row.quantity) }} {{ row.unit }}</template
          ></el-table-column
        >
        <el-table-column
          label="状态"
          min-width="120"
          ><template #default="{ row }"
            ><el-tag :type="outputStatusType(row.status)">{{
              outputStatusLabel(row.status)
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column
          label="登记人 / 时间"
          min-width="180"
          ><template #default="{ row }"
            >{{ row.personnelName }}
            <div class="secondary">{{ formatDateTimeForDisplay(row.confirmedAt) }}</div></template
          ></el-table-column
        >
        <el-table-column
          label="入库 / 撤销记录"
          min-width="220"
        >
          <template #default="{ row }">
            <template v-if="row.inbound">
              <el-button
                v-if="canAccessRoute({ name: 'warehouse-inbound-finished' })"
                link
                type="primary"
                @click="openInbound(row)"
                >{{ row.inbound.inboundNo }}</el-button
              ><span v-else>{{ row.inbound.inboundNo }}</span>
              <div class="secondary">批次 {{ row.inbound.batchCode }}</div>
            </template>
            <template v-else-if="row.cancellation"
              ><div>{{ row.cancellation.reason }}</div>
              <div class="secondary">
                {{ formatDateTimeForDisplay(row.cancellation.createdAt) }}
              </div></template
            >
            <span v-else>{{
              Number(row.quantity) === 0 ? '已确认零产出，无需入库' : '等待人工入库'
            }}</span>
            <div
              v-if="row.remark"
              class="secondary"
            >
              {{ row.remark }}
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="90"
          fixed="right"
        >
          <template #default="{ row }"
            ><el-button
              v-if="canRevoke(row)"
              link
              type="danger"
              :disabled="controlsLocked || loading || !!error"
              @click="openRevoke(row)"
              >撤销产出</el-button
            ><span
              v-else-if="row.status === 'inbounded'"
              class="secondary"
              >已入库</span
            ></template
          >
        </el-table-column>
      </el-table>
      <div class="record-footer">
        <span>共 {{ total }} 条产出记录</span>
        <el-pagination
          :current-page="page"
          :page-size="20"
          :total="total"
          layout="prev, pager, next"
          :disabled="submitting || revokeSubmitting"
          @current-change="changePage"
        />
      </div>
      <InlineHint v-if="detail?.status === 'completed'"
        >任务已结束。已确认产出仍可入库；修改未入库产出前须先重新打开任务。</InlineHint
      >
      <section class="inbound-form">
        <div class="selection-heading">
          <strong
            >本次入库 {{ selected.length }} 条 · {{ formatQuantity(selectedQuantity) }}
            {{ selectedUnit }}</strong
          ><el-button
            :disabled="controlsLocked || !selected.length"
            @click="clearSelection"
            >清空选择</el-button
          >
        </div>
        <div
          v-if="selected.length"
          class="selected-records"
        >
          {{ selected.map((item) => `${item.cardNo || '研发产出'} #${item.id}`).join('、') }}
        </div>
        <el-alert
          v-if="selectionConflict"
          :title="selectionConflict"
          type="warning"
          :closable="false"
          show-icon
        />
        <el-form
          label-width="96px"
          :disabled="controlsLocked"
        >
          <el-form-item
            label="入库批次"
            required
          >
            <el-radio-group
              v-model="targetMode"
              @change="targetModeChanged"
            >
              <el-radio-button value="new_batch">新建批次</el-radio-button
              ><el-radio-button value="existing_batch">已有批次</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item
            v-if="targetMode === 'existing_batch'"
            label="目标批次"
            required
          >
            <div class="target-picker">
              <el-select
                v-model="candidateId"
                filterable
                remote
                clearable
                :remote-method="searchCandidates"
                :loading="candidatesLoading"
                placeholder="搜索本任务可用的成品批次"
                @visible-change="candidateVisible"
              >
                <el-option
                  v-for="candidate in visibleCandidates"
                  :key="candidate.batchId"
                  :label="`${candidate.batchCode} · 可用库存 ${formatQuantity(candidate.availableQuantity)} ${candidate.unit}`"
                  :value="candidate.batchId"
                /> </el-select
              ><el-button
                :disabled="!selected.length"
                @click="loadCandidates"
                >刷新批次</el-button
              >
            </div>
            <div
              v-if="candidateError"
              class="candidate-error"
            >
              {{ candidateError }}
            </div>
            <div
              v-if="candidateBasisChanged"
              class="candidate-error"
            >
              目标批次已更新，原选择已保留。<el-button
                link
                type="primary"
                @click="adoptCandidate"
                >核对后采用最新批次</el-button
              >
            </div>
          </el-form-item>
          <el-form-item
            v-else
            label="批号"
            ><span>确认入库时生成一个新成品库存批次。</span></el-form-item
          >
          <el-form-item label="入库备注"
            ><el-input
              v-model="remark"
              type="textarea"
              :rows="2"
              maxlength="1000"
          /></el-form-item>
        </el-form>
      </section>
    </div>
    <template #footer
      ><el-button
        :disabled="submitting"
        @click="requestClose(false)"
        >关闭</el-button
      ><el-button
        type="primary"
        :loading="submitting"
        :disabled="recovery || !canSubmit"
        @click="submitInbound"
        >确认成品入库</el-button
      ></template
    >
  </el-dialog>
  <el-dialog
    :model-value="!!revokingOutput"
    title="撤销未入库产出"
    :width="DialogWidth.md"
    :before-close="beforeRevokeClose"
    @update:model-value="closeRevoke"
  >
    <template v-if="revokingOutput">
      <el-descriptions
        :column="1"
        border
        ><el-descriptions-item label="任务">{{ revokingOutput.batchNo }}</el-descriptions-item
        ><el-descriptions-item label="产出"
          >{{ revokingOutput.cardNo || '研发产出' }} · {{ formatQuantity(revokingOutput.quantity) }}
          {{ revokingOutput.unit }}</el-descriptions-item
        ></el-descriptions
      >
      <InlineHint
        >撤销会保留原记录和原因。追踪卡产出撤销后回到末站待终检，后续须重新确认产出；已入库产出不可撤销。</InlineHint
      >
      <SubmissionRecoveryNotice
        v-if="revokeStatus !== 'idle'"
        :status="revokeStatus"
        :busy="revokeSubmitting"
        records-label="产出记录"
        :retry-disabled="!reads.isActive()"
        allow-restart
        @retry="submitRevoke"
        @restart="restartRevoke"
      />
      <el-form
        label-width="96px"
        :disabled="revokeSubmitting || revokeStatus !== 'idle'"
        ><el-form-item
          label="撤销原因"
          required
          ><el-input
            v-model="revokeReason"
            type="textarea"
            :rows="3"
            maxlength="1000" /></el-form-item
      ></el-form>
    </template>
    <template #footer
      ><el-button
        :disabled="revokeSubmitting"
        @click="closeRevoke(false)"
        >取消</el-button
      ><el-button
        type="danger"
        :loading="revokeSubmitting"
        :disabled="revokeStatus !== 'idle'"
        @click="submitRevoke"
        >确认撤销产出</el-button
      ></template
    >
  </el-dialog>
</template>

<script setup lang="ts">
import SubmissionRecoveryNotice from '../../../components/SubmissionRecoveryNotice.vue';
import { computed, onScopeDispose, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { TableInstance } from 'element-plus';
import { PRODUCTION_OUTPUT_STATUS_LABELS } from '@company/constants';
import type {
  CreateProductionOutputInboundPayload,
  InventoryInboundBatchCandidate,
  ProductionBatchDetail,
  ProductionBatchItem,
  ProductionOutputItem,
  ProductionOutputStatus,
} from '@company/contracts';
import { productionOutputsApi } from '../../../api/production/outputs';
import { productionTasksApi } from '../../../api/production/tasks';
import InlineHint from '../../../components/InlineHint.vue';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import {
  useIdempotentIntent,
  type IdempotentIntentStatus,
} from '../../../composables/idempotency/useIdempotentIntent';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import { useTabsStore } from '../../../stores/tabs';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { formatQuantity } from '../../../utils/quantity';
import BatchApprovedOutput from '../shared/BatchApprovedOutput.vue';

const props = withDefaults(
  defineProps<{
    visible: boolean;
    batch: Pick<ProductionBatchItem, 'id'> | null;
    routeName?: string;
  }>(),
  { routeName: 'production-tasks' },
);
const emit = defineEmits<{ 'update:visible': [value: boolean]; changed: [batchId: string] }>();
const router = useRouter();
const { canAccessRoute } = useRouteAccess();
const tableRef = ref<TableInstance>();
const detail = ref<ProductionBatchDetail | null>(null),
  outputs = ref<ProductionOutputItem[]>([]),
  total = ref(0),
  page = ref(1),
  status = ref<ProductionOutputStatus | ''>(''),
  loading = ref(false),
  error = ref('');
const selected = ref<ProductionOutputItem[]>([]),
  targetMode = ref<CreateProductionOutputInboundPayload['target']['mode']>('new_batch'),
  candidateId = ref(''),
  remark = ref('');
const candidates = ref<InventoryInboundBatchCandidate[]>([]),
  selectedCandidate = ref<InventoryInboundBatchCandidate | null>(null),
  candidatesLoading = ref(false),
  candidateError = ref(''),
  candidateKeyword = ref('');
const submitting = ref(false),
  intentStatus = ref<IdempotentIntentStatus>('idle');
const intent = useIdempotentIntent('成品入库');
let pendingInbound: { batchId: string; body: CreateProductionOutputInboundPayload } | null = null;
function restartInbound(): void {
  if (submitting.value) return;
  intent.reset();
  intentStatus.value = 'idle';
  pendingInbound = null;
}
const recovery = computed(() => intentStatus.value !== 'idle');
const controlsLocked = computed(() => submitting.value || recovery.value || !!revokingOutput.value);
const selectedQuantity = computed(() =>
  selected.value.reduce((sum, item) => sum + Number(item.quantity), 0),
);
const selectedUnit = computed(() => selected.value[0]?.unit || '');
const visibleCandidates = computed(() =>
  selectedCandidate.value &&
  !candidates.value.some((item) => item.batchId === selectedCandidate.value?.batchId)
    ? [selectedCandidate.value, ...candidates.value]
    : candidates.value,
);
const candidateBasisChanged = computed(() => {
  const latest = candidates.value.find((item) => item.batchId === selectedCandidate.value?.batchId);
  return !!latest && latest.version !== selectedCandidate.value?.version;
});
const selectionConflict = computed(() => {
  if (selected.value.length > 100) return '每次最多选择100条产出，请减少本次选择。';
  if (
    selected.value.some(
      (item) => item.productionBatchId !== detail.value?.id || item.unit !== selectedUnit.value,
    )
  )
    return '本次入库须来自同一任务、同一成品及单位，请重新选择。';
  if (
    selected.value.some((item) => item.status !== 'pending_inbound' || Number(item.quantity) <= 0)
  )
    return '已选记录状态已变化，请核对后清空选择并重新选择待入库产出。';
  return '';
});
const canSubmit = computed(() => {
  if (
    submitting.value ||
    revokeSubmitting.value ||
    revokingOutput.value ||
    intentStatus.value === 'blocked' ||
    intentStatus.value === 'expired'
  )
    return false;
  if (recovery.value) return true;
  return (
    !loading.value &&
    !error.value &&
    !!detail.value &&
    selected.value.length > 0 &&
    !selectionConflict.value &&
    (targetMode.value === 'new_batch' ||
      (!!selectedCandidate.value &&
        !candidatesLoading.value &&
        !candidateError.value &&
        !candidateBasisChanged.value))
  );
});
const reads = useLatestReadRequest(() => {
  loading.value = false;
});
const candidateReads = useLatestReadRequest(() => {
  candidatesLoading.value = false;
});
async function load(): Promise<void> {
  const batchId = props.batch?.id;
  if (!props.visible || !batchId || !reads.isActive()) return;
  const read = reads.begin(() => props.visible && props.batch?.id === batchId);
  loading.value = true;
  error.value = '';
  try {
    const [batch, result] = await Promise.all([
      productionTasksApi.getBatch(batchId, { signal: read.signal, skipErrorHandling: true }),
      productionOutputsApi.list(
        { batchId, status: status.value || undefined, page: page.value, pageSize: 20 },
        { signal: read.signal, skipErrorHandling: true },
      ),
    ]);
    if (!read.isCurrent()) return;
    detail.value = batch;
    outputs.value = result.items;
    total.value = result.total;
    if (!recovery.value)
      selected.value = selected.value.map(
        (item) => result.items.find((fresh) => fresh.id === item.id) ?? item,
      );
  } catch (failure) {
    if (read.isCurrent())
      error.value = failure instanceof Error ? failure.message : '产出记录读取失败，请刷新重试';
  } finally {
    if (read.isCurrent()) loading.value = false;
  }
}
async function search(): Promise<void> {
  page.value = 1;
  await load();
}
async function changePage(value: number): Promise<void> {
  page.value = value;
  await load();
}
function isSelectable(item: ProductionOutputItem): boolean {
  return (
    !controlsLocked.value &&
    !loading.value &&
    !error.value &&
    item.status === 'pending_inbound' &&
    Number(item.quantity) > 0
  );
}
function adoptCandidate(): void {
  if (controlsLocked.value) return;
  const latest = candidates.value.find((item) => item.batchId === candidateId.value);
  if (latest) selectedCandidate.value = { ...latest };
}
function selectOutputs(items: ProductionOutputItem[]): void {
  if (!controlsLocked.value) selected.value = items;
}
function clearSelection(): void {
  tableRef.value?.clearSelection();
  selected.value = [];
}
function outputStatusType(value: ProductionOutputStatus): 'warning' | 'success' | 'info' {
  if (value === 'pending_inbound') return 'warning';
  if (value === 'inbounded') return 'success';
  return 'info';
}
function outputStatusLabel(value: ProductionOutputStatus): string {
  return PRODUCTION_OUTPUT_STATUS_LABELS[value];
}
function canRevoke(item: ProductionOutputItem): boolean {
  return (
    detail.value?.status === 'doing' &&
    (item.status === 'pending_inbound' || item.status === 'no_inbound_required')
  );
}
async function openCard(item: ProductionOutputItem): Promise<void> {
  await router.push({
    name: 'production-tracking',
    query: { batchId: item.productionBatchId, cardId: item.trackingCardId || undefined },
  });
}
async function openInbound(item: ProductionOutputItem): Promise<void> {
  if (item.inbound)
    await router.push({
      name: 'warehouse-inbound-finished',
      query: { inventoryBatchId: item.inbound.itemBatchId },
    });
}
async function loadCandidates(): Promise<void> {
  const item = selected.value[0];
  if (
    targetMode.value !== 'existing_batch' ||
    !props.visible ||
    !item ||
    !candidateReads.isActive()
  )
    return;
  const read = candidateReads.begin(
    () =>
      props.visible &&
      props.batch?.id === item.productionBatchId &&
      targetMode.value === 'existing_batch',
  );
  candidatesLoading.value = true;
  candidateError.value = '';
  try {
    const result = await productionOutputsApi.batchCandidates(
      {
        productionBatchId: item.productionBatchId,
        productId: item.productId,
        unit: item.unit,
        keyword: candidateKeyword.value.trim() || undefined,
        page: 1,
        pageSize: 50,
      },
      { signal: read.signal, skipErrorHandling: true },
    );
    if (read.isCurrent()) candidates.value = result.items;
  } catch (failure) {
    if (read.isCurrent())
      candidateError.value =
        failure instanceof Error ? failure.message : '成品批次候选读取失败，请重试';
  } finally {
    if (read.isCurrent()) candidatesLoading.value = false;
  }
}
function targetModeChanged(): void {
  if (targetMode.value === 'existing_batch') void loadCandidates();
  else candidateReads.invalidate();
}
function searchCandidates(value: string): void {
  candidateKeyword.value = value;
  void loadCandidates();
}
function candidateVisible(value: boolean): void {
  if (value && !candidates.value.length) void loadCandidates();
}
watch(candidateId, (id) => {
  selectedCandidate.value =
    candidates.value.find((item) => item.batchId === id) ??
    (selectedCandidate.value?.batchId === id ? selectedCandidate.value : null);
});
watch(selectedUnit, () => {
  candidateReads.invalidate();
  candidates.value = [];
  if (targetMode.value === 'existing_batch') void loadCandidates();
});
watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      reads.invalidate();
      candidateReads.invalidate();
      return;
    }
    detail.value = null;
    outputs.value = [];
    total.value = 0;
    page.value = 1;
    status.value = '';
    selected.value = [];
    tableRef.value?.clearSelection();
    targetMode.value = 'new_batch';
    candidateId.value = '';
    selectedCandidate.value = null;
    candidates.value = [];
    candidateError.value = '';
    candidateKeyword.value = '';
    remark.value = '';
    pendingInbound = null;
    intent.reset();
    intentStatus.value = 'idle';
    void load();
  },
);
async function submitInbound(): Promise<void> {
  if (!canSubmit.value || !reads.isActive()) return;
  if (!pendingInbound) {
    if (!detail.value) return;
    const target = selectedCandidate.value;
    if (targetMode.value === 'existing_batch' && (!target || typeof target.version !== 'number')) {
      EMessage.warning('请选择有效的成品批次并核对版本');
      return;
    }
    pendingInbound = {
      batchId: detail.value.id,
      body: {
        outputIds: selected.value.map((item) => item.id),
        target:
          targetMode.value === 'existing_batch' && target
            ? { mode: 'existing_batch', itemBatchId: target.batchId, version: target.version }
            : { mode: 'new_batch' },
        remark: remark.value.trim() || undefined,
      },
    };
  }
  const submission = pendingInbound;
  submitting.value = true;
  try {
    const result = await intent.execute(
      {
        intentType: 'production.output.inbound',
        params: { batchId: submission.batchId },
        query: {},
        body: submission.body,
      },
      (key) => productionOutputsApi.inbound(submission.batchId, submission.body, key),
    );
    EMessage.success(`成品已入库：${result.inboundNo}，批次 ${result.batchCode}`);
    intentStatus.value = 'idle';
    clearSelection();
    remark.value = '';
    pendingInbound = null;
    emit('changed', submission.batchId);
    await load();
  } catch (failure) {
    EMessage.error(failure, '成品入库失败');
  } finally {
    intentStatus.value = intent.getStatus();
    if (intentStatus.value === 'idle') pendingInbound = null;
    submitting.value = false;
  }
}
const revokingOutput = ref<ProductionOutputItem | null>(null),
  revokeReason = ref(''),
  revokeSubmitting = ref(false),
  revokeStatus = ref<IdempotentIntentStatus>('idle');
const revokeIntent = useIdempotentIntent('产出撤销');
let pendingRevoke: { outputId: string; batchId: string; reason: string } | null = null;
function restartRevoke(): void {
  if (revokeSubmitting.value) return;
  revokeIntent.reset();
  revokeStatus.value = 'idle';
  pendingRevoke = null;
}
let closeApproved = false,
  revokeCloseApproved = false;
function openRevoke(item: ProductionOutputItem): void {
  if (controlsLocked.value) return;
  revokingOutput.value = { ...item };
  revokeReason.value = '';
  pendingRevoke = null;
  revokeIntent.reset();
  revokeStatus.value = 'idle';
}
async function submitRevoke(): Promise<void> {
  const item = revokingOutput.value;
  if (
    !item ||
    revokeSubmitting.value ||
    !reads.isActive() ||
    revokeStatus.value === 'blocked' ||
    revokeStatus.value === 'expired'
  )
    return;
  if (!pendingRevoke) {
    if (!revokeReason.value.trim()) {
      EMessage.warning('请填写撤销原因');
      return;
    }
    pendingRevoke = {
      outputId: item.id,
      batchId: item.productionBatchId,
      reason: revokeReason.value.trim(),
    };
  }
  const submission = pendingRevoke;
  revokeSubmitting.value = true;
  try {
    await revokeIntent.execute(
      {
        intentType: 'production.output.revoke',
        params: { outputId: submission.outputId },
        query: {},
        body: { reason: submission.reason },
      },
      (key) => productionOutputsApi.revoke(submission.outputId, { reason: submission.reason }, key),
    );
    EMessage.success('产出已撤销，原记录和撤销原因已保留');
    revokingOutput.value = null;
    revokeReason.value = '';
    pendingRevoke = null;
    emit('changed', submission.batchId);
    await load();
  } catch (failure) {
    EMessage.error(failure, '产出撤销失败');
  } finally {
    revokeStatus.value = revokeIntent.getStatus();
    if (revokeStatus.value === 'idle') pendingRevoke = null;
    revokeSubmitting.value = false;
  }
}
async function allowRevokeClose(): Promise<boolean> {
  if (revokeSubmitting.value) return false;
  if (!revokingOutput.value || (!revokeReason.value && revokeStatus.value === 'idle')) return true;
  try {
    await RouteMessageBox.confirm(
      revokeStatus.value !== 'idle'
        ? '撤销结果尚未确认，请先核对产出记录。放弃后将不能重试本次撤销，确认放弃？'
        : '撤销原因尚未提交，确认放弃？',
      '关闭确认',
      { type: 'warning' },
    );
    revokeIntent.reset();
    revokeStatus.value = 'idle';
    return true;
  } catch {
    return false;
  }
}
async function closeRevoke(value: boolean): Promise<void> {
  if (!value && revokeCloseApproved) {
    revokeCloseApproved = false;
    revokingOutput.value = null;
    return;
  }
  if (!value && (await allowRevokeClose())) revokingOutput.value = null;
}
async function beforeRevokeClose(done: () => void): Promise<void> {
  if (await allowRevokeClose()) {
    revokeCloseApproved = true;
    done();
  }
}
async function allowClose(): Promise<boolean> {
  if (submitting.value || revokeSubmitting.value) return false;
  if (!props.visible) return true;
  if (!(await allowRevokeClose())) return false;
  if (!recovery.value && !selected.value.length && !remark.value) return true;
  try {
    await RouteMessageBox.confirm(
      recovery.value
        ? '入库结果尚未确认，请先核对产出和成品入库记录。放弃后将不能重试本次入库，确认放弃？'
        : '本次入库选择或备注尚未提交，确认放弃？',
      '关闭确认',
      { type: 'warning' },
    );
    intent.reset();
    intentStatus.value = 'idle';
    return true;
  } catch {
    return false;
  }
}
async function requestClose(value: boolean): Promise<void> {
  if (!value && closeApproved) {
    closeApproved = false;
    emit('update:visible', false);
    return;
  }
  if (!value && (await allowClose())) {
    revokingOutput.value = null;
    emit('update:visible', false);
  }
}
async function beforeClose(done: () => void): Promise<void> {
  if (await allowClose()) {
    closeApproved = true;
    revokingOutput.value = null;
    done();
  }
}
const unregister = useTabsStore().registerCloseGuard(props.routeName, allowClose);
onScopeDispose(unregister);
</script>

<style scoped>
.output-workbench {
  display: grid;
  gap: 16px;
}
.query-form .el-form-item {
  margin-bottom: 0;
}
.query-form .el-select {
  width: 160px;
}
.secondary,
.selected-records {
  margin-top: 4px;
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.record-footer,
.selection-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.inbound-form {
  display: grid;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.inbound-form .el-form-item:last-child {
  margin-bottom: 0;
}
.target-picker {
  display: flex;
  gap: 8px;
  width: 100%;
}
.target-picker .el-select {
  flex: 1;
}
.candidate-error {
  color: var(--el-color-danger);
}
</style>
