<template>
  <el-dialog
    v-model="visible"
    :title="`到货详情${detail ? ` · ${detail.receiptNo}` : ''}`"
    :width="DialogWidth.workbench"
    workbench
    :before-close="beforeClose"
    :close-on-click-modal="false"
  >
    <div v-loading="loading">
      <el-alert
        v-if="readError"
        title="详情刷新失败，请刷新后再办理；旧内容只供核对。"
        type="error"
        :closable="false"
        class="notice"
      />
      <template v-if="detail">
        <el-descriptions
          :column="3"
          border
          size="small"
          class="receipt-header"
          ><el-descriptions-item label="采购单">{{ detail.purchaseNo }}</el-descriptions-item
          ><el-descriptions-item label="供应商">{{
            supplierSummary(detail.suppliers)
          }}</el-descriptions-item
          ><el-descriptions-item label="实际到货时间">{{
            formatDateTimeForDisplay(detail.receivedAt)
          }}</el-descriptions-item
          ><el-descriptions-item
            label="交接凭据"
            :span="detail.remark ? 2 : 3"
            ><span
              class="header-evidence"
              :title="detail.handoverEvidence"
              >{{ detail.handoverEvidence }}</span
            ></el-descriptions-item
          ><el-descriptions-item
            v-if="detail.remark"
            label="备注"
            >{{ detail.remark }}</el-descriptions-item
          ></el-descriptions
        >
        <div class="receipt-workbench">
          <nav
            class="receipt-index"
            aria-label="到货明细"
          >
            <div class="index-heading">
              <strong>到货明细 · {{ detail.items.length }} 条</strong>
              <span v-if="lineSearch">匹配 {{ filteredLines.length }} 条</span>
            </div>
            <el-input
              v-model="lineSearch"
              clearable
              aria-label="筛选本单物料"
              placeholder="物料 / 编码 / 版本 / 批号"
            />
            <p
              v-if="lineSearch && !filteredLines.some((line) => line.id === activeLine)"
              class="index-note"
            >
              当前选中明细不在筛选结果中，右侧仍保留该明细。
            </p>
            <div class="index-list">
              <button
                v-for="line in filteredLines"
                :key="line.id"
                type="button"
                class="receipt-index-item"
                :class="{ active: activeLine === line.id }"
                :aria-current="activeLine === line.id ? 'true' : undefined"
                @click="selectLine(line.id)"
              >
                <span class="line-identity">{{ line.lineNo }}. {{ line.itemName }}</span>
                <span class="line-version"
                  >{{ line.itemCode }} · {{ line.materialVariantCode }}</span
                >
                <span class="line-version"
                  >供应商批号 {{ line.supplierBatchCode || '未提供' }}</span
                >
                <el-tag
                  size="small"
                  :type="receiptLineStageType(line)"
                  :effect="receiptLineStageEffect(line)"
                >
                  {{ receiptLineStageLabel(line) }}
                </el-tag>
              </button>
              <p
                v-if="!filteredLines.length"
                class="index-note"
              >
                本单无匹配明细，请调整筛选词。
              </p>
            </div>
          </nav>
          <section
            v-if="selectedLine"
            class="receipt-current"
          >
            <div class="selected-source">
              <strong>到货 {{ detail.receiptNo }} · 第 {{ selectedLine.lineNo }} 行</strong>
            </div>
            <ReceiptLineSummary :line="selectedLine" />
            <div class="work-section">
              <div class="section-heading">
                <strong>当前办理</strong>
                <span
                  >第 {{ selectedLine.currentRound.roundNo }} 轮 ·
                  {{ receiptLineStageLabel(selectedLine) }}</span
                >
              </div>
              <div
                v-if="isKnownZero(selectedLine.quantities.unprocessedQuantity)"
                class="done-message"
              >
                <span>{{
                  isKnownZero(selectedLine.quantities.receivedQuantity)
                    ? '本批核实总量为零，当前无剩余实物。'
                    : '当前核实量已全部入库或退回。'
                }}</span>
                <div class="done-actions">
                  <el-button
                    v-if="
                      selectedLine.currentRound.status === 'finalized' &&
                      selectedLine.currentRound.inspectionId &&
                      !isReceiptRejected(selectedLine)
                    "
                    disabled
                    >更正整批正式分配</el-button
                  >
                  <el-button
                    type="primary"
                    :disabled="blocked"
                    @click="actionDialog?.open(selectedLine, 'correct')"
                    >更正实收</el-button
                  >
                </div>
              </div>
              <InlineHint
                v-if="isKnownZero(selectedLine.quantities.unprocessedQuantity)"
                class="done-hint"
              >
                当前无未处置量，不能直接更正正式分配；同批总量录入有误时先更正实收，新增剩余须重新检验、定稿，已入与已退事实保留。
              </InlineHint>
              <div
                v-else
                class="current-actions"
              >
                <template
                  v-if="
                    [
                      'uninspected',
                      'reviewing',
                      'reinspection_required',
                      'quality_rejected',
                    ].includes(selectedLine.currentRound.status) && !isReceiptRejected(selectedLine)
                  "
                >
                  <span
                    >下一步：{{
                      selectedLine.currentRound.status === 'reviewing'
                        ? '继续本轮来料检验'
                        : '办理来料检验或复检'
                    }}</span
                  >
                  <el-button
                    v-if="auth.can(PERMISSIONS.quality.inboundInspections.view)"
                    type="primary"
                    :disabled="blocked"
                    @click="goQuality(selectedLine.id)"
                    >前往来料检验</el-button
                  >
                  <span
                    v-else
                    class="action-note"
                    >请由具备来料检验权限的人员办理</span
                  >
                </template>
                <template v-else-if="selectedLine.currentRound.status === 'awaiting_acceptance'">
                  <span>下一步：核对整批数量与正式去向</span>
                  <el-button
                    type="primary"
                    :disabled="blocked || !canAcceptReceipt(selectedLine)"
                    @click="acceptanceDialog?.open(selectedLine)"
                    >核对整批定稿</el-button
                  >
                  <span
                    v-if="!canAcceptReceipt(selectedLine)"
                    class="action-note"
                    >当前缺少可引用的检验放行依据</span
                  >
                </template>
                <template v-else-if="isReceiptRejected(selectedLine)">
                  <span>当前为人工拒收。</span>
                </template>
                <template v-else-if="Number(selectedLine.quantities.pendingInboundQuantity) > 0">
                  <span
                    >当前可入
                    <strong
                      >{{ Number(selectedLine.quantities.pendingInboundQuantity) }}
                      {{ selectedLine.unit }}</strong
                    >，按有效分配办理实际入库</span
                  >
                  <el-button
                    v-if="auth.can(PERMISSIONS.production.inbounds.view)"
                    type="primary"
                    :disabled="blocked"
                    @click="goInbound(selectedLine.id)"
                    >办理入库</el-button
                  >
                  <span
                    v-else
                    class="action-note"
                    >请由具备入库权限的人员办理</span
                  >
                </template>
                <template v-else-if="Number(selectedLine.quantities.pendingReturnQuantity) === 0">
                  <span>当前仍有待处理份额，请核对正式去向。</span>
                  <el-button
                    v-if="canAcceptReceipt(selectedLine)"
                    type="primary"
                    :disabled="blocked"
                    @click="acceptanceDialog?.open(selectedLine)"
                    >更正整批正式分配</el-button
                  >
                </template>
                <InlineHint
                  v-if="
                    selectedLine.currentRound.status === 'finalized' &&
                    Number(selectedLine.quantities.pendingReturnQuantity) > 0
                  "
                  tone="warning"
                  class="return-hint"
                >
                  当前待退
                  <strong
                    >{{ Number(selectedLine.quantities.pendingReturnQuantity) }}
                    {{ selectedLine.unit }}</strong
                  >；在下方选择具体有效分配，核对交接凭据后确认全部余量。
                  <el-button
                    link
                    type="primary"
                    :disabled="blocked"
                    @click="focusAllocations"
                    >查看待退分配</el-button
                  >
                </InlineHint>
              </div>
              <div
                ref="allocationsSection"
                class="allocations-section"
                tabindex="-1"
              >
                <InlineHint
                  v-if="allocationFocused"
                  class="allocation-focus-hint"
                >
                  请在本轮有效待退分配中选择具体范围；打开交接表单前不会提交退回。
                </InlineHint>
                <ReceiptLineAllocations
                  :line="selectedLine"
                  :quality="false"
                  :disabled="blocked"
                  @return="actionDialog?.open(selectedLine, 'return', $event)"
                  @inbound="goInbound(selectedLine.id)"
                  @history="history?.open(selectedLine.id, $event, selectedLine)"
                />
              </div>
            </div>
            <div
              v-if="!isKnownZero(selectedLine.quantities.unprocessedQuantity)"
              class="secondary-section"
            >
              <div class="section-heading"><strong>异常处置与采购承接</strong></div>
              <div class="section-actions">
                <el-button
                  v-if="
                    auth.can(PERMISSIONS.quality.inboundInspections.view) &&
                    canReviewReceipt(selectedLine)
                  "
                  :disabled="blocked"
                  @click="goQuality(selectedLine.id)"
                  >来料检验 / 复检</el-button
                >
                <el-button
                  :disabled="blocked"
                  @click="actionDialog?.open(selectedLine, 'correct')"
                  >更正实收</el-button
                >
                <el-button
                  type="danger"
                  plain
                  :disabled="blocked || !canRejectReceipt(selectedLine)"
                  @click="actionDialog?.open(selectedLine, 'reject')"
                  >人工拒收</el-button
                >
                <el-button
                  v-if="canRevokeReceiptRejection(selectedLine)"
                  :disabled="blocked"
                  @click="actionDialog?.open(selectedLine, 'revoke')"
                  >撤销拒收并重新办理</el-button
                >
                <el-button
                  v-if="
                    selectedLine.currentRound.status === 'finalized' &&
                    canAcceptReceipt(selectedLine)
                  "
                  :disabled="blocked"
                  @click="acceptanceDialog?.open(selectedLine)"
                  >更正整批正式分配</el-button
                >
                <el-button
                  v-if="
                    auth.can(PERMISSIONS.procurement.orders.view) &&
                    Number(selectedLine.quantities.unprocessedQuantity) > 0
                  "
                  :disabled="blocked"
                  @click="goExcessSupplement(selectedLine)"
                  >前往采购办理超量补单</el-button
                >
              </div>
            </div>
            <div
              v-if="qualityReturnAllocations(selectedLine).length"
              class="secondary-section"
            >
              <div class="section-heading"><strong>质量退回与补发</strong></div>
              <div class="section-actions">
                <span
                  >当前有效质量待退分配
                  {{ qualityReturnAllocations(selectedLine).length }}
                  条；原货实际退回独立办理。</span
                >
                <el-dropdown
                  v-if="auth.can(PERMISSIONS.procurement.orders.view)"
                  :disabled="blocked"
                  @command="goQualityReplacement(selectedLine, $event)"
                >
                  <el-button :disabled="blocked">前往采购办理质量补发</el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item
                        v-for="range in qualityReturnAllocations(selectedLine)"
                        :key="range.id"
                        :command="range"
                        >质量待退 {{ range.remainingQuantity }} {{ selectedLine.unit }} · 分配
                        {{ range.id }}</el-dropdown-item
                      >
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </div>
            <div class="secondary-section">
              <div class="section-heading"><strong>历史与依据</strong></div>
              <div class="section-actions">
                <el-button @click="history?.open(selectedLine.id, 'rounds', selectedLine)"
                  >处理轮次 {{ selectedLine.historyTotals.rounds }}</el-button
                >
                <el-button @click="history?.open(selectedLine.id, 'revisions', selectedLine)"
                  >实收修订 {{ selectedLine.historyTotals.revisions }}</el-button
                >
                <el-button @click="history?.open(selectedLine.id, 'cases', selectedLine)"
                  >检验历史 {{ selectedLine.historyTotals.cases }}</el-button
                >
                <el-button @click="history?.open(selectedLine.id, 'acceptances', selectedLine)"
                  >正式清单 {{ selectedLine.historyTotals.acceptances }}</el-button
                >
                <el-button @click="history?.open(selectedLine.id, 'returns', selectedLine)"
                  >退回记录 {{ selectedLine.historyTotals.returns }}</el-button
                >
                <el-button @click="history?.open(selectedLine.id, 'inbounds', selectedLine)"
                  >入库记录 {{ selectedLine.historyTotals.inbounds }}</el-button
                >
              </div>
              <div class="batch-trace">
                已入库存批次：{{
                  selectedLine.batches.length
                    ? selectedLine.batches.map((batch) => batch.batchCode).join('、')
                    : isKnownZero(selectedLine.quantities.inboundQuantity)
                      ? '暂无实际入库'
                      : '批次待核对'
                }}
              </div>
            </div>
          </section>
        </div>
      </template>
    </div>
    <template #footer
      ><el-button
        :disabled="loading || childOpen"
        @click="load"
        >刷新</el-button
      ><el-button @click="close">关闭</el-button></template
    >
  </el-dialog>
  <ReceiptLineActionDialog
    ref="actionDialog"
    @saved="saved"
  />
  <ReceiptHistoryDialog ref="history" />
  <ReceiptAcceptanceDialog
    ref="acceptanceDialog"
    @saved="saved"
  />
</template>
<script setup lang="ts">
import { supplierSummary } from '../supplier-summary';
import {
  canAcceptReceipt,
  canRejectReceipt,
  canRevokeReceiptRejection,
  canReviewReceipt,
  canExecuteReceiptAllocation,
  isReceiptRejected,
  receiptLineStageLabel,
  receiptLineStageType,
  receiptLineStageEffect,
  type ReceiptDetailIntent,
} from '../receipt-round-presentation';
import { computed, nextTick, onActivated, ref } from 'vue';
import { useRouter } from 'vue-router';
import type {
  ProcurementReceiptDetail,
  ProcurementReceiptLine,
  ReceiptAllocationItem,
} from '@company/contracts';
import { PERMISSIONS } from '@company/constants';
import { procurementApi } from '../../../api/procurement';
import { useAuthStore } from '../../../stores/auth';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { EMessage } from '../../../utils/message';
import InlineHint from '../../../components/InlineHint.vue';
import ReceiptLineSummary from './ReceiptLineSummary.vue';
import ReceiptAcceptanceDialog from './ReceiptAcceptanceDialog.vue';
import ReceiptLineAllocations from './ReceiptLineAllocations.vue';
import ReceiptLineActionDialog from './ReceiptLineActionDialog.vue';
import ReceiptHistoryDialog from './ReceiptHistoryDialog.vue';
const emit = defineEmits<{ changed: [] }>();
const auth = useAuthStore(),
  router = useRouter();
const visible = ref(false),
  id = ref(''),
  activeLine = ref(''),
  lineSearch = ref(''),
  allocationFocused = ref(false),
  loading = ref(false),
  readError = ref(false);
const detail = ref<ProcurementReceiptDetail | null>(null);
const selectedLine = computed(() =>
  detail.value?.items.find((line) => line.id === activeLine.value),
);
const filteredLines = computed(() => {
  const query = lineSearch.value.trim().toLocaleLowerCase();
  if (!query) return detail.value?.items ?? [];
  return (detail.value?.items ?? []).filter((line) =>
    [line.itemName, line.itemCode, line.materialVariantCode, line.supplierBatchCode ?? ''].some(
      (value) => value.toLocaleLowerCase().includes(query),
    ),
  );
});
const qualityReturnAllocations = (line: ProcurementReceiptLine): ReceiptAllocationItem[] =>
  line.allocations.filter(
    (row) =>
      row.disposition === 'return' &&
      row.returnReason === 'quality' &&
      Number(row.remainingQuantity) > 0,
  );
const acceptanceDialog = ref<InstanceType<typeof ReceiptAcceptanceDialog>>();
const actionDialog = ref<InstanceType<typeof ReceiptLineActionDialog>>(),
  history = ref<InstanceType<typeof ReceiptHistoryDialog>>();
const allocationsSection = ref<HTMLElement | null>(null);
const isKnownZero = (value: string): boolean => value.trim() !== '' && Number(value) === 0;
const read = useLatestReadRequest(() => {
  loading.value = false;
});
const childOpen = computed(() =>
  Boolean(actionDialog.value?.visible || acceptanceDialog.value?.visible || history.value?.visible),
);
const blocked = computed(() => loading.value || readError.value || childOpen.value);
const selectLine = (lineId: string): void => {
  if (lineId === activeLine.value || loading.value || childOpen.value) return;
  activeLine.value = lineId;
  allocationFocused.value = false;
};
const focusAllocations = async (): Promise<void> => {
  if (!selectedLine.value || blocked.value) return;
  allocationFocused.value = true;
  await nextTick();
  allocationsSection.value?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  allocationsSection.value?.focus({ preventScroll: true });
};
const load = async (): Promise<ProcurementReceiptDetail | null> => {
  if (!visible.value || !read.isActive()) return null;
  const target = id.value;
  const current = read.begin(() => visible.value && id.value === target);
  loading.value = true;
  try {
    const result = await procurementApi.getReceipt(target, current.signal);
    if (!current.isCurrent()) return null;
    detail.value = result;
    readError.value = false;
    if (!result.items.some((line) => line.id === activeLine.value))
      activeLine.value = result.items[0]?.id ?? '';
    return result;
  } catch (error) {
    if (current.isCurrent()) {
      readError.value = true;
      EMessage.error(error, '到货详情加载失败');
    }
    return null;
  } finally {
    if (current.isCurrent()) loading.value = false;
  }
};
let openSequence = 0;
const open = async (
  target: string,
  lineId?: string,
  intent?: ReceiptDetailIntent,
): Promise<boolean> => {
  if (visible.value && !(await close())) return false;
  const sequence = ++openSequence;
  id.value = target;
  activeLine.value = lineId ?? '';
  lineSearch.value = '';
  allocationFocused.value = false;
  detail.value = null;
  readError.value = false;
  visible.value = true;
  const loadedDetail = await load();
  if (
    sequence !== openSequence ||
    !visible.value ||
    id.value !== target ||
    loading.value ||
    readError.value ||
    !loadedDetail ||
    loadedDetail.id !== target
  )
    return false;
  if (lineId && !loadedDetail.items.some((line) => line.id === lineId)) {
    EMessage.warning('指定到货明细已不在该到货单中，请重新核对来源');
    await close();
    return false;
  }
  if (!intent) return true;
  const line = selectedLine.value;
  if (!lineId || !line || line.id !== lineId) {
    EMessage.warning('指定到货明细已不在最新详情中，请重新选择');
    return false;
  }
  if (blocked.value) return false;
  if (intent === 'acceptance') {
    if (canAcceptReceipt(line)) acceptanceDialog.value?.open(line);
    else EMessage.warning('该明细当前不具备整批定稿资格，请核对最新阶段');
  } else if (intent === 'correct') {
    actionDialog.value?.open(line, 'correct');
  } else if (intent === 'reject') {
    if (canRejectReceipt(line)) actionDialog.value?.open(line, 'reject');
    else EMessage.warning('该明细当前不能人工拒收，请核对最新剩余量和阶段');
  } else if (intent === 'revoke') {
    if (canRevokeReceiptRejection(line)) actionDialog.value?.open(line, 'revoke');
    else EMessage.warning('该明细当前不能撤销拒收，请核对最新拒收轮次');
  } else if (intent === 'allocations') {
    if (
      line.allocations.some(
        (row) => row.disposition === 'return' && canExecuteReceiptAllocation(line, row),
      )
    )
      await focusAllocations();
    else EMessage.warning('该明细当前没有可执行的待退分配，请核对最新处置记录');
  } else if (intent === 'history') {
    await history.value?.open(line.id, 'rounds', line);
  }
  return true;
};
const close = async (): Promise<boolean> => {
  if (actionDialog.value?.locked || history.value?.locked || acceptanceDialog.value?.locked) {
    EMessage.warning('请先确认当前处置结果');
    return false;
  }
  if (acceptanceDialog.value?.visible && !(await acceptanceDialog.value.close())) return false;
  if (actionDialog.value?.visible && !(await actionDialog.value.close())) return false;
  if (history.value?.visible && !(await history.value.close())) return false;
  visible.value = false;
  openSequence += 1;
  read.invalidate();
  return true;
};
const saved = async (): Promise<void> => {
  emit('changed');
  await load();
};
const goQualityReplacement = async (
  line: ProcurementReceiptLine,
  scope: ReceiptAllocationItem,
): Promise<void> => {
  if (blocked.value || scope.disposition !== 'return' || scope.returnReason !== 'quality') return;
  if (await close())
    await router.push({
      name: 'procurement-orders',
      query: {
        purchaseOrderId: line.purchaseOrderId,
        supplementLineId: line.purchaseOrderLineId,
        supplementReason: 'quality_replacement',
        receiptLineId: line.id,
        allocationId: scope.id,
      },
    });
};
const goQuality = async (lineId: string): Promise<void> => {
  if (await close())
    await router.push({ name: 'quality-inbound-inspections', query: { receiptLineId: lineId } });
};
const goExcessSupplement = async (line: ProcurementReceiptLine): Promise<void> => {
  if (await close())
    await router.push({
      name: 'procurement-orders',
      query: {
        purchaseOrderId: line.purchaseOrderId,
        supplementLineId: line.purchaseOrderLineId,
        supplementReason: 'excess_purchase',
        receiptLineId: line.id,
      },
    });
};
const goInbound = async (lineId: string): Promise<void> => {
  if (await close())
    await router.push({
      name: 'warehouse-inbound',
      query: { sourceType: 'purchased', receiptLineId: lineId },
    });
};
const beforeClose = (): void => {
  void close();
};
onActivated(() => {
  if (visible.value && !loading.value && !childOpen.value) void load();
});
defineExpose({
  open,
  close,
  visible,
  openedReceiptId: computed(() => (visible.value ? id.value : '')),
  openedLineId: computed(() => (visible.value ? activeLine.value : '')),
  locked: computed(() =>
    Boolean(actionDialog.value?.locked || history.value?.locked || acceptanceDialog.value?.locked),
  ),
});
</script>
<style scoped>
.notice {
  margin-bottom: 16px;
}
.receipt-header :deep(.el-descriptions__cell) {
  vertical-align: top;
}
.header-evidence {
  display: block;
  max-height: 48px;
  overflow-y: auto;
  overflow-wrap: anywhere;
}
.receipt-workbench {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-top: 16px;
}
.receipt-index {
  display: flex;
  flex: 0 0 235px;
  flex-direction: column;
  gap: 8px;
  max-height: 620px;
  min-width: 0;
  padding-right: 8px;
  border-right: 1px solid var(--el-border-color-lighter);
}
.index-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.index-heading span,
.index-note {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.index-note {
  margin: 0;
}
.index-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  overflow-y: auto;
}
.receipt-index-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  width: 100%;
  padding: 8px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
  color: var(--el-text-color-primary);
  cursor: pointer;
  text-align: left;
}
.receipt-index-item.active {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary);
}
.line-identity {
  font-weight: 600;
}
.line-version,
.section-heading span,
.action-note {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.receipt-current {
  flex: 1;
  min-width: 0;
}
.selected-source {
  margin-bottom: 10px;
}
.work-section {
  margin-top: 16px;
}
.section-heading,
.current-actions,
.section-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
}
.section-heading {
  margin-bottom: 10px;
}
.current-actions,
.done-message {
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  border-left: 3px solid var(--el-color-primary);
}
.done-message {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
  border-color: var(--el-color-success);
}
.done-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.done-actions .el-button {
  margin-left: 0;
}
.done-hint {
  margin-top: 8px;
}
.return-hint {
  flex-basis: 100%;
}
.allocations-section:focus {
  outline: none;
}
.allocation-focus-hint {
  margin-top: 12px;
}
.secondary-section {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.section-actions {
  padding: 4px 0 10px;
}
.section-actions .el-button {
  margin-left: 0;
}
.batch-trace {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  overflow-wrap: anywhere;
}
@media (max-width: 1600px) {
  .receipt-workbench {
    flex-direction: column;
  }
  .receipt-index {
    flex: none;
    width: 100%;
    max-width: 100%;
    max-height: none;
    padding-right: 0;
    padding-bottom: 8px;
    border-right: 0;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }
  .index-list {
    flex-direction: row;
    width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
  }
  .receipt-index-item {
    flex: 0 0 200px;
  }
  .receipt-current {
    width: 100%;
  }
}
</style>
