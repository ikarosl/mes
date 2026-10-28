<template>
  <el-dialog
    v-model="visible"
    :title="title"
    :width="DialogWidth.workbench"
    workbench
    :before-close="beforeClose"
    :close-on-click-modal="false"
    :show-close="!command.busy.value"
  >
    <template v-if="line">
      <el-alert
        v-if="stale"
        title="处置依据已变化或读取失败。当前输入已保留，请关闭后从最新范围重新办理；不会自动替换旧版本。"
        type="warning"
        :closable="false"
        class="notice"
      />
      <el-alert
        v-if="command.status.value !== 'idle'"
        title="操作结果尚未确认，当前输入已锁定。请重试原操作或先核对处置记录。"
        type="warning"
        :closable="false"
        class="notice"
      />
      <ReceiptLineSummary :line="line" />
      <div
        v-loading="loading"
        class="form-body"
      >
        <el-form
          :disabled="command.locked.value || loading || stale"
          label-width="180px"
          @submit.prevent="confirm"
        >
          <template v-if="action === 'correct'">
            <InlineHint class="notice">
              {{
                rejected
                  ? '填写同一次到货的正确总量。更正后，原拒收决定不再适用，剩余实物需重新检验；如需拒收，请重新办理。已入库、已退回记录不变；本操作不能代替新增到货或登记真实损耗。'
                  : '填写同一次到货的正确总量。尚未入库或退回的实物需重新检验并确认去向；无剩余实物时不发起检验。已入库、已退回记录不变；本操作不能代替新增到货或登记真实损耗。'
              }}
            </InlineHint>
            <el-form-item
              label="更正后到货量"
              required
            >
              <el-input-number
                v-model="correctedQuantity"
                :precision="0"
                :min="disposedQuantity"
                :max="PURCHASE_ORDER_MAX_QUANTITY"
                controls-position="right"
              />
            </el-form-item>
            <el-form-item label="已入库与已退回合计"
              ><strong>{{ disposedQuantity }} {{ line.unit }}</strong></el-form-item
            >
            <el-form-item label="更正后尚未入库或退回"
              ><strong>{{
                Number.isFinite(correctedRemaining)
                  ? `${correctedRemaining} ${line.unit}`
                  : '待填写'
              }}</strong></el-form-item
            >
            <el-form-item
              label="实物身份核对"
              required
              ><el-checkbox v-model="physicalIdentityConfirmed"
                >已核实仍为同一次到货、同一供应商实物批次</el-checkbox
              ></el-form-item
            >
            <el-form-item
              label="到货量更正原因"
              required
              ><el-input
                v-model="reason"
                type="textarea"
                :rows="3"
                maxlength="2000"
                show-word-limit
            /></el-form-item>
          </template>
          <template v-else-if="action === 'return'">
            <InlineHint
              tone="warning"
              class="notice"
            >
              本次将该范围全部剩余待退量一次交还供应商，不支持分次退回。填写实际交接凭据后确认。
            </InlineHint>
            <el-form-item label="本次全部退回量"
              ><strong>{{
                allocation ? `${Number(allocation.remainingQuantity)} ${line.unit}` : '待核对'
              }}</strong></el-form-item
            >
            <el-form-item
              label="实际交接时间"
              required
              ><el-date-picker
                :model-value="toBeijingDateTimeInputValue(returnedAt)"
                type="datetime"
                value-format="YYYY-MM-DD HH:mm:ss"
                @update:model-value="returnedAt = fromBeijingDateTimeInputValue($event)"
            /></el-form-item>
            <el-form-item
              label="交接凭据"
              required
              ><el-input
                v-model="handoverEvidence"
                type="textarea"
                :rows="2"
                maxlength="2000"
                show-word-limit
            /></el-form-item>
            <el-form-item label="备注"
              ><el-input
                v-model="returnRemark"
                maxlength="2000"
            /></el-form-item>
          </template>
          <template v-else>
            <InlineHint
              tone="warning"
              class="notice"
            >
              {{
                action === 'revoke'
                  ? '撤销本轮拒收决定，剩余实物重新待检。旧拒收记录保留，不直接恢复旧可入分配；请重新质检和定稿。'
                  : '人工拒收本批全部剩余实物，原入库资格及尚未完成检验立即失效。拒收不等于质检不合格或已经退回；交接后另行确认实际退回。'
              }}
            </InlineHint>
            <el-form-item label="本批剩余实物"
              ><strong>{{ remainingQuantity }} {{ line.unit }}</strong></el-form-item
            >
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
          </template>
        </el-form>
      </div>
    </template>
    <template #footer
      ><el-button
        :disabled="command.busy.value"
        @click="close"
        >关闭</el-button
      ><el-button
        :disabled="loading || command.locked.value"
        @click="check()"
        >核对当前依据</el-button
      ><el-button
        v-if="command.status.value === 'pending'"
        type="primary"
        :loading="command.busy.value"
        @click="command.retry"
        >重试原操作</el-button
      ><el-button
        v-else
        type="primary"
        :loading="command.busy.value"
        :disabled="!canConfirm"
        @click="confirm"
        >{{ confirmLabel }}</el-button
      ></template
    >
  </el-dialog>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import type { ProcurementReceiptCommandResult } from '@company/contracts';
import { PURCHASE_ORDER_MAX_QUANTITY } from '@company/constants';
import { DialogWidth } from '../../../utils/dialog';
import { fromBeijingDateTimeInputValue, toBeijingDateTimeInputValue } from '../../../utils/date';
import InlineHint from '../../../components/InlineHint.vue';
import { useReceiptLineAction } from '../composables/useReceiptLineAction';
import ReceiptLineSummary from './ReceiptLineSummary.vue';
const emit = defineEmits<{ saved: [ProcurementReceiptCommandResult] }>();
const {
  visible,
  loading,
  stale,
  action,
  line: sourceLine,
  allocation,
  reason,
  handoverEvidence,
  returnedAt,
  returnRemark,
  physicalIdentityConfirmed,
  disposedQuantity,
  correctedQuantity,
  remainingQuantity,
  correctedRemaining,
  rejected,
  canConfirm,
  command,
  open,
  close,
  check,
  confirm,
} = useReceiptLineAction((result) => emit('saved', result));
const line = computed(() =>
  sourceLine.value && 'allocations' in sourceLine.value ? sourceLine.value : null,
);
const title = computed(() => {
  if (action.value === 'correct') return '更正到货量';
  if (action.value === 'return') return '确认实际退回供应商';
  if (action.value === 'revoke') return '撤销人工拒收并重新办理';
  return '人工拒收整批剩余实物';
});
const confirmLabel = computed(() => {
  if (action.value === 'return') return '确认全部已退回供应商';
  if (action.value === 'correct') return '确认更正到货量';
  if (action.value === 'revoke') return '撤销拒收并重新办理';
  return '确认人工拒收';
});
const beforeClose = (): void => {
  void close();
};
defineExpose({ open, close, visible, locked: command.locked });
</script>
<style scoped>
.notice {
  margin-bottom: 16px;
}
.form-body {
  margin-top: 20px;
}
.hint {
  margin-left: 12px;
  color: #6b7280;
  font-size: 13px;
}
.el-table {
  margin-bottom: 18px;
}
</style>
