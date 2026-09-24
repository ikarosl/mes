<template>
  <el-dialog
    v-model="visible"
    :title="`来料检验${task ? ` · ${task.receiptNo}` : ''}`"
    :width="DialogWidth.workbench"
    workbench
    :before-close="beforeClose"
    :close-on-click-modal="false"
  >
    <div v-loading="loading">
      <el-alert
        v-if="readError"
        title="检验依据加载失败，不能提交结论。请刷新后重新核对。"
        type="error"
        :closable="false"
        class="notice"
      />
      <template v-if="line">
        <el-descriptions
          v-if="task"
          :column="3"
          border
          class="notice"
          ><el-descriptions-item label="到货单">{{ task.receiptNo }}</el-descriptions-item
          ><el-descriptions-item label="采购单">{{ task.purchaseNo }}</el-descriptions-item
          ><el-descriptions-item label="供应商">{{
            task.supplierName
          }}</el-descriptions-item></el-descriptions
        >
        <ReceiptLineSummary :line="line" />
        <div class="history-actions">
          <el-button
            type="primary"
            :disabled="blocked || !canReviewReceipt(line)"
            @click="actions?.open(line, 'review', undefined, undefined, true)"
          >
            {{
              line.currentRound.status === 'uninspected' ? '发起整批检验' : '发起整批复检 / 更正'
            }}
          </el-button>
          <el-button
            v-if="currentReceiptCase(line)"
            type="primary"
            :disabled="blocked"
            @click="actions?.open(line, 'inspect', undefined, currentReceiptCase(line), true)"
            >填写本轮检验结果</el-button
          >
          <el-button @click="history?.open(line.id, 'rounds', line)"
            >处理轮次 {{ line.historyTotals.rounds }}</el-button
          >

          <el-button
            v-if="
              auth.can(PERMISSIONS.production.inbounds.view) &&
              Number(line.quantities.pendingInboundQuantity) > 0
            "
            type="primary"
            plain
            :disabled="blocked"
            @click="goInbound"
            >仓管确认入库</el-button
          >
          <el-button
            v-if="auth.can(PERMISSIONS.procurement.receipts.view)"
            :disabled="blocked"
            @click="goReceipt"
            >查看到货 / 实收更正</el-button
          >
          <el-button @click="history?.open(line.id, 'revisions', line)"
            >实收修订 {{ line.historyTotals.revisions }}</el-button
          ><el-button @click="history?.open(line.id, 'cases', line)"
            >检验历史 {{ line.historyTotals.cases }}</el-button
          ><el-button @click="history?.open(line.id, 'returns', line)"
            >退回记录 {{ line.historyTotals.returns }}</el-button
          ><el-button @click="history?.open(line.id, 'inbounds', line)"
            >入库记录 {{ line.historyTotals.inbounds }}</el-button
          >
        </div>
        <el-alert
          v-if="['reinspection_required', 'quality_rejected'].includes(line.currentRound.status)"
          type="warning"
          :closable="false"
          class="notice"
          title="本次检查记录已保存，但本批仍不允许正常定稿或入库；可发起整批复检，库管仍可独立拒收。"
        />
        <div
          v-if="currentInspection"
          class="selected-record"
        >
          <strong>本批当前检验依据</strong
          ><InboundInspectionRecord :inspection="currentInspection" />
        </div>
        <div
          v-if="selectedCase?.inspection && selectedCase.inspection.id !== currentInspection?.id"
          class="selected-record"
        >
          <strong
            >所选历史检验结论 ·
            {{ QUALITY_INBOUND_CASE_STATUS_LABELS[selectedCase.status] }}</strong
          ><InboundInspectionRecord :inspection="selectedCase.inspection" />
        </div>
        <ReceiptLineAllocations
          :line="line"
          :quality="true"
          :disabled="blocked"
          @history="history?.open(line.id, $event, line)"
        />
      </template>
    </div>
    <template #footer
      ><el-button
        :disabled="actions?.locked"
        @click="load"
        >刷新当前范围</el-button
      ><el-button @click="close">关闭</el-button></template
    >
  </el-dialog>
  <ReceiptLineActionDialog
    ref="actions"
    @saved="saved"
  /><ReceiptHistoryDialog ref="history" />
</template>
<script setup lang="ts">
import { computed, onActivated, ref } from 'vue';
import { canReviewReceipt, currentReceiptCase } from '../receipt-round-presentation';
import { useRouter } from 'vue-router';
import type {
  ProcurementInboundInspectionItem,
  ProcurementReceiptLine,
  QualityInboundCaseItem,
} from '@company/contracts';
import { QUALITY_INBOUND_CASE_STATUS_LABELS, PERMISSIONS } from '@company/constants';
import { useAuthStore } from '../../../stores/auth';
import { procurementApi } from '../../../api/procurement';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import ReceiptLineSummary from './ReceiptLineSummary.vue';
import ReceiptLineAllocations from './ReceiptLineAllocations.vue';
import ReceiptLineActionDialog from './ReceiptLineActionDialog.vue';
import ReceiptHistoryDialog from './ReceiptHistoryDialog.vue';
import InboundInspectionRecord from './InboundInspectionRecord.vue';
const emit = defineEmits<{ changed: [] }>();
const auth = useAuthStore(),
  router = useRouter();
const visible = ref(false),
  lineId = ref(''),
  loading = ref(false),
  readError = ref(false);
const line = ref<ProcurementReceiptLine | null>(null),
  task = ref<ProcurementInboundInspectionItem | null>(null),
  selectedCase = ref<QualityInboundCaseItem | null>(null);
const actions = ref<InstanceType<typeof ReceiptLineActionDialog>>(),
  history = ref<InstanceType<typeof ReceiptHistoryDialog>>();
const read = useLatestReadRequest(() => {
  loading.value = false;
});
const currentInspection = computed(
  () =>
    line.value?.cases.find(
      (record) => record.inspection?.id === line.value?.currentRound.inspectionId,
    )?.inspection ?? null,
);
const blocked = computed(() => loading.value || readError.value || Boolean(actions.value?.visible));
const load = async (): Promise<void> => {
  if (!visible.value || !read.isActive()) return;
  const target = lineId.value,
    current = read.begin(() => visible.value && lineId.value === target);
  loading.value = true;
  try {
    const result = await procurementApi.inspectionReceiptLine(target, current.signal);
    if (current.isCurrent()) {
      line.value = result;
      readError.value = false;
    }
  } catch (error) {
    if (current.isCurrent()) {
      readError.value = true;
      EMessage.error(error, '检验范围加载失败');
    }
  } finally {
    if (current.isCurrent()) loading.value = false;
  }
};
const open = async (id: string, context?: ProcurementInboundInspectionItem): Promise<void> => {
  if (visible.value && !(await close())) return;
  lineId.value = id;
  line.value = null;
  task.value = context ?? null;
  selectedCase.value = context?.case ?? null;
  readError.value = false;
  visible.value = true;
  await load();
};
const close = async (): Promise<boolean> => {
  if (actions.value?.locked || history.value?.locked) {
    EMessage.warning('请先确认本次检验操作结果');
    return false;
  }
  if (actions.value?.visible && !(await actions.value.close())) return false;
  if (history.value?.visible && !(await history.value.close())) return false;
  visible.value = false;
  read.invalidate();
  return true;
};
const saved = async (): Promise<void> => {
  selectedCase.value = null;
  emit('changed');
  await load();
};
const goInbound = async (): Promise<void> => {
  const id = line.value?.id;
  if (id && (await close()))
    await router.push({
      name: 'warehouse-inbound',
      query: { sourceType: 'purchased', receiptLineId: id },
    });
};
const goReceipt = async (): Promise<void> => {
  const id = line.value?.id;
  if (id && (await close()))
    await router.push({ name: 'procurement-receipts', query: { receiptLineId: id } });
};
const beforeClose = (): void => {
  void close();
};
onActivated(() => {
  if (visible.value && !actions.value?.locked) void load();
});
defineExpose({
  open,
  close,
  visible,
  locked: computed(() => Boolean(actions.value?.locked || history.value?.locked)),
});
</script>
<style scoped>
.notice {
  margin-bottom: 16px;
}
.history-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 16px 0;
}
.history-actions .el-button {
  margin-left: 0;
}
.selected-record {
  margin: 20px 0;
}
.selected-record strong {
  display: block;
  margin-bottom: 10px;
}
</style>
