<template>
  <el-dialog
    v-model="visible"
    :title="title"
    :width="DialogWidth.lg"
    :before-close="beforeClose"
    :close-on-click-modal="false"
    :show-close="!command.busy.value"
  >
    <div v-loading="loading">
      <el-alert
        v-if="readError"
        title="读取失败，请重新加载后办理。"
        type="error"
        :closable="false"
      />
      <el-alert
        v-if="command.status.value !== 'idle'"
        title="操作结果尚未确认，保留原请求，请重试原操作或先核对记录。"
        type="warning"
        :closable="false"
      />
      <template v-if="detail">
        <el-descriptions
          :column="2"
          border
        >
          <el-descriptions-item label="采购单">{{ detail.purchaseNo }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{
            PURCHASE_ORDER_STATUS_LABELS[detail.status]
          }}</el-descriptions-item>
          <el-descriptions-item
            v-if="actionLine"
            label="物料"
            :span="2"
            >{{ actionLine.itemCode }} · {{ actionLine.itemName }} ·
            {{ actionLine.materialVariantCode }}</el-descriptions-item
          >
          <el-descriptions-item
            v-if="actionLine"
            label="实际供应商"
            >{{ actionLine.supplierName }}</el-descriptions-item
          >
          <el-descriptions-item
            v-if="actionLine"
            label="采购量"
            >{{ actionLine.plannedQuantity }} {{ actionLine.unit }}</el-descriptions-item
          >
          <el-descriptions-item
            v-if="actionLine"
            label="累计实收"
            >{{ actionLine.quantities.receivedQuantity }}</el-descriptions-item
          >
          <el-descriptions-item
            v-if="actionLine"
            label="正式可入＋已入"
            >{{ actionLine.quantities.approvedQuantity }}</el-descriptions-item
          >
          <el-descriptions-item
            v-if="actionLine"
            label="待处理 / 待退"
            >{{ actionLine.quantities.undeterminedQuantity }} /
            {{ actionLine.quantities.pendingReturnQuantity }}</el-descriptions-item
          >
          <el-descriptions-item
            v-if="actionLine"
            label="实际质量退回"
            >{{ actionLine.quantities.qualityReturnedQuantity }}</el-descriptions-item
          >
        </el-descriptions>
        <el-table
          v-if="mode === 'place'"
          :data="detail.items"
          max-height="300"
        >
          <el-table-column
            prop="supplierName"
            label="实际供应商"
            min-width="140"
          />
          <el-table-column
            prop="materialVariantCode"
            label="物料精确版本"
            min-width="180"
          />
          <el-table-column
            prop="plannedQuantity"
            label="采购量"
            width="100"
          />
          <el-table-column
            prop="unit"
            label="单位"
            width="70"
          />
        </el-table>
        <p v-if="mode === 'place'">确认下单后，各物料行的供应商、版本、数量和来源将锁定。</p>
        <p v-else-if="mode === 'cancel'">
          仅从未到货、未承接正式分配且没有已结束行的采购单可整单取消。
        </p>
        <p v-else>
          结束此行后停止新增到货；已有实物的检验、入库和退回继续办理。整单状态由全部物料行汇总。
        </p>
        <el-alert
          v-if="actionStale"
          title="状态或数量依据已变化，请关闭后重新选择操作；本次输入已保留。"
          type="warning"
          :closable="false"
        />
        <el-alert
          v-else-if="!eligible && !loading"
          title="当前状态不满足该操作条件。已有到货的采购请逐行结束。"
          type="warning"
          :closable="false"
        />
        <el-form
          v-if="mode !== 'place'"
          :disabled="command.locked.value"
          label-width="95px"
          @submit.prevent="confirmAction"
        >
          <el-form-item
            v-if="mode === 'close'"
            label="结束方式"
          >
            <el-radio-group v-model="closeReason">
              <el-radio
                v-for="value in actionLine?.allowedCloseReasons ?? []"
                :key="value"
                :value="value"
                >{{ PURCHASE_ORDER_CLOSURE_REASON_LABELS[value] }}</el-radio
              >
            </el-radio-group>
          </el-form-item>
          <el-form-item
            label="原因"
            required
            ><el-input
              v-model="reason"
              type="textarea"
              :rows="3"
              maxlength="2000"
              show-word-limit
          /></el-form-item>
        </el-form>
      </template>
    </div>
    <template #footer>
      <el-button
        :disabled="command.busy.value"
        @click="close"
        >关闭</el-button
      >
      <el-button
        v-if="readError"
        :disabled="command.locked.value"
        @click="retryLoad"
        >重新加载</el-button
      >
      <el-button
        v-if="command.status.value === 'pending'"
        type="primary"
        :loading="command.busy.value"
        @click="command.retry"
        >重试原操作</el-button
      >
      <el-button
        v-else
        type="primary"
        :disabled="!actionValid"
        :loading="command.busy.value"
        @click="confirmAction"
        >{{ mode === 'place' ? '确认下单' : '确认办理' }}</el-button
      >
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { PurchaseOrderDetail } from '@company/contracts';
import {
  PURCHASE_ORDER_CLOSURE_REASON_LABELS,
  PURCHASE_ORDER_STATUS_LABELS,
} from '@company/constants';
import { DialogWidth } from '../../../utils/dialog';
import { usePurchaseOrderActions } from '../composables/usePurchaseOrderActions';
const emit = defineEmits<{ changed: [string, PurchaseOrderDetail | null] }>();
type Action = 'place' | 'cancel' | 'close';
const initializing = ref(false);
const mode = ref<Action>('place'),
  lineId = ref<string>();
const {
  visible,
  detail,
  loading,
  readError,
  command,
  action,
  actionLine,
  actionStale,
  reason,
  closeReason,
  actionValid,
  eligible,
  open: openDetail,
  close,
  load,
  startAction,
  confirmAction,
} = usePurchaseOrderActions((id, result) => emit('changed', id, result));
const title = computed(() =>
  mode.value === 'place'
    ? '正式下单'
    : mode.value === 'cancel'
      ? '取消整张采购单'
      : '结束采购物料行',
);
const initialize = () => {
  if (!initializing.value || readError.value || loading.value || !visible.value || !detail.value)
    return;
  initializing.value = false;
  startAction(
    mode.value,
    detail.value?.items.find((line) => line.id === lineId.value),
  );
};
const open = async (id: string, action: Action, targetLineId?: string) => {
  if (command.locked.value) return;
  initializing.value = true;
  mode.value = action;
  lineId.value = targetLineId;
  await openDetail(id);
  initialize();
};
const retryLoad = async () => {
  initializing.value = !action.value;
  await load();
  initialize();
};
watch(() => [detail.value, loading.value], initialize);
const beforeClose = () => {
  void close();
};
defineExpose({ open, close, visible, locked: command.locked });
</script>
<style scoped>
.el-alert,
.el-descriptions,
.el-table {
  margin-bottom: 16px;
}
p {
  line-height: 1.7;
  color: #606266;
}
</style>
