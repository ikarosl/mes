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
          ><el-descriptions-item label="供应商">{{ detail.supplierName }}</el-descriptions-item
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
            :label="`${line.lineNo}. ${line.itemCode}`"
          >
            <ReceiptLineSummary :line="line" />
            <div class="actions">
              <el-button
                :disabled="blocked"
                @click="actionDialog?.open(line, 'correct')"
                >更正实收</el-button
              ><el-button
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
                >仓管确认入库</el-button
              ><el-button @click="history?.open(line.id, 'revisions', line)"
                >实收修订 {{ line.historyTotals.revisions }}</el-button
              ><el-button @click="history?.open(line.id, 'cases', line)"
                >检验历史 {{ line.historyTotals.cases }}</el-button
              ><el-button @click="history?.open(line.id, 'returns', line)"
                >退回记录 {{ line.historyTotals.returns }}</el-button
              ><el-button @click="history?.open(line.id, 'inbounds', line)"
                >入库记录 {{ line.historyTotals.inbounds }}</el-button
              >
            </div>
            <ReceiptLineScopes
              :line="line"
              :quality="false"
              :disabled="blocked"
              @return="actionDialog?.open(line, 'return', $event)"
              @terminate="actionDialog?.open(line, 'terminate', $event)"
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
</template>
<script setup lang="ts">
import { computed, onActivated, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { ProcurementReceiptDetail } from '@company/contracts';
import { PERMISSIONS } from '@company/constants';
import { procurementApi } from '../../../api/procurement';
import { useAuthStore } from '../../../stores/auth';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { EMessage } from '../../../utils/message';
import ReceiptLineSummary from './ReceiptLineSummary.vue';
import ReceiptLineScopes from './ReceiptLineScopes.vue';
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
const actionDialog = ref<InstanceType<typeof ReceiptLineActionDialog>>(),
  history = ref<InstanceType<typeof ReceiptHistoryDialog>>();
const read = useLatestReadRequest(() => {
  loading.value = false;
});
const blocked = computed(
  () => loading.value || readError.value || Boolean(actionDialog.value?.visible),
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
  if (actionDialog.value?.locked || history.value?.locked) {
    EMessage.warning('请先确认当前处置结果');
    return false;
  }
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
const goQuality = async (lineId: string): Promise<void> => {
  if (await close())
    await router.push({ name: 'quality-inbound-inspections', query: { receiptLineId: lineId } });
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
  locked: computed(() => Boolean(actionDialog.value?.locked || history.value?.locked)),
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
