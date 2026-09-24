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
        <InboundInspectionFields
          v-if="action === 'inspect' && caseRecord"
          v-model="inspection"
          :case-id="caseRecord.id"
          :covered-quantity="Number(caseRecord.coveredQuantity)"
          :unit="line.unit"
          :disabled="command.locked.value || loading || stale"
          @valid="inspectionValid = $event"
        />
        <el-form
          v-else
          :disabled="command.locked.value || loading || stale"
          label-width="140px"
          @submit.prevent="confirm"
        >
          <template v-if="action === 'correct'">
            <el-alert
              :title="
                rejected
                  ? '更正本次到货核实总量后，旧拒收决定退出当前效力，剩余实物回到待检。若仍需拒收，请重新办理人工拒收；已入／已退事实保留。'
                  : '填写本次到货核实总量。全部未处置分配将被替代，剩余实物重新待检；归零不产生零量检验。已入／已退事实保留，不能代替新到货或真实损耗。'
              "
              type="info"
              :closable="false"
              class="notice"
            />
            <el-form-item
              label="更正后本次到货总量"
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
            <el-form-item label="已入 / 已退锁定量"
              >{{ disposedQuantity }} {{ line.unit }}</el-form-item
            >
            <el-form-item label="更正后未处置量"
              >{{ Number.isFinite(correctedRemaining) ? correctedRemaining : '待填写' }}
              {{ line.unit }}</el-form-item
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
              >{{ Number(allocation?.remainingQuantity ?? 0) }} {{ line.unit }}</el-form-item
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
                  ? '确认发起后，本批全部剩余实物进入检验中，原可入及待退分配一并暂停。抽检也判断整批资格，样本不是独立处置范围。'
                  : action === 'revoke'
                    ? '撤销本轮拒收决定，剩余实物重新待检。旧拒收记录保留，不直接恢复旧可入分配；请重新质检和定稿。'
                    : '人工拒收本批全部剩余实物，原入库资格及尚未完成检验立即失效。拒收不等于质检不合格或已经退回；交接后另行确认实际退回。'
              "
              type="warning"
              :closable="false"
              class="notice"
            />
            <el-form-item label="本批剩余实物"
              >{{ remainingQuantity }} {{ line.unit }}</el-form-item
            >
            <el-form-item
              v-if="action === 'review' && caseType !== 'initial'"
              label="办理原因"
              required
            >
              <el-radio-group v-model="caseType">
                <el-radio value="reinspection">{{
                  QUALITY_INBOUND_CASE_TYPE_LABELS.reinspection
                }}</el-radio>
                <el-radio value="inspection_correction">{{
                  QUALITY_INBOUND_CASE_TYPE_LABELS.inspection_correction
                }}</el-radio>
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
          </template>
          <template v-if="ownershipRequired">
            <el-alert
              type="warning"
              :closable="false"
              class="notice"
              title="本批剩余总量与原采购分配不同，请逐项核对原单和已绑定补单的数量，在原因中说明差异。不能改为新的采购归属。"
            />
            <el-table :data="ownership">
              <el-table-column
                prop="purchaseNo"
                label="原采购归属"
                min-width="200"
              />
              <el-table-column
                prop="previousQuantity"
                label="原剩余数量"
                width="140"
              />
              <el-table-column
                label="本次核实数量"
                min-width="200"
              >
                <template #default="{ row }">
                  <el-input-number
                    v-model="row.quantity"
                    :min="0"
                    :max="PURCHASE_ORDER_MAX_QUANTITY"
                    :precision="0"
                    controls-position="right"
                  />
                </template>
              </el-table-column>
            </el-table>
            <p class="hint">
              归属合计 {{ Number.isFinite(ownershipTotal) ? ownershipTotal : '待填写' }} /
              本批未处置总量 {{ ownershipTarget }} {{ line.unit }}。各项可填 0，合计必须一致。
            </p>
          </template>
          <el-alert
            v-else-if="action === 'correct' && ownershipChanged"
            type="info"
            :closable="false"
            title="本批已有补单归属。普通实收更正后先重新检验，原归属保留追溯；库管后续定稿时根据核实总量重新确认原单和补单份额。"
          />
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
              ? '保存检验记录'
              : action === 'return'
                ? '确认全部已退回供应商'
                : action === 'correct'
                  ? '确认整批实收更正'
                  : action === 'revoke'
                    ? '撤销拒收并重新办理'
                    : '确认人工拒收'
        }}</el-button
      ></template
    >
  </el-dialog>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import type { ProcurementReceiptCommandResult } from '@company/contracts';
import { PURCHASE_ORDER_MAX_QUANTITY, QUALITY_INBOUND_CASE_TYPE_LABELS } from '@company/constants';
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
  allocation,
  caseRecord,
  reason,
  handoverEvidence,
  returnedAt,
  returnRemark,
  caseType,
  physicalIdentityConfirmed,
  inspection,
  inspectionValid,
  disposedQuantity,
  correctedQuantity,
  remainingQuantity,
  correctedRemaining,
  rejected,
  ownership,
  ownershipRequired,
  ownershipChanged,
  ownershipTarget,
  ownershipTotal,
  canConfirm,
  command,
  open,
  close,
  confirm,
} = useReceiptLineAction((result) => emit('saved', result));
const title = computed(() =>
  action.value === 'correct'
    ? '更正本次到货核实总量'
    : action.value === 'return'
      ? '确认实际退回供应商'
      : action.value === 'revoke'
        ? '撤销人工拒收并重新办理'
        : action.value === 'reject'
          ? '人工拒收整批剩余实物'
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
