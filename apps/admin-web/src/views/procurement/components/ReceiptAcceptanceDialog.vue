<template>
  <el-dialog
    v-model="visible"
    title="引用质检并核对来料清单"
    :width="DialogWidth.workbench"
    workbench
    :before-close="beforeClose"
    :close-on-click-modal="false"
  >
    <div v-loading="loading">
      <el-alert
        v-if="stale"
        type="error"
        title="依据已变化或核对失败。输入已保留，请关闭后从当前范围重新核对。"
        :closable="false"
        class="notice"
      />
      <template v-if="line && inspection">
        <ReceiptLineSummary :line="line" />
        <InboundInspectionRecord :inspection="inspection" />
        <el-alert
          v-if="inspectionConsumed > 0"
          type="info"
          :closable="false"
          class="notice"
        >
          本记录已处置量 {{ inspectionConsumed }} {{ line.unit }}，已入或已退事实不重新授权。
          {{
            inspection.inspectionMethod === 'full'
              ? `本次剩余建议量为 max(0, ${inspection.qualifiedQuantity} − ${inspectionConsumed})。`
              : '抽检仍以本次核实剩余总量减原样本不合格数给出保守建议；数量异常须另填依据。'
          }}
        </el-alert>
        <el-alert
          :type="correctedTotal === Number(line.quantities.receivedQuantity) ? 'info' : 'warning'"
          :closable="false"
          class="notice"
        >
          本次定稿实物 {{ quantity ?? '待填写' }} {{ line.unit }}；质检建议可入量
          {{ limit ?? '依据不一致，待核对' }}。 到货总量 {{ line.quantities.receivedQuantity }} →
          {{ Number.isFinite(correctedTotal) ? correctedTotal : '待填写' }}。 已入库
          {{ line.quantities.inboundQuantity }}、已退回
          {{ line.quantities.returnedQuantity }} 保留原事实。
        </el-alert>
        <el-form :disabled="command.locked.value || stale || loading">
          <el-form-item
            label="库管核实本批未处置实物总量"
            required
          >
            <el-input-number
              v-model="quantity"
              :min="0"
              :max="PURCHASE_ORDER_MAX_QUANTITY"
              :precision="0"
              controls-position="right"
            />
          </el-form-item>
          <el-alert
            v-if="quantityMismatch"
            type="warning"
            :closable="false"
            class="notice"
            title="核实数量与原申报或全检总数不一致，请与现场核对，并在下方保存核对说明；原检查事实保持不变。"
          />
          <el-alert
            v-if="overrideRequired"
            type="warning"
            :closable="false"
            class="notice"
          >
            {{
              limit === null
                ? '抽检样本与核实总量不一致，无法计算有效建议量。'
                : `最终可入量超过质检建议 ${inboundTotal - limit}。`
            }}
            库管须填写异常核对或超建议确认依据并承担数量定稿责任，这不代表质检更改了原合格、不合格数。
          </el-alert>
          <el-alert
            v-if="candidates.some((candidate) => Number(candidate.retainedBindingQuantity) > 0)"
            type="info"
            :closable="false"
            class="notice"
          >
            <span
              v-for="candidate in candidates.filter(
                (row) => Number(row.retainedBindingQuantity) > 0,
              )"
              :key="candidate.purchaseOrderLineId"
              class="binding-note"
            >
              {{ candidate.purchaseNo }}：原剩余归属 {{ candidate.retainedBindingQuantity }}
              {{ line.unit }}。
            </span>
          </el-alert>
          <el-table :data="details">
            <el-table-column
              label="采购归属"
              min-width="250"
              ><template #default="{ row }">
                <el-select
                  v-model="row.purchaseOrderLineId"
                  clearable
                  placeholder="待明确补单"
                  @clear="row.purchaseOrderLineId = null"
                >
                  <el-option
                    v-for="candidate in candidates"
                    :key="candidate.purchaseOrderLineId"
                    :value="candidate.purchaseOrderLineId"
                    :label="`${candidate.purchaseNo} · ${candidate.isOriginal ? '原采购行' : '已到货补单'} · 计划 ${candidate.plannedQuantity}${candidate.remainingBindingQuantity === null ? '' : ` · 待首次承接 ${candidate.remainingBindingQuantity}`}`"
                  />
                </el-select> </template
            ></el-table-column>
            <el-table-column
              label="去向"
              width="130"
              ><template #default="{ row }"
                ><el-select
                  v-model="row.disposition"
                  @change="row.returnReason = row.disposition === 'return' ? 'quality' : null"
                >
                  <el-option
                    v-for="value in RECEIPT_ALLOCATION_DISPOSITIONS"
                    :key="value"
                    :value="value"
                    :label="RECEIPT_ALLOCATION_DISPOSITION_LABELS[value]"
                  /> </el-select></template
            ></el-table-column>
            <el-table-column
              label="数量"
              width="165"
              ><template #default="{ row }"
                ><el-input-number
                  v-model="row.quantity"
                  :min="1"
                  :max="PURCHASE_ORDER_MAX_QUANTITY"
                  :precision="0"
                  controls-position="right" /></template
            ></el-table-column>
            <el-table-column
              label="退回原因"
              width="180"
              ><template #default="{ row }"
                ><el-select
                  v-if="row.disposition === 'return'"
                  v-model="row.returnReason"
                >
                  <el-option
                    v-for="reason in RECEIPT_RETURN_REASONS.filter(
                      (value) => value !== 'manual_rejection',
                    )"
                    :key="reason"
                    :value="reason"
                    :label="SUPPLIER_RETURN_REASON_LABELS[reason]"
                  /> </el-select
                ><span v-else>—</span></template
              ></el-table-column
            >
            <el-table-column width="70"
              ><template #default="{ $index }"
                ><el-button
                  link
                  type="danger"
                  @click="details.splice($index, 1)"
                  >删除</el-button
                ></template
              ></el-table-column
            >
          </el-table>
          <div class="allocation-actions">
            <el-button
              :disabled="details.length >= 100"
              @click="
                details.push({
                  purchaseOrderLineId: null,
                  disposition: 'pending',
                  quantity: 1,
                  returnReason: null,
                })
              "
              >增加分配</el-button
            >
            <span
              >全部分配 {{ total }} / {{ quantity ?? '待填写' }}；最终可入库
              {{ inboundTotal }}；质检建议 {{ limit ?? '待核对' }}</span
            >
          </div>
          <p class="hint">
            补单须先正式下单，再选择承接本次实物。尚未下单的超发量保留待处理；补单不再登记第二次到货。整批复检保留已绑定采购归属，请核对新去向；实物总量确有计数更正时，同时核对受影响的采购份额并说明依据。待退回是处置安排，实际交接另行确认。
          </p>
          <el-form-item
            ><el-checkbox v-model="physicalIdentityConfirmed"
              >已核对为本次同批实物，数量差异为计数修正</el-checkbox
            ></el-form-item
          >
          <el-form-item
            v-if="overrideRequired || overrideReason"
            label="异常 / 超建议确认依据"
            :required="overrideRequired"
          >
            <el-input
              v-model="overrideReason"
              type="textarea"
              :rows="3"
              maxlength="2000"
              show-word-limit
            />
          </el-form-item>
          <el-form-item
            label="核对 / 更正说明"
            required
            ><el-input
              v-model="remark"
              type="textarea"
              :rows="3"
              maxlength="2000"
              show-word-limit
          /></el-form-item>
        </el-form>
      </template>
    </div>
    <template #footer
      ><el-button
        :disabled="command.busy.value"
        @click="close"
        >关闭</el-button
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
        :loading="command.busy.value"
        :disabled="!canConfirm"
        @click="confirm"
        >确认正式清单</el-button
      >
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import type { ProcurementReceiptCommandResult } from '@company/contracts';
import {
  RECEIPT_ALLOCATION_DISPOSITIONS,
  RECEIPT_ALLOCATION_DISPOSITION_LABELS,
  RECEIPT_RETURN_REASONS,
  SUPPLIER_RETURN_REASON_LABELS,
  PURCHASE_ORDER_MAX_QUANTITY,
} from '@company/constants';
import { DialogWidth } from '../../../utils/dialog';
import { useReceiptAcceptance } from '../composables/useReceiptAcceptance';
import ReceiptLineSummary from './ReceiptLineSummary.vue';
import InboundInspectionRecord from './InboundInspectionRecord.vue';
const emit = defineEmits<{ saved: [ProcurementReceiptCommandResult] }>();
const {
  visible,
  loading,
  stale,
  remark,
  overrideReason,
  overrideRequired,
  quantityMismatch,
  physicalIdentityConfirmed,
  line,
  inspection,
  inspectionConsumed,
  candidates,
  details,
  quantity,
  limit,
  total,
  inboundTotal,
  correctedTotal,
  canConfirm,
  command,
  open,
  close,
  confirm,
} = useReceiptAcceptance((result) => emit('saved', result));
const beforeClose = () => {
  void close();
};
defineExpose({ open, close, visible, locked: command.locked });
</script>
<style scoped>
.binding-note {
  display: block;
}
.notice {
  margin: 16px 0;
}
.allocation-actions {
  display: flex;
  align-items: center;
  gap: 20px;
  margin: 12px 0;
}
.hint {
  color: #6b7280;
  font-size: 13px;
  line-height: 1.8;
}
.el-input-number {
  width: 145px;
}
</style>
