<template>
  <el-dialog
    v-model="visible"
    :title="`来料检验${line ? ` · ${line.receiptNo} · 第 ${line.lineNo} 行` : ''}`"
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
        <InboundInspectionSummary :line="line" />
        <div
          v-if="currentInspection"
          class="selected-record"
        >
          <strong
            >本批当前检验依据<span v-if="currentCaseRoundNo !== undefined">
              · 检验所属处理第 {{ currentCaseRoundNo }} 轮</span
            ></strong
          >
          <InboundInspectionRecord
            :inspection="currentInspection"
            :round-no="currentCaseRoundNo"
          />
        </div>
        <div
          v-if="selectedCase?.inspection && selectedCase.inspection.id !== currentInspection?.id"
          class="selected-record"
        >
          <strong
            >所选历史检验结论 · {{ QUALITY_INBOUND_CASE_STATUS_LABELS[selectedCase.status]
            }}<span v-if="selectedCaseRoundNo !== undefined">
              · 第 {{ selectedCaseRoundNo }} 轮</span
            ></strong
          >
          <p class="historical-note">此记录属于历史办理，仅供追溯，不代表当前轮采用依据。</p>
          <InboundInspectionRecord
            :inspection="selectedCase.inspection"
            :round-no="selectedCaseRoundNo"
          />
        </div>
        <div class="current-action">
          <strong>当前办理 · 第 {{ line.currentRound.roundNo }} 轮</strong>
          <template v-if="Number(line.quantities.unprocessedQuantity) === 0">
            <span>本批已处理完，可查阅检验依据与检验历史。</span>
          </template>
          <template v-else-if="currentReceiptCase(line)">
            <span>本轮检验已发起，需填写检查事实与放行结论。</span>
            <el-button
              type="primary"
              :disabled="blocked"
              @click="actions?.open(line, 'inspect', undefined, currentReceiptCase(line), true)"
              >填写本轮检验结果</el-button
            >
          </template>
          <template
            v-else-if="
              canReviewReceipt(line) &&
              ['uninspected', 'reinspection_required', 'quality_rejected'].includes(
                line.currentRound.status,
              )
            "
          >
            <span>{{
              line.currentRound.status === 'uninspected'
                ? '本批待检验。'
                : '本批仍有质量阻断，可发起整批复检。'
            }}</span>
            <el-button
              type="primary"
              :disabled="blocked"
              @click="actions?.open(line, 'review', undefined, undefined, true)"
              >{{
                line.currentRound.status === 'uninspected' ? '发起整批检验' : '发起整批复检'
              }}</el-button
            >
          </template>
          <template v-else-if="line.currentRound.status === 'awaiting_acceptance'">
            <span>本轮检查已完成，待库管核对并定稿正式去向。</span>
          </template>
          <template v-else>
            <span>{{
              isReceiptRejected(line)
                ? '本批已人工拒收，检验记录仅供追溯。'
                : '本轮检验办理已完成，可查看检验依据或发起复检。'
            }}</span>
          </template>
        </div>
        <div
          v-if="
            canReviewReceipt(line) &&
            ['awaiting_acceptance', 'finalized'].includes(line.currentRound.status)
          "
          class="secondary-action"
        >
          <el-button
            link
            type="primary"
            :disabled="blocked"
            @click="actions?.open(line, 'review', undefined, undefined, true)"
            >发起整批复检 / 更正</el-button
          >
        </div>
        <el-alert
          v-if="['reinspection_required', 'quality_rejected'].includes(line.currentRound.status)"
          :type="line.currentRound.status === 'quality_rejected' ? 'error' : 'warning'"
          :closable="false"
          class="notice"
          title="本次检查记录已保存，但本批仍不允许正常定稿或入库；可发起整批复检，库管仍可独立拒收。"
        />
        <el-button
          :disabled="blocked"
          @click="history?.open(line)"
          >检验历史</el-button
        >
      </template>
    </div>
    <template #footer
      ><el-button
        v-if="line && auth.can(PERMISSIONS.procurement.receipts.view)"
        :disabled="blocked"
        @click="goReceipt"
        >查看到货</el-button
      ><el-button
        :disabled="actions?.locked"
        @click="load"
        >刷新检验详情</el-button
      ><el-button @click="close">关闭</el-button></template
    >
  </el-dialog>
  <ReceiptLineActionDialog
    ref="actions"
    @saved="saved"
  /><InboundInspectionHistoryDialog ref="history" />
</template>
<script setup lang="ts">
import { computed, onActivated, ref } from 'vue';
import {
  canReviewReceipt,
  currentReceiptCase,
  isReceiptRejected,
} from '../receipt-round-presentation';
import { useRouter } from 'vue-router';
import type {
  ProcurementInboundInspectionItem,
  ProcurementInboundInspectionDetail,
  QualityInboundCaseItem,
} from '@company/contracts';
import { QUALITY_INBOUND_CASE_STATUS_LABELS, PERMISSIONS } from '@company/constants';
import { useAuthStore } from '../../../stores/auth';
import { procurementApi } from '../../../api/procurement';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import InboundInspectionSummary from './InboundInspectionSummary.vue';
import ReceiptLineActionDialog from './ReceiptLineActionDialog.vue';
import InboundInspectionHistoryDialog from './InboundInspectionHistoryDialog.vue';
import InboundInspectionRecord from './InboundInspectionRecord.vue';
const emit = defineEmits<{ changed: [] }>();
const auth = useAuthStore(),
  router = useRouter();
const visible = ref(false),
  lineId = ref(''),
  loading = ref(false),
  readError = ref(false);
const line = ref<ProcurementInboundInspectionDetail | null>(null),
  selectedCase = ref<QualityInboundCaseItem | null>(null);
const actions = ref<InstanceType<typeof ReceiptLineActionDialog>>(),
  history = ref<InstanceType<typeof InboundInspectionHistoryDialog>>();
const read = useLatestReadRequest(() => {
  loading.value = false;
});
const currentCase = computed(
  () =>
    line.value?.cases.find(
      (record) => record.inspection?.id === line.value?.currentRound.inspectionId,
    ) ?? null,
);
const currentInspection = computed(() => currentCase.value?.inspection ?? null);
const roundNoForCase = (record: QualityInboundCaseItem | null): number | undefined => {
  const receiptLine = line.value;
  if (!receiptLine || !record) return undefined;
  if (receiptLine.currentRound.id === record.roundId) return receiptLine.currentRound.roundNo;
  return receiptLine.rounds.find((round) => round.id === record.roundId)?.roundNo;
};
const currentCaseRoundNo = computed(() => roundNoForCase(currentCase.value));
const selectedSourceRoundNo = ref<number>();
const selectedCaseRoundNo = computed(
  () => selectedSourceRoundNo.value ?? roundNoForCase(selectedCase.value),
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
  selectedCase.value = context?.case ?? null;
  selectedSourceRoundNo.value = context?.sourceRoundNo;
  readError.value = false;
  visible.value = true;
  await load();
};
const close = async (): Promise<boolean> => {
  if (actions.value?.locked) {
    EMessage.warning('请先确认本次检验操作结果');
    return false;
  }
  if (actions.value?.visible && !(await actions.value.close())) return false;
  history.value?.close();
  visible.value = false;
  read.invalidate();
  return true;
};
const saved = async (): Promise<void> => {
  selectedCase.value = null;
  selectedSourceRoundNo.value = undefined;
  emit('changed');
  await load();
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
  openedLineId: computed(() => (visible.value ? lineId.value : '')),
  openedCaseId: computed(() => (visible.value ? (selectedCase.value?.id ?? '') : '')),
  locked: computed(() => Boolean(actions.value?.locked)),
});
</script>
<style scoped>
.notice {
  margin-bottom: 16px;
}
.current-action {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin: 12px 0;
}
.current-action {
  padding: 12px;
  background: var(--el-fill-color-light);
  border-left: 3px solid var(--el-color-primary);
}
.current-action strong {
  width: 100%;
}
.current-action span {
  color: var(--el-text-color-primary);
}
.secondary-action {
  margin-bottom: 12px;
}
.selected-record {
  margin: 20px 0;
}
.selected-record strong {
  display: block;
  margin-bottom: 10px;
}
.historical-note {
  margin: 0 0 10px;
  color: var(--el-text-color-regular);
}
</style>
