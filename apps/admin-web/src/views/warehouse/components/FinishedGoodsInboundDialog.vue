<template>
  <el-dialog
    :model-value="active && visible"
    :title="inboundId ? '成品入库详情' : '核对成品入库'"
    :width="DialogWidth.workbench"
    workbench
    :close-on-click-modal="false"
    :before-close="close"
    @update:model-value="(value: boolean) => !value && close()"
  >
    <template v-if="inboundId">
      <div v-loading="loading">
        <el-alert
          v-if="error"
          type="error"
          :title="error"
          :closable="false"
        />
        <template v-if="detail">
          <el-descriptions
            :column="3"
            border
          >
            <el-descriptions-item label="入库单">{{ detail.inboundNo }}</el-descriptions-item>
            <el-descriptions-item label="工单 / 任务"
              >{{ detail.workOrderNo }} / {{ detail.batchNo }}</el-descriptions-item
            >
            <el-descriptions-item label="成品"
              >{{ detail.productCode }} · {{ detail.productName }} ·
              {{ detail.unit }}</el-descriptions-item
            >
            <el-descriptions-item label="确认时间">{{
              formatDateTimeForDisplay(detail.inboundAt)
            }}</el-descriptions-item>
            <el-descriptions-item label="确认人">{{ detail.createdByName }}</el-descriptions-item>
            <el-descriptions-item label="备注">{{ detail.remark || '-' }}</el-descriptions-item>
          </el-descriptions>
          <el-table
            :data="detail.details"
            row-key="inboundDetailId"
            class="section"
          >
            <el-table-column
              label="授权来源"
              min-width="190"
              ><template #default="{ row }"
                >{{
                  FINISHED_GOODS_INBOUND_SOURCE_LABELS[row.sourceType as FinishedGoodsInboundSource]
                }}
                · 清单第 {{ row.revisionNo }} 版
                <div class="muted">授权 {{ row.allocationId }}</div></template
              ></el-table-column
            >
            <el-table-column
              label="实际入库"
              min-width="120"
              ><template #default="{ row }"
                >{{ formatQuantity(row.quantity) }} {{ detail.unit }}</template
              ></el-table-column
            >
            <el-table-column
              label="库存批次"
              min-width="150"
              ><template #default="{ row }"
                >{{ row.batchCode }} (#{{ row.itemBatchId }})</template
              ></el-table-column
            >
            <el-table-column
              label="批准与质检依据"
              min-width="210"
              ><template #default="{ row }"
                ><template v-if="row.approvedOutput"
                  >质检记录 {{ row.approvedOutput.inspectionRecordId }}<br />审批
                  {{ row.approvedOutput.approvalInstanceId }}</template
                ><span v-else>批准版 {{ row.outputRevisionId }}</span></template
              ></el-table-column
            >
            <el-table-column
              prop="inventoryTransactionId"
              label="库存流水"
              min-width="110"
            />
          </el-table>
        </template>
      </div>
    </template>
    <template v-else>
      <el-alert
        title="核对每份授权的本次数量和目标批次；确认后将新增实际库存记录。"
        type="info"
        :closable="false"
      />
      <div class="toolbar section">
        <strong>{{ selected[0]?.source.workOrderNo }} / {{ selected[0]?.source.batchNo }}</strong>
        <el-button
          :loading="checking"
          :disabled="command.locked.value || !selected.length"
          @click="recheck(true)"
          >重新核对已选</el-button
        >
      </div>
      <el-alert
        v-if="checkError"
        :title="checkError"
        type="error"
        :closable="false"
      />
      <el-table
        :data="selected"
        row-key="detailKey"
        class="section"
        max-height="430"
      >
        <el-table-column
          label="授权 / 成品"
          min-width="210"
          ><template #default="{ row }"
            >{{
              FINISHED_GOODS_INBOUND_SOURCE_LABELS[
                row.source.sourceType as FinishedGoodsInboundSource
              ]
            }}
            · 第 {{ row.source.revisionNo }} 版
            <div>{{ row.source.productCode }} · {{ row.source.productName }}</div>
            <div class="muted">
              授权 {{ row.source.allocationId }} · {{ row.source.unit }}
            </div></template
          ></el-table-column
        >
        <el-table-column
          label="本次入库"
          min-width="165"
          ><template #default="{ row }"
            ><el-input
              v-model="row.quantity"
              inputmode="numeric"
              :disabled="locked"
              :aria-label="`本次入库数量 ${row.source.productCode}`"
            />
            <div
              v-if="quantityErrors.get(row.detailKey)"
              class="error"
            >
              {{ quantityErrors.get(row.detailKey) }}
            </div></template
          ></el-table-column
        >
        <el-table-column
          label="目标库存批次"
          min-width="310"
          ><template #default="{ row }"
            ><InboundBatchTargetPicker
              v-model="row.target"
              item-kind="finished_product"
              :product-id="row.source.productId"
              :unit="row.source.unit"
              :identity="`${row.source.productCode} / ${row.source.productName} / ${row.source.unit}`"
              :related-new-targets="relatedNewTargetsFor(row.detailKey)"
              :new-batch-owner="isNewBatchOwnerFor(row.detailKey)"
              :disabled="locked" /></template
        ></el-table-column>
        <el-table-column
          label="调整目标"
          width="170"
          ><template #default="{ row }"
            ><InboundSplitControl
              :quantity="row.quantity"
              :disabled="locked || selected.length >= 100"
              @split="(quantity) => split(row.detailKey, quantity)"
            /><el-button
              link
              type="danger"
              :disabled="locked"
              @click="remove(row.detailKey)"
              >移除此目标</el-button
            ></template
          ></el-table-column
        >
      </el-table>
      <div
        v-if="groupSummaries.length"
        class="allocation-review"
      >
        <strong
          >本次核对 · {{ groupSummaries.length }} 份授权 · {{ selected.length }} 条目标明细</strong
        >
        <div
          v-for="group in groupSummaries"
          :key="group.source.allocationId"
          class="allocation-line"
          :class="{ error: !group.valid || group.after < 0 }"
        >
          <span
            >{{ FINISHED_GOODS_INBOUND_SOURCE_LABELS[group.source.sourceType] }} ·
            {{ group.source.productCode }} · 第 {{ group.source.revisionNo }} 版</span
          >
          <span
            >批准 {{ formatQuantity(group.source.authorizedQuantity) }} / 历史已入
            {{ formatQuantity(group.source.receivedQuantity) }} / 可入
            {{ formatQuantity(group.allowance) }} {{ group.source.unit }}</span
          >
          <strong
            >本次合计 {{ group.valid ? formatQuantity(group.total) : '待修正' }}
            {{ group.source.unit }} · 本次后剩余
            {{ group.valid && group.after >= 0 ? formatQuantity(group.after) : '待修正' }}
            {{ group.source.unit }}</strong
          >
        </div>
        <details class="receipt-preview">
          <summary>预览本次入库明细</summary>
          <div
            v-for="row in selected"
            :key="row.detailKey"
            class="receipt-line"
          >
            {{ FINISHED_GOODS_INBOUND_SOURCE_LABELS[row.source.sourceType] }} · 清单第
            {{ row.source.revisionNo }} 版 · {{ row.source.productCode }} · {{ targetLabel(row) }} ·
            {{ row.quantity || '待填' }} {{ row.source.unit }}
          </div>
        </details>
      </div>
      <el-input
        v-model="remark"
        class="section"
        type="textarea"
        :rows="2"
        maxlength="2000"
        placeholder="入库备注（可选）"
        :disabled="locked"
      />
      <el-alert
        v-if="command.status.value !== 'idle'"
        class="section"
        title="确认结果未知：已保留原授权、数量、目标批次和幂等键。请核对记录后按原操作重试。"
        type="warning"
        :closable="false"
      />
    </template>
    <template #footer>
      <el-button
        :disabled="checking || command.busy.value"
        @click="close"
        >关闭</el-button
      >
      <template v-if="!inboundId">
        <el-button
          v-if="command.status.value === 'pending'"
          type="primary"
          :loading="command.busy.value"
          @click="command.retry"
          >按原操作重试</el-button
        >
        <el-button
          v-else
          type="primary"
          :loading="command.busy.value"
          :disabled="locked || !canSubmit"
          @click="confirm"
          >确认实际入库</el-button
        >
      </template>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onActivated, onDeactivated, ref, watch } from 'vue';
import type {
  FinishedGoodsInboundCandidate,
  FinishedGoodsInboundOrderDetail,
  FinishedGoodsInboundSource,
  ConfirmFinishedGoodsInboundPayload,
  FinishedGoodsInboundCommandResult,
} from '@company/contracts';
import { FINISHED_GOODS_INBOUND_SOURCE_LABELS } from '@company/constants';
import { productionApi } from '../../../api/production';
import { useProcurementCommand } from '../../procurement/composables/useProcurementCommand';
import { EMessage } from '../../../utils/message';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { formatQuantity } from '../../production/production-status';
import { parseInboundQuantity } from '../inbound-quantity';
import type { FinishedInboundSelection } from '../finished-inbound-selection';
import InboundBatchTargetPicker from './InboundBatchTargetPicker.vue';
import InboundSplitControl from './InboundSplitControl.vue';

defineOptions({ name: 'FinishedGoodsInboundDialog' });
const props = defineProps<{ visible: boolean; inboundId: string | null; active: boolean }>();
const selected = defineModel<FinishedInboundSelection[]>('selected', { required: true });
const emit = defineEmits<{ 'update:visible': [value: boolean]; changed: [inboundId: string] }>();
const detail = ref<FinishedGoodsInboundOrderDetail | null>(null);
const remark = ref('');
const loading = ref(false);
const checking = ref(false);
const error = ref('');
const checkError = ref('');
let requestNo = 0;
let checkNo = 0;
let pageActive = true;
let discarding = false;
const command = useProcurementCommand<FinishedGoodsInboundCommandResult>((result) => {
  selected.value = [];
  remark.value = '';
  emit('changed', result.inboundId);
}, '成品入库');
const locked = computed(() => command.locked.value || checking.value);
const groupSummaries = computed(() => {
  const groups = new Map<
    string,
    { source: FinishedGoodsInboundCandidate; total: number; valid: boolean }
  >();
  for (const row of selected.value) {
    const group = groups.get(row.source.allocationId) ?? {
      source: row.source,
      total: 0,
      valid: true,
    };
    const quantity = parseInboundQuantity(row.quantity);
    group.source = row.source;
    if (quantity === null) group.valid = false;
    else group.total += quantity;
    groups.set(row.source.allocationId, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    allowance: Number(group.source.remainingQuantity),
    after: Number(group.source.remainingQuantity) - group.total,
  }));
});
const quantityErrors = computed(() => {
  const errors = new Map<string, string>();
  for (const row of selected.value) {
    if (parseInboundQuantity(row.quantity) === null)
      errors.set(row.detailKey, '请输入 1～99999999 的正整数');
    else if (row.target.mode === 'existing' && !row.target.batchId)
      errors.set(row.detailKey, '请选择已有批次');
    else if (row.target.mode === 'new' && !row.target.clientKey)
      errors.set(row.detailKey, '请选择本次复用的新批次');
  }
  for (const group of groupSummaries.value) {
    if (group.total > group.allowance) {
      for (const row of selected.value.filter(
        (item) => item.source.allocationId === group.source.allocationId,
      ))
        errors.set(row.detailKey, '本次合计超过该授权剩余额度');
    }
  }
  return errors;
});
const canSubmit = computed(
  () =>
    selected.value.length > 0 &&
    !quantityErrors.value.size &&
    selected.value.every((row) => row.source.canConfirm),
);

async function loadDetail(): Promise<void> {
  if (!pageActive || !props.visible || !props.active || !props.inboundId) return;
  const current = ++requestNo;
  const id = props.inboundId;
  loading.value = true;
  error.value = '';
  try {
    const data = await productionApi.getFinishedGoodsInbound(id);
    if (current === requestNo && props.inboundId === id && props.active) detail.value = data;
  } catch (failure) {
    if (current === requestNo && props.inboundId === id && props.active) {
      error.value = '入库详情加载失败';
      EMessage.error(failure);
    }
  } finally {
    if (current === requestNo) loading.value = false;
  }
}
function relatedNewTargetsFor(detailKey: string): Array<{ clientKey: string; label: string }> {
  const current = selected.value.find((item) => item.detailKey === detailKey);
  if (!current) return [];
  return selected.value.flatMap((item, index) =>
    item.detailKey !== detailKey &&
    item.source.productId === current.source.productId &&
    item.source.unit === current.source.unit &&
    item.target.mode === 'new' &&
    item.target.clientKey
      ? [
          {
            clientKey: item.target.clientKey,
            label: `${item.source.batchNo} · ${item.source.productCode} · 第 ${index + 1} 条目标`,
          },
        ]
      : [],
  );
}
function isNewBatchOwnerFor(detailKey: string): boolean {
  const row = selected.value.find((item) => item.detailKey === detailKey);
  if (!row || row.target.mode !== 'new') return false;
  const clientKey = row.target.clientKey;
  return (
    selected.value.find((item) => item.target.mode === 'new' && item.target.clientKey === clientKey)
      ?.detailKey === detailKey
  );
}
function targetLabel(row: FinishedInboundSelection): string {
  if (row.target.mode === 'existing') return `已有批次 #${row.target.batchId || '待选'}`;
  return `${isNewBatchOwnerFor(row.detailKey) ? '新建批次' : '复用本次新批次'} · 系统生成批号`;
}
function remove(detailKey: string): void {
  if (!locked.value) selected.value = selected.value.filter((item) => item.detailKey !== detailKey);
}
function split(detailKey: string, splitQuantity: number): void {
  if (locked.value || selected.value.length >= 100) return;
  const item = selected.value.find((row) => row.detailKey === detailKey);
  const originalQuantity = item ? parseInboundQuantity(item.quantity) : null;
  if (!item || originalQuantity === null || splitQuantity < 1 || splitQuantity >= originalQuantity)
    return;
  item.quantity = String(originalQuantity - splitQuantity);
  selected.value.push({
    detailKey: crypto.randomUUID(),
    source: { ...item.source },
    quantity: String(splitQuantity),
    target: { mode: 'new', clientKey: crypto.randomUUID() },
  });
}
function sameBasis(
  left: FinishedGoodsInboundCandidate,
  right: FinishedGoodsInboundCandidate,
): boolean {
  return (
    left.productionBatchId === right.productionBatchId &&
    left.productId === right.productId &&
    left.sourceType === right.sourceType &&
    left.outputRevisionId === right.outputRevisionId &&
    left.remainingQuantity === right.remainingQuantity &&
    left.authorizedQuantity === right.authorizedQuantity &&
    left.receivedQuantity === right.receivedQuantity
  );
}
function selectionSignature(): string {
  return selected.value.map((row) => `${row.detailKey}:${row.source.allocationId}`).join('|');
}
async function recheck(adopt: boolean): Promise<boolean> {
  if (
    !pageActive ||
    !selected.value.length ||
    locked.value ||
    !props.active ||
    !props.visible ||
    props.inboundId
  )
    return false;
  const current = ++checkNo;
  const signature = selectionSignature();
  const isCurrent = () =>
    current === checkNo &&
    signature === selectionSignature() &&
    props.active &&
    props.visible &&
    !props.inboundId;
  const ids = new Set(selected.value.map((row) => row.source.allocationId));
  const latest = new Map<string, FinishedGoodsInboundCandidate>();
  checking.value = true;
  checkError.value = '';
  try {
    let page = 1;
    let total = Infinity;
    while (ids.size && (page - 1) * 100 < total) {
      const result = await productionApi.finishedGoodsInboundCandidates({
        keyword: selected.value[0]!.source.batchNo,
        page,
        pageSize: 100,
      });
      if (!isCurrent()) return false;
      total = result.total;
      for (const candidate of result.items)
        if (ids.delete(candidate.allocationId)) latest.set(candidate.allocationId, candidate);
      if (!result.items.length) break;
      page++;
    }
    for (const item of selected.value) {
      const currentSource = latest.get(item.source.allocationId);
      if (!currentSource || !currentSource.canConfirm) {
        checkError.value = '有授权已失效，请移除该授权后重新选择';
        return false;
      }
      if (!sameBasis(item.source, currentSource)) {
        if (!adopt) {
          checkError.value = '授权版本或余量已变化，请明确重新核对';
          return false;
        }
        item.source = { ...currentSource };
      }
    }
    return canSubmit.value;
  } catch (failure) {
    if (isCurrent()) {
      checkError.value = '授权重新核对失败';
      EMessage.error(failure);
    }
    return false;
  } finally {
    if (current === checkNo) checking.value = false;
  }
}
async function confirm(): Promise<void> {
  if (locked.value || !canSubmit.value || !(await recheck(false))) return;
  const source = selected.value[0]?.source;
  if (!source) return;
  const body: ConfirmFinishedGoodsInboundPayload = {
    productionBatchId: source.productionBatchId,
    details: selected.value.map((item) => ({
      detailKey: item.detailKey,
      allocationId: item.source.allocationId,
      revisionId: item.source.outputRevisionId,
      quantity: Number(item.quantity),
      target: item.target,
    })),
    remark: remark.value.trim() || null,
  };
  await command.run(
    { intentType: 'production.finished-inbound.confirm', params: {}, query: {}, body },
    (key) => productionApi.confirmFinishedGoodsInbound(body, key),
    '成品入库已确认',
  );
}
async function discardDraft(): Promise<boolean> {
  if (discarding || checking.value) return false;
  discarding = true;
  try {
    if (!(await command.canClose(!!selected.value.length || !!remark.value))) return false;
    requestNo++;
    checkNo++;
    selected.value = [];
    detail.value = null;
    remark.value = '';
    error.value = '';
    checkError.value = '';
    emit('update:visible', false);
    return true;
  } finally {
    discarding = false;
  }
}
async function close(): Promise<boolean> {
  if (checking.value || command.busy.value) return false;
  if (command.status.value !== 'idle') return discardDraft();
  requestNo++;
  detail.value = null;
  error.value = '';
  emit('update:visible', false);
  return true;
}
function prepareTargetSwitch(): Promise<boolean> {
  return discardDraft();
}
function currentInboundId(): string | null {
  return props.inboundId;
}
function isLocked(): boolean {
  return locked.value;
}
function hasDraft(): boolean {
  return !!selected.value.length || !!remark.value || command.status.value !== 'idle';
}
let refreshQueued = false;
function refreshOpenedContext(): void {
  if (refreshQueued) return;
  refreshQueued = true;
  queueMicrotask(() => {
    refreshQueued = false;
    if (!pageActive || !props.visible || !props.active) return;
    if (props.inboundId) void loadDetail();
    else if (selected.value.length && !command.locked.value) void recheck(false);
  });
}
function invalidateOpenedReads(): void {
  requestNo++;
  checkNo++;
  loading.value = false;
  checking.value = false;
}
watch(
  () => [props.visible, props.inboundId] as const,
  () => {
    invalidateOpenedReads();
    detail.value = null;
    error.value = '';
    refreshOpenedContext();
  },
  { immediate: true },
);
watch(
  () => props.active,
  (active) => {
    if (!active) {
      invalidateOpenedReads();
    } else refreshOpenedContext();
  },
);
let activated = false;
onActivated(() => {
  pageActive = true;
  if (activated) refreshOpenedContext();
  activated = true;
});
onDeactivated(() => {
  pageActive = false;
  invalidateOpenedReads();
});
defineExpose({ prepareTargetSwitch, discardDraft, close, currentInboundId, isLocked, hasDraft });
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.section {
  margin-top: 14px;
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.error {
  color: var(--el-color-danger);
  font-size: 12px;
}
.allocation-review {
  padding: 14px 4px;
  border-top: 1px solid var(--el-border-color);
}
.allocation-line {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.receipt-preview {
  margin-top: 10px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.receipt-preview summary {
  color: var(--el-color-primary);
  cursor: pointer;
}
.receipt-line {
  padding: 5px 0;
}
</style>
