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
        <el-tabs
          v-model="activeLine"
          class="receipt-lines"
          ><el-tab-pane
            v-for="line in detail.items"
            :key="line.id"
            :name="line.id"
            :label="`${line.lineNo}. ${line.materialVariantCode}`"
          >
            <ReceiptLineSummary :line="line" />
            <div class="actions">
              <el-button
                v-if="
                  auth.can(PERMISSIONS.procurement.orders.view) &&
                  Number(line.quantities.unprocessedQuantity) > 0
                "
                :disabled="blocked"
                @click="goExcessSupplement(line)"
                >前往采购办理超量补单</el-button
              >
              <el-button
                :disabled="blocked"
                @click="actionDialog?.open(line, 'correct')"
                >更正实收</el-button
              ><el-button
                :disabled="blocked || !canAcceptReceipt(line)"
                @click="acceptanceDialog?.open(line)"
              >
                {{
                  line.currentRound.status === 'finalized' ? '更正整批正式分配' : '核对整批定稿'
                }} </el-button
              ><el-button
                type="danger"
                plain
                :disabled="blocked || !canRejectReceipt(line)"
                @click="actionDialog?.open(line, 'reject')"
                >人工拒收</el-button
              >
              <el-button
                v-if="canRevokeReceiptRejection(line)"
                :disabled="blocked"
                @click="actionDialog?.open(line, 'revoke')"
                >撤销拒收并重新办理</el-button
              >
              <el-button @click="history?.open(line.id, 'rounds', line)"
                >处理轮次 {{ line.historyTotals.rounds }}</el-button
              >
              <el-dropdown
                v-if="
                  line.allocations.some(
                    (row) =>
                      row.disposition === 'return' &&
                      row.returnReason === 'quality' &&
                      Number(row.remainingQuantity) > 0,
                  )
                "
                :disabled="blocked"
                @command="openReplacement(line, $event)"
              >
                <el-button :disabled="blocked">创建质量补发单</el-button>
                <template #dropdown
                  ><el-dropdown-menu>
                    <el-dropdown-item
                      v-for="range in line.allocations.filter(
                        (row) =>
                          row.disposition === 'return' &&
                          row.returnReason === 'quality' &&
                          Number(row.remainingQuantity) > 0,
                      )"
                      :key="range.id"
                      :command="range"
                    >
                      质量待退 {{ range.remainingQuantity }} {{ line.unit }} · 分配
                      {{ range.id }}
                    </el-dropdown-item>
                  </el-dropdown-menu></template
                >
              </el-dropdown>
              <el-button
                v-if="auth.can(PERMISSIONS.quality.inboundInspections.view)"
                :disabled="blocked"
                @click="goQuality(line.id)"
                >来料检验 / 复检</el-button
              ><el-button
                v-if="
                  auth.can(PERMISSIONS.production.inbounds.view) &&
                  Number(line.quantities.pendingInboundQuantity) > 0
                "
                :disabled="blocked"
                @click="goInbound(line.id)"
                >办理正式清单入库</el-button
              ><el-button @click="history?.open(line.id, 'revisions', line)"
                >实收修订 {{ line.historyTotals.revisions }}</el-button
              ><el-button @click="history?.open(line.id, 'cases', line)"
                >检验历史 {{ line.historyTotals.cases }}</el-button
              ><el-button @click="history?.open(line.id, 'acceptances', line)"
                >正式清单 {{ line.historyTotals.acceptances }}</el-button
              ><el-button @click="history?.open(line.id, 'returns', line)"
                >退回记录 {{ line.historyTotals.returns }}</el-button
              ><el-button @click="history?.open(line.id, 'inbounds', line)"
                >入库记录 {{ line.historyTotals.inbounds }}</el-button
              >
            </div>
            <ReceiptLineAllocations
              :line="line"
              :quality="false"
              :disabled="blocked"
              @return="actionDialog?.open(line, 'return', $event)"
              @inbound="goInbound(line.id)"
              @history="history?.open(line.id, $event, line)"
            /> </el-tab-pane
        ></el-tabs>
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
} from '../receipt-round-presentation';
import { computed, onActivated, ref } from 'vue';
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
  loading = ref(false),
  readError = ref(false);
const detail = ref<ProcurementReceiptDetail | null>(null);
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
.receipt-lines {
  margin-top: 20px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 16px 0;
}
.actions .el-button {
  margin-left: 0;
}
</style>
