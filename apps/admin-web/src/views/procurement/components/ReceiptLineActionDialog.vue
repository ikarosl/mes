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
      <el-alert
        v-if="
          action === 'inspect' &&
          line.scopes.some(
            (range) => range.id === caseRecord?.targetScopeId && range.terminationRootScopeId,
          )
        "
        title="本次复核保留原采购终止约束，检验结论不会恢复入库资格，实物仍按终止待退办理。"
        type="warning"
        :closable="false"
        class="notice"
      />
      <div
        v-loading="loading"
        class="form-body"
      >
        <InboundInspectionFields
          v-if="action === 'inspect' && caseRecord"
          v-model="inspection"
          :case-id="caseRecord.id"
          :covered-quantity="Number(caseRecord.coveredQuantity)"
          :unit="line.unit"
          :disabled="command.locked.value || loading"
          @valid="inspectionValid = $event"
        />
        <el-form
          v-else
          :disabled="command.locked.value || loading"
          label-width="140px"
          @submit.prevent="confirm"
        >
          <template v-if="action === 'correct'">
            <el-alert
              title="只修订原到货同批实物的未处置范围，不能覆盖已入／已退事实，也不能代替新到货或损耗。被调整范围将进入质检复核。"
              type="info"
              :closable="false"
              class="notice"
            />
            <el-table
              :data="adjustments"
              row-key="scope.id"
              ><el-table-column
                prop="scope.id"
                label="未处置范围"
                min-width="180" /><el-table-column
                label="当前状态"
                min-width="160"
                ><template #default="{ row }">{{
                  RECEIPT_SCOPE_DISPOSITION_LABELS[row.scope.disposition as ReceiptScopeDisposition]
                }}</template></el-table-column
              ><el-table-column
                label="原数量"
                width="120"
                ><template #default="{ row }">{{
                  Number(row.scope.quantity)
                }}</template></el-table-column
              ><el-table-column
                label="核实后数量"
                width="200"
                ><template #default="{ row }"
                  ><el-input-number
                    v-model="row.revisedQuantity"
                    :precision="0"
                    :min="0"
                    :max="PURCHASE_ORDER_MAX_QUANTITY"
                    controls-position="right" /></template></el-table-column
            ></el-table>
            <el-form-item label="同批漏录剩余量"
              ><el-input-number
                v-model="newRemainderQuantity"
                :precision="0"
                :min="0"
                :max="PURCHASE_ORDER_MAX_QUANTITY"
                controls-position="right"
              /><span class="hint">仅补核原到货漏录实物，不登记新来货</span></el-form-item
            >
            <el-form-item label="已处置锁定量">{{ disposedQuantity }} {{ line.unit }}</el-form-item>
            <el-form-item label="修订后总实收"
              >{{ correctedQuantity }} {{ line.unit }}</el-form-item
            >
            <el-form-item
              label="实物身份核对"
              required
              ><el-checkbox v-model="physicalIdentityConfirmed"
                >已核实仍为同一次到货、同一供应商实物批次</el-checkbox
              ></el-form-item
            >
            <el-form-item
              label="实收更正原因"
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
            <el-alert
              title="本次将该范围全部剩余待退量一次交还供应商，不支持分次退回。填写实际交接凭据后确认。"
              type="warning"
              :closable="false"
              class="notice"
            />
            <el-form-item label="本次全部退回量"
              >{{ Number(scope?.quantity ?? 0) }} {{ line.unit }}</el-form-item
            >
            <el-form-item
              label="实际交接时间"
              required
              ><el-date-picker
                v-model="returnedAt"
                type="datetime"
                value-format="YYYY-MM-DDTHH:mm:ssZ"
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
            <el-alert
              :title="
                action === 'review'
                  ? '确认发起后，所选数量立即进入显式复核中，暂停入库和实际退回；其他未受影响范围继续办理。'
                  : '指定采购终止待退保留原检验结论，仅改变未处置范围的后续办理资格，不表示已实际退回。'
              "
              type="warning"
              :closable="false"
              class="notice"
            />
            <el-form-item label="来源范围"
              >{{ scope?.id }} ·
              {{ scope ? RECEIPT_SCOPE_DISPOSITION_LABELS[scope.disposition] : '' }}</el-form-item
            >
            <el-form-item
              label="本次范围数量"
              required
              ><el-input-number
                v-model="quantity"
                :precision="0"
                :min="1"
                :max="Number(scope?.quantity ?? 0)"
                controls-position="right"
              /><span class="hint">可以只选择原范围的一部分</span></el-form-item
            >
            <el-form-item
              v-if="action === 'review'"
              label="办理类型"
              required
              ><el-radio-group v-model="caseType"
                ><el-radio
                  v-if="!scope?.inspectionId"
                  value="initial"
                  >{{ QUALITY_INBOUND_CASE_TYPE_LABELS.initial }}</el-radio
                ><el-radio value="reinspection">{{
                  QUALITY_INBOUND_CASE_TYPE_LABELS.reinspection
                }}</el-radio
                ><el-radio value="inspection_correction">{{
                  QUALITY_INBOUND_CASE_TYPE_LABELS.inspection_correction
                }}</el-radio></el-radio-group
              ></el-form-item
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
        >{{
          action === 'review'
            ? '确认发起检验 / 复检'
            : action === 'inspect'
              ? '确认并追加检验结论'
              : action === 'return'
                ? '确认全部已退回供应商'
                : action === 'correct'
                  ? '提交实收修订并复核'
                  : '确认指定待退'
        }}</el-button
      ></template
    >
  </el-dialog>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import type { ProcurementReceiptCommandResult, ReceiptScopeDisposition } from '@company/contracts';
import {
  PURCHASE_ORDER_MAX_QUANTITY,
  RECEIPT_SCOPE_DISPOSITION_LABELS,
  QUALITY_INBOUND_CASE_TYPE_LABELS,
} from '@company/constants';
import { DialogWidth } from '../../../utils/dialog';
import { useReceiptLineAction } from '../composables/useReceiptLineAction';
import ReceiptLineSummary from './ReceiptLineSummary.vue';
import InboundInspectionFields from './InboundInspectionFields.vue';
const emit = defineEmits<{ saved: [ProcurementReceiptCommandResult] }>();
const {
  visible,
  loading,
  stale,
  action,
  line,
  scope,
  caseRecord,
  reason,
  quantity,
  handoverEvidence,
  returnedAt,
  returnRemark,
  caseType,
  adjustments,
  newRemainderQuantity,
  physicalIdentityConfirmed,
  inspection,
  inspectionValid,
  disposedQuantity,
  correctedQuantity,
  canConfirm,
  command,
  open,
  close,
  confirm,
} = useReceiptLineAction((result) => emit('saved', result));
const title = computed(() =>
  action.value === 'correct'
    ? '更正实收并提交质检复核'
    : action.value === 'return'
      ? '确认实际退回供应商'
      : action.value === 'terminate'
        ? '指定采购终止待退'
        : action.value === 'review'
          ? '主动发起检验 / 复检'
          : '填写检验结论',
);
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
