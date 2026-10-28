<template>
  <el-dialog
    v-model="visible"
    :title="`到货详情${detail ? ` · ${detail.receiptNo}` : ''}`"
    :width="DialogWidth.workbench"
    workbench
    :before-close="beforeClose"
    :close-on-click-modal="false"
  >
    <div v-loading="receiptLoading">
      <el-alert
        v-if="readError"
        title="详情刷新失败，请刷新后再办理；旧内容只供核对。"
        type="error"
        :closable="false"
        class="notice"
      />
      <template v-if="detail">
        <ReceiptVoidNotice
          v-if="detail.void"
          :record="detail.void"
          class="notice"
        />
        <el-descriptions
          :column="detail.remark ? 4 : 3"
          border
          size="small"
          class="receipt-header"
          ><el-descriptions-item label="采购单">{{ detail.purchaseNo }}</el-descriptions-item
          ><el-descriptions-item label="实际到货时间">{{
            formatDateTimeForDisplay(detail.receivedAt)
          }}</el-descriptions-item
          ><el-descriptions-item label="交接凭据"
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
              aria-label="筛选本单明细"
              placeholder="物料 / 编码 / 供应商 / 批号"
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
                <span class="line-identity">id:{{ line.id }} · {{ line.itemName }}</span>
                <span class="line-version">{{ line.materialVariantCode }}</span>
                <span class="line-version">{{ line.supplierName }}</span>
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
            v-loading="lineLoading"
            class="receipt-current"
          >
            <ReceiptLineSummary
              :line="selectedLine"
              section="identity"
              class="line-identity-summary"
            />
            <ReceiptLineProcessingCard :line="selectedLine">
              <div
                v-if="
                  !isReceiptVoided(selectedLine) &&
                  isKnownZero(selectedLine.quantities.unprocessedQuantity)
                "
                class="done-message"
              >
                <span>{{
                  isKnownZero(selectedLine.quantities.receivedQuantity)
                    ? '本批到货量为零，当前无剩余实物。'
                    : '本批到货量已全部入库或退回。'
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
                    >更正到货量</el-button
                  >
                </div>
              </div>
              <p
                v-if="
                  !isReceiptVoided(selectedLine) &&
                  isKnownZero(selectedLine.quantities.unprocessedQuantity)
                "
                class="done-hint"
              >
                当前没有尚未入库或退回的实物，无法调整入库和退回安排。同批计数有误时可更正到货量；更正后增加的剩余实物须重新检验并由仓库确认。已入库、已退回记录不变。
              </p>
              <div
                v-else-if="!isReceiptVoided(selectedLine)"
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
                  <el-button
                    type="warning"
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
                <template v-else-if="!isReceiptRejected(selectedLine)">
                  <template v-if="Number(selectedLine.quantities.pendingInboundQuantity) > 0">
                    <el-button
                      v-if="auth.can(PERMISSIONS.warehouse.inbound.view)"
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
                    <el-button
                      v-if="canAcceptReceipt(selectedLine)"
                      type="warning"
                      :disabled="blocked"
                      @click="acceptanceDialog?.open(selectedLine)"
                      >更正整批正式分配</el-button
                    >
                  </template>
                </template>
                <el-button
                  v-if="
                    selectedLine.currentRound.status === 'finalized' &&
                    Number(selectedLine.quantities.pendingReturnQuantity) > 0
                  "
                  type="warning"
                  plain
                  :disabled="blocked"
                  @click="focusAllocations"
                  >查看待退分配</el-button
                >
              </div>
            </ReceiptLineProcessingCard>
            <div class="work-section">
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
                  :disabled="blocked || isReceiptVoided(selectedLine)"
                  @return="actionDialog?.open(selectedLine, 'return', $event)"
                  @inbound="goInbound(selectedLine.id)"
                  @history="history?.open(selectedLine.id, $event, selectedLine)"
                />
              </div>
            </div>
            <div
              v-if="!isReceiptVoided(selectedLine)"
              class="secondary-section"
            >
              <div class="section-heading"><strong>异常处置与采购补单</strong></div>
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
                  v-if="!isKnownZero(selectedLine.quantities.unprocessedQuantity)"
                  :disabled="blocked"
                  @click="actionDialog?.open(selectedLine, 'correct')"
                  >更正到货量</el-button
                >
                <el-button
                  v-if="!isKnownZero(selectedLine.quantities.unprocessedQuantity)"
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
                  v-if="auth.can(PERMISSIONS.procurement.orders.view)"
                  :disabled="blocked"
                  @click="goExcessSupplement(selectedLine)"
                  >前往采购办理超量补单</el-button
                >
              </div>
            </div>
            <div
              v-if="hasQualityReplacementSource(selectedLine)"
              class="secondary-section"
            >
              <div class="section-heading"><strong>质量退回与补发</strong></div>
              <div class="section-actions">
                <span>本次到货存在质量待退或已退依据；原货实际退回独立办理。</span>
                <el-button
                  v-if="auth.can(PERMISSIONS.procurement.orders.view)"
                  :disabled="blocked"
                  @click="goQualityReplacement(selectedLine)"
                  >前往采购办理质量补发</el-button
                >
              </div>
            </div>
            <div class="secondary-section history-section">
              <div class="section-heading"><strong>历史与依据</strong></div>
              <div class="section-actions">
                <el-button @click="history?.open(selectedLine.id, 'rounds', selectedLine)"
                  >处理轮次</el-button
                >
                <el-button @click="history?.open(selectedLine.id, 'revisions', selectedLine)"
                  >到货量修订</el-button
                >
                <el-button @click="history?.open(selectedLine.id, 'cases', selectedLine)"
                  >检验历史</el-button
                >
                <el-button @click="history?.open(selectedLine.id, 'acceptances', selectedLine)"
                  >正式清单</el-button
                >
                <el-button @click="history?.open(selectedLine.id, 'returns', selectedLine)"
                  >退回记录</el-button
                >
                <el-button @click="history?.open(selectedLine.id, 'inbounds', selectedLine)"
                  >入库记录</el-button
                >
              </div>
              <div class="batch-trace">库存批次请查看入库记录，按实际入库明细追溯。</div>
            </div>
          </section>
          <section
            v-else-if="activeLine"
            v-loading="lineLoading"
            class="receipt-current"
          >
            <el-empty
              :description="lineReadError ? '明细读取失败，请重新读取后办理' : '正在读取当前明细'"
            >
              <el-button
                v-if="lineReadError"
                :disabled="lineLoading || receiptLoading"
                @click="loadLine"
                >重新读取明细</el-button
              >
            </el-empty>
          </section>
        </div>
      </template>
    </div>
    <template #footer>
      <span v-if="detail && !detail.void">
        <el-button
          type="danger"
          plain
          :disabled="blocked"
          @click="openVoid"
          >作废整单</el-button
        >
      </span>
      <el-button
        :disabled="loading || childOpen"
        @click="load()"
        >刷新</el-button
      ><el-button @click="close">关闭</el-button>
    </template>
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
  <ReceiptVoidDialog
    ref="voidDialog"
    @saved="saved"
  />
</template>
<script setup lang="ts">
import {
  canAcceptReceipt,
  canRejectReceipt,
  canRevokeReceiptRejection,
  canReviewReceipt,
  canExecuteReceiptAllocation,
  isReceiptRejected,
  isReceiptVoided,
  receiptLineStageLabel,
  receiptLineStageType,
  receiptLineStageEffect,
  type ReceiptDetailIntent,
} from '../receipt-round-presentation';
import { computed, nextTick, onActivated, onDeactivated, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import type { ProcurementReceiptDetail, ProcurementReceiptLine } from '@company/contracts';
import { PERMISSIONS } from '@company/constants';
import { procurementApi } from '../../../api/procurement';
import { useAuthStore } from '../../../stores/auth';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { EMessage } from '../../../utils/message';
import InlineHint from '../../../components/InlineHint.vue';
import ReceiptLineSummary from './ReceiptLineSummary.vue';
import ReceiptLineProcessingCard from './ReceiptLineProcessingCard.vue';
import ReceiptAcceptanceDialog from './ReceiptAcceptanceDialog.vue';
import ReceiptLineAllocations from './ReceiptLineAllocations.vue';
import ReceiptLineActionDialog from './ReceiptLineActionDialog.vue';
import ReceiptHistoryDialog from './ReceiptHistoryDialog.vue';
import ReceiptVoidDialog from './ReceiptVoidDialog.vue';
import ReceiptVoidNotice from './ReceiptVoidNotice.vue';
const emit = defineEmits<{ changed: [] }>();
const auth = useAuthStore(),
  router = useRouter();
const visible = ref(false),
  id = ref(''),
  activeLine = ref(''),
  lineSearch = ref(''),
  allocationFocused = ref(false),
  receiptLoading = ref(false),
  lineLoading = ref(false),
  receiptReadError = ref(false),
  lineReadError = ref(false),
  active = ref(true);
const loading = computed(() => receiptLoading.value || lineLoading.value);
const readError = computed(() => receiptReadError.value || lineReadError.value);
const detail = ref<ProcurementReceiptDetail | null>(null);
const lineDetail = ref<ProcurementReceiptLine | null>(null);
const selectedLine = computed(() =>
  lineDetail.value?.id === activeLine.value && lineDetail.value?.receiptId === id.value
    ? lineDetail.value
    : null,
);
const filteredLines = computed(() => {
  const query = lineSearch.value.trim().toLocaleLowerCase();
  if (!query) return detail.value?.items ?? [];
  return (detail.value?.items ?? []).filter((line) =>
    [
      line.itemName,
      line.itemCode,
      line.materialVariantCode,
      line.supplierName,
      line.supplierBatchCode ?? '',
    ].some((value) => value.toLocaleLowerCase().includes(query)),
  );
});
const hasQualityReplacementSource = (line: ProcurementReceiptLine): boolean =>
  !isReceiptVoided(line) &&
  (Number(line.quantities.qualityReturnedQuantity) > 0 ||
    line.allocations.some(
      (row) =>
        row.disposition === 'return' &&
        row.returnReason === 'quality' &&
        canExecuteReceiptAllocation(line, row) &&
        Number(row.remainingQuantity) > 0,
    ));
const acceptanceDialog = ref<InstanceType<typeof ReceiptAcceptanceDialog>>();
const voidDialog = ref<InstanceType<typeof ReceiptVoidDialog>>();
const actionDialog = ref<InstanceType<typeof ReceiptLineActionDialog>>(),
  history = ref<InstanceType<typeof ReceiptHistoryDialog>>();
const allocationsSection = ref<HTMLElement | null>(null);
const isKnownZero = (value: string): boolean => value.trim() !== '' && Number(value) === 0;
const receiptRead = useLatestReadRequest(() => {
  receiptLoading.value = false;
});
const lineRead = useLatestReadRequest(() => {
  lineLoading.value = false;
});
const childOpen = computed(() =>
  Boolean(
    actionDialog.value?.visible ||
    acceptanceDialog.value?.visible ||
    history.value?.visible ||
    voidDialog.value?.visible,
  ),
);
const blocked = computed(
  () => !active.value || loading.value || readError.value || childOpen.value,
);
const openVoid = async (): Promise<void> => {
  if (blocked.value || !detail.value || detail.value.void) return;
  await voidDialog.value?.open(detail.value.id);
};
const selectLine = (lineId: string): void => {
  if (lineId === activeLine.value || receiptLoading.value || childOpen.value) return;
  lineRead.invalidate();
  activeLine.value = lineId;
  lineDetail.value = null;
  lineReadError.value = false;
  allocationFocused.value = false;
  void loadLine();
};
const focusAllocations = async (): Promise<void> => {
  if (!selectedLine.value || blocked.value) return;
  allocationFocused.value = true;
  await nextTick();
  allocationsSection.value?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  allocationsSection.value?.focus({ preventScroll: true });
};
const loadLine = async (): Promise<ProcurementReceiptLine | null> => {
  if (!visible.value || !activeLine.value || !lineRead.isActive()) return null;
  const target = id.value;
  const targetLine = activeLine.value;
  const current = lineRead.begin(
    () => visible.value && id.value === target && activeLine.value === targetLine,
  );
  lineLoading.value = true;
  try {
    const result = await procurementApi.getReceiptLine(targetLine, current.signal);
    if (!current.isCurrent()) return null;
    if (result.id !== targetLine || result.receiptId !== target)
      throw new Error('到货明细与当前到货单不匹配，请重新核对来源');
    lineDetail.value = result;
    lineReadError.value = false;
    return result;
  } catch (error) {
    if (current.isCurrent()) {
      lineReadError.value = true;
      EMessage.error(error, '到货明细加载失败');
    }
    return null;
  } finally {
    if (current.isCurrent()) lineLoading.value = false;
  }
};
const load = async (requiredLineId?: string): Promise<ProcurementReceiptDetail | null> => {
  if (!visible.value || !receiptRead.isActive()) return null;
  const target = id.value;
  const current = receiptRead.begin(() => visible.value && id.value === target);
  lineRead.invalidate();
  receiptLoading.value = true;
  try {
    const result = await procurementApi.getReceipt(target, current.signal);
    if (!current.isCurrent()) return null;
    if (result.id !== target) throw new Error('到货单与当前读取目标不匹配，请重新核对来源');
    detail.value = result;
    receiptReadError.value = false;
    if (requiredLineId && !result.items.some((line) => line.id === requiredLineId)) return result;
    if (!result.items.some((line) => line.id === activeLine.value)) {
      lineDetail.value = null;
      activeLine.value = result.items[0]?.id ?? '';
      lineReadError.value = false;
    }
    receiptLoading.value = false;
    await loadLine();
    if (!current.isCurrent()) return null;
    return result;
  } catch (error) {
    if (current.isCurrent()) {
      receiptReadError.value = true;
      EMessage.error(error, '到货详情加载失败');
    }
    return null;
  } finally {
    if (current.isCurrent()) receiptLoading.value = false;
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
  lineDetail.value = null;
  receiptReadError.value = false;
  lineReadError.value = false;
  visible.value = true;
  const loadedDetail = await load(lineId);
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
  if (intent === 'void') {
    if (loadedDetail.void) EMessage.warning('该到货登记已作废，请查看作废原因和历史记录');
    else await openVoid();
    return true;
  }
  const line = selectedLine.value;
  if (!lineId || !line || line.id !== lineId) {
    EMessage.warning('指定到货明细已不在最新详情中，请重新选择');
    return false;
  }
  if (blocked.value) return false;
  if (intent !== 'history' && isReceiptVoided(line)) {
    EMessage.warning('该到货登记已作废，仅可查看历史记录');
    return true;
  }
  if (intent === 'acceptance') {
    if (canAcceptReceipt(line)) await acceptanceDialog.value?.open(line);
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
  if (
    actionDialog.value?.locked ||
    history.value?.locked ||
    acceptanceDialog.value?.locked ||
    voidDialog.value?.locked
  ) {
    EMessage.warning('请先确认当前处置结果');
    return false;
  }
  if (voidDialog.value?.visible && !(await voidDialog.value.close())) return false;
  if (acceptanceDialog.value?.visible && !(await acceptanceDialog.value.close())) return false;
  if (actionDialog.value?.visible && !(await actionDialog.value.close())) return false;
  if (history.value?.visible && !(await history.value.close())) return false;
  visible.value = false;
  openSequence += 1;
  receiptRead.invalidate();
  lineRead.invalidate();
  return true;
};
const saved = async (): Promise<void> => {
  emit('changed');
  await load();
};
const goQualityReplacement = async (line: ProcurementReceiptLine): Promise<void> => {
  if (blocked.value || selectedLine.value?.id !== line.id || !hasQualityReplacementSource(line))
    return;
  if (await close())
    await router.push({
      name: 'procurement-orders',
      query: {
        purchaseOrderId: line.purchaseOrderId,
        supplementLineId: line.purchaseOrderLineId,
        supplementReason: 'quality_replacement',
        receiptLineId: line.id,
      },
    });
};
const goQuality = async (lineId: string): Promise<void> => {
  if (blocked.value || selectedLine.value?.id !== lineId) return;
  if (await close())
    await router.push({ name: 'quality-inbound-inspections', query: { receiptLineId: lineId } });
};
const goExcessSupplement = async (line: ProcurementReceiptLine): Promise<void> => {
  if (blocked.value || selectedLine.value?.id !== line.id) return;
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
const { canAccessRoute } = useRouteAccess();
const goInbound = async (lineId: string): Promise<void> => {
  if (blocked.value || selectedLine.value?.id !== lineId) return;
  if (!canAccessRoute({ name: 'warehouse-inbound' })) return;
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
  active.value = true;
});
onDeactivated(() => {
  active.value = false;
});
defineExpose({
  open,
  close,
  visible,
  openedReceiptId: computed(() => (visible.value ? id.value : '')),
  openedLineId: computed(() => (visible.value ? activeLine.value : '')),
  locked: computed(() =>
    Boolean(
      actionDialog.value?.locked ||
      history.value?.locked ||
      acceptanceDialog.value?.locked ||
      voidDialog.value?.locked,
    ),
  ),
});
</script>
<style scoped>
.notice {
  margin-bottom: 16px;
}
.receipt-header :deep(.el-descriptions__cell) {
  vertical-align: top;
  overflow-wrap: anywhere;
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
  overflow-wrap: anywhere;
}
.receipt-index-item.active {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary);
}
.line-identity {
  font-weight: 600;
}
.line-version,
.action-note {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.receipt-current {
  flex: 1;
  min-width: 0;
}
.line-identity-summary {
  margin-bottom: 12px;
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
  padding: 0;
}
.done-message {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
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
  margin-bottom: 0;
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1.6;
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
.history-section .section-heading,
.history-section .section-actions {
  color: var(--el-text-color-regular);
}
.history-section .el-button {
  --el-button-text-color: var(--el-text-color-regular);
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
