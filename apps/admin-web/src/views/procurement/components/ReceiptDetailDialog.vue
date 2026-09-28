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
          ><el-descriptions-item label="采购单">{{ detail.purchaseNo }}</el-descriptions-item
          ><el-descriptions-item label="供应商">{{
            supplierSummary(detail.suppliers)
          }}</el-descriptions-item
          ><el-descriptions-item label="实际到货时间">{{
            formatDateTimeForDisplay(detail.receivedAt)
          }}</el-descriptions-item
          ><el-descriptions-item
            label="交接凭据"
            :span="3"
            >{{ detail.handoverEvidence }}</el-descriptions-item
          ><el-descriptions-item
            label="备注"
            :span="3"
            >{{ detail.remark || '—' }}</el-descriptions-item
          ></el-descriptions
        >
        <div class="receipt-workbench">
          <nav
            class="receipt-index"
            aria-label="到货明细"
          >
            <strong>到货明细 · {{ detail.items.length }} 条</strong>
            <button
              v-for="line in detail.items"
              :key="line.id"
              type="button"
              class="receipt-index-item"
              :class="{ active: activeLine === line.id }"
              :aria-current="activeLine === line.id ? 'true' : undefined"
              @click="activeLine = line.id"
            >
              <span class="line-identity">{{ line.lineNo }}. {{ line.itemName }}</span>
              <span class="line-version">{{ line.itemCode }} · {{ line.materialVariantCode }}</span>
              <span class="line-version">供应商批号 {{ line.supplierBatchCode || '未提供' }}</span>
              <el-tag
                size="small"
                :type="lineStageType(line)"
                >{{ lineStageLabel(line) }}</el-tag
              >
            </button>
          </nav>
          <section
            v-if="selectedLine"
            class="receipt-current"
          >
            <ReceiptLineSummary :line="selectedLine" />
            <div class="work-section">
              <div class="section-heading">
                <strong>当前办理</strong>
                <span
                  >第 {{ selectedLine.currentRound.roundNo }} 轮 ·
                  {{ lineStageLabel(selectedLine) }}</span
                >
              </div>
              <div
                v-if="Number(selectedLine.quantities.unprocessedQuantity) === 0"
                class="done-message"
              >
                本批已处理完。实物入库与退回记录可在下方历史与依据查看。
              </div>
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
                  <span>当前为人工拒收；请按下方有效待退分配确认实际交接。</span>
                </template>
                <template v-else-if="Number(selectedLine.quantities.pendingInboundQuantity) > 0">
                  <span>下一步：办理当前有效正式分配的实际入库</span>
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
                <template v-else-if="Number(selectedLine.quantities.pendingReturnQuantity) > 0">
                  <span>下一步：在下方当前去向中确认实际退回</span>
                </template>
                <template v-else>
                  <span>当前仍有未处置实物，请核对下方待处理分配。</span>
                  <el-button
                    v-if="canAcceptReceipt(selectedLine)"
                    type="primary"
                    :disabled="blocked"
                    @click="acceptanceDialog?.open(selectedLine)"
                    >更正整批正式分配</el-button
                  >
                </template>
              </div>
              <ReceiptLineAllocations
                :line="selectedLine"
                :quality="false"
                :disabled="blocked"
                @return="actionDialog?.open(selectedLine, 'return', $event)"
                @inbound="goInbound(selectedLine.id)"
                @history="history?.open(selectedLine.id, $event, selectedLine)"
              />
            </div>
            <el-collapse
              v-model="expandedSections"
              class="secondary-sections"
            >
              <el-collapse-item
                name="exceptions"
                title="异常处置与采购承接"
              >
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
                  <el-dropdown
                    v-if="qualityReturnAllocations(selectedLine).length"
                    :disabled="blocked"
                    @command="openReplacement(selectedLine, $event)"
                  >
                    <el-button :disabled="blocked">创建质量补发单</el-button>
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
              </el-collapse-item>
              <el-collapse-item
                name="history"
                title="历史与依据"
              >
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
              </el-collapse-item>
            </el-collapse>
          </section>
        </div>
      </template>
    </div>
    <template #footer
      ><el-button
        :disabled="actionDialog?.locked"
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
  <QualityReplacementDialog
    ref="replacementDialog"
    @saved="supplementSaved"
  />
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
  isReceiptRejected,
} from '../receipt-round-presentation';
import { computed, onActivated, ref } from 'vue';
import { useRouter } from 'vue-router';
import type {
  ProcurementReceiptDetail,
  ProcurementReceiptLine,
  ReceiptAllocationItem,
} from '@company/contracts';
import {
  PERMISSIONS,
  RECEIPT_ROUND_STATUS_LABELS,
  RECEIPT_ROUND_TRIGGER_LABELS,
} from '@company/constants';
import { procurementApi } from '../../../api/procurement';
import { useAuthStore } from '../../../stores/auth';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { EMessage } from '../../../utils/message';
import QualityReplacementDialog from './QualityReplacementDialog.vue';
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
  expandedSections = ref<string[]>([]),
  loading = ref(false),
  readError = ref(false);
const detail = ref<ProcurementReceiptDetail | null>(null);
const selectedLine = computed(() =>
  detail.value?.items.find((line) => line.id === activeLine.value),
);
const lineStageLabel = (line: ProcurementReceiptLine): string => {
  if (Number(line.quantities.unprocessedQuantity) === 0) return '本批已处理完';
  if (isReceiptRejected(line)) return RECEIPT_ROUND_TRIGGER_LABELS.manual_rejection;
  return RECEIPT_ROUND_STATUS_LABELS[line.currentRound.status];
};
const lineStageType = (line: ProcurementReceiptLine): 'success' | 'warning' | 'danger' | 'info' => {
  if (Number(line.quantities.unprocessedQuantity) === 0) return 'success';
  if (isReceiptRejected(line) || line.currentRound.status === 'quality_rejected') return 'danger';
  if (
    line.currentRound.status === 'awaiting_acceptance' ||
    line.currentRound.status === 'reinspection_required'
  )
    return 'warning';
  return 'info';
};
const qualityReturnAllocations = (line: ProcurementReceiptLine): ReceiptAllocationItem[] =>
  line.allocations.filter(
    (row) =>
      row.disposition === 'return' &&
      row.returnReason === 'quality' &&
      Number(row.remainingQuantity) > 0,
  );
const replacementDialog = ref<InstanceType<typeof QualityReplacementDialog>>();
const acceptanceDialog = ref<InstanceType<typeof ReceiptAcceptanceDialog>>();
const actionDialog = ref<InstanceType<typeof ReceiptLineActionDialog>>(),
  history = ref<InstanceType<typeof ReceiptHistoryDialog>>();
const read = useLatestReadRequest(() => {
  loading.value = false;
});
const blocked = computed(
  () =>
    loading.value ||
    readError.value ||
    Boolean(
      actionDialog.value?.visible ||
      acceptanceDialog.value?.visible ||
      replacementDialog.value?.visible,
    ),
);
const load = async (): Promise<void> => {
  if (!visible.value || !read.isActive()) return;
  const target = id.value;
  const current = read.begin(() => visible.value && id.value === target);
  loading.value = true;
  try {
    const result = await procurementApi.getReceipt(target, current.signal);
    if (!current.isCurrent()) return;
    detail.value = result;
    readError.value = false;
    if (!result.items.some((line) => line.id === activeLine.value))
      activeLine.value = result.items[0]?.id ?? '';
  } catch (error) {
    if (current.isCurrent()) {
      readError.value = true;
      EMessage.error(error, '到货详情加载失败');
    }
  } finally {
    if (current.isCurrent()) loading.value = false;
  }
};
const open = async (target: string, lineId?: string): Promise<void> => {
  if (visible.value && !(await close())) return;
  id.value = target;
  activeLine.value = lineId ?? '';
  expandedSections.value = [];
  detail.value = null;
  readError.value = false;
  visible.value = true;
  await load();
};
const close = async (): Promise<boolean> => {
  if (
    actionDialog.value?.locked ||
    history.value?.locked ||
    acceptanceDialog.value?.locked ||
    replacementDialog.value?.locked
  ) {
    EMessage.warning('请先确认当前处置结果');
    return false;
  }
  if (replacementDialog.value?.visible && !(await replacementDialog.value.close())) return false;
  if (acceptanceDialog.value?.visible && !(await acceptanceDialog.value.close())) return false;
  if (actionDialog.value?.visible && !(await actionDialog.value.close())) return false;
  if (history.value?.visible && !(await history.value.close())) return false;
  visible.value = false;
  read.invalidate();
  return true;
};
const saved = async (): Promise<void> => {
  emit('changed');
  await load();
};
const openReplacement = (line: ProcurementReceiptLine, scope: ReceiptAllocationItem): void => {
  if (blocked.value || scope.disposition !== 'return' || scope.returnReason !== 'quality') return;
  replacementDialog.value?.open(line, {
    allocationId: scope.id,
    quantity: scope.remainingQuantity,
    returned: false,
  });
};
const supplementSaved = async (purchaseOrderId: string): Promise<void> => {
  await saved();
  if (auth.can(PERMISSIONS.procurement.orders.view) && (await close()))
    await router.push({ name: 'procurement-orders', query: { purchaseOrderId } });
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
  if (visible.value && !actionDialog.value?.locked) void load();
});
defineExpose({
  open,
  close,
  visible,
  locked: computed(() =>
    Boolean(
      actionDialog.value?.locked ||
      history.value?.locked ||
      acceptanceDialog.value?.locked ||
      replacementDialog.value?.locked,
    ),
  ),
});
</script>
<style scoped>
.notice {
  margin-bottom: 16px;
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
  gap: 6px;
  max-height: 620px;
  overflow-y: auto;
  padding-right: 8px;
  border-right: 1px solid #e5e7eb;
}
.receipt-index > strong {
  margin-bottom: 4px;
}
.receipt-index-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  width: 100%;
  padding: 8px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  color: #1f2937;
  cursor: pointer;
  text-align: left;
}
.receipt-index-item.active {
  background: #f3f7fb;
  border-color: #306188;
}
.line-identity {
  font-weight: 600;
}
.line-version,
.section-heading span,
.action-note {
  color: #6b7280;
  font-size: 13px;
}
.receipt-current {
  flex: 1;
  min-width: 0;
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
  padding: 12px;
  background: #f5f7fa;
  border-left: 3px solid #306188;
}
.done-message {
  border-color: #22c55e;
}
.secondary-sections {
  margin-top: 18px;
}
.section-actions {
  padding: 4px 0 10px;
}
.section-actions .el-button {
  margin-left: 0;
}
@media (max-width: 1600px) {
  .receipt-workbench {
    flex-direction: column;
  }
  .receipt-index {
    flex: none;
    flex-direction: row;
    width: 100%;
    max-width: 100%;
    overflow-x: auto;
    padding-right: 0;
    padding-bottom: 8px;
    border-right: 0;
    border-bottom: 1px solid #e5e7eb;
  }
  .receipt-index-item {
    flex: 0 0 200px;
  }
  .receipt-current {
    width: 100%;
  }
}
</style>
