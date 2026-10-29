<template>
  <el-dialog
    v-model="visible"
    title="作废整张到货登记"
    :width="DialogWidth.lg"
    :before-close="beforeClose"
    :close-on-click-modal="false"
    :show-close="!command.busy.value"
  >
    <div v-loading="loading">
      <el-alert
        v-if="readError"
        title="读取失败，原因已保留；请重新核对后提交。"
        type="error"
        :closable="false"
        class="notice"
      />
      <el-alert
        v-if="stale"
        title="整单明细、处理轮次或作废资格已变化。原因已保留，请关闭后从最新到货单重新核对。"
        type="warning"
        :closable="false"
        class="notice"
      />
      <el-alert
        v-if="command.status.value !== 'idle'"
        :title="submissionRecoveryMessage(command.status.value, '到货记录')"
        type="warning"
        :closable="false"
        class="notice"
      />
      <template v-if="detail">
        <el-descriptions
          :column="2"
          border
          class="notice"
        >
          <el-descriptions-item label="到货单"
            ><strong class="identity-value">{{ detail.receiptNo }}</strong></el-descriptions-item
          >
          <el-descriptions-item label="采购单"
            ><strong class="identity-value">{{ detail.purchaseNo }}</strong></el-descriptions-item
          >
          <el-descriptions-item label="供应商">{{ detail.supplierName }}</el-descriptions-item>
          <el-descriptions-item label="作废范围"
            >整单 {{ detail.voiding.lines.length }} 条明细</el-descriptions-item
          >
        </el-descriptions>
        <InlineHint
          tone="warning"
          class="notice"
        >
          本次作废整张到货登记，全部明细一并处理。已有检验及正式清单保留历史，剩余办理授权失效，原采购状态保持不变。
          仅无真实入库、无真实退回且没有未取消关联补单时可办理。草稿、已下单与已结束的关联补单均会阻断，已取消补单历史不阻断。
        </InlineHint>
        <el-alert
          v-if="eligibility && !eligibility.canVoid"
          :title="eligibility.blockedReason || '当前整单不满足作废条件。'"
          type="warning"
          :closable="false"
          class="notice"
        />
        <el-table
          :data="detail.items"
          row-key="id"
          max-height="300"
          class="notice"
        >
          <el-table-column
            prop="id"
            label="到货行 ID"
            min-width="110"
          >
            <template #default="{ row }"
              ><strong class="identity-value">{{ row.id }}</strong></template
            >
          </el-table-column>
          <el-table-column
            label="物料 / 精确版本"
            min-width="200"
          >
            <template #default="{ row }"
              >{{ row.itemName }} · {{ row.materialVariantCode }}</template
            >
          </el-table-column>
          <el-table-column
            label="本批到货量"
            width="110"
          >
            <template #default="{ row }"
              >{{ row.quantities.receivedQuantity }} {{ row.unit }}</template
            >
          </el-table-column>
          <el-table-column
            label="已入库 / 已退回"
            width="140"
          >
            <template #default="{ row }"
              >{{ row.quantities.inboundQuantity }} /
              {{ row.quantities.returnedQuantity }}</template
            >
          </el-table-column>
        </el-table>
        <el-form
          :disabled="command.locked.value"
          label-width="95px"
          @submit.prevent="confirm"
        >
          <el-form-item
            label="作废原因"
            required
          >
            <el-input
              v-model="reason"
              type="textarea"
              :rows="3"
              maxlength="2000"
              show-word-limit
            />
          </el-form-item>
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
        :disabled="loading || command.locked.value"
        @click="load"
        >重新核对</el-button
      >
      <el-button
        v-if="command.status.value === 'pending'"
        type="danger"
        :loading="command.busy.value"
        @click="command.retry"
        >重试原操作</el-button
      >
      <el-button
        v-else
        type="danger"
        :disabled="!canConfirm"
        :loading="command.busy.value"
        @click="confirm"
        >确认整单作废</el-button
      >
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import type { VoidProcurementReceiptCommandResult } from '@company/contracts';
import InlineHint from '../../../components/InlineHint.vue';
import { submissionRecoveryMessage } from '../../../composables/idempotency/useIdempotentIntent';
import { DialogWidth } from '../../../utils/dialog';
import { useReceiptVoid } from '../composables/useReceiptVoid';

const emit = defineEmits<{ saved: [VoidProcurementReceiptCommandResult] }>();
const {
  visible,
  loading,
  readError,
  stale,
  detail,
  eligibility,
  reason,
  command,
  canConfirm,
  open,
  close,
  load,
  confirm,
} = useReceiptVoid((result) => emit('saved', result));
const beforeClose = (): void => {
  void close();
};
defineExpose({ open, close, visible, locked: command.locked });
</script>
<style scoped>
.identity-value {
  color: var(--el-text-color-primary);
  font-weight: 600;
}
.notice {
  margin-bottom: 16px;
}
.el-table :deep(.cell) {
  overflow-wrap: anywhere;
}
</style>
