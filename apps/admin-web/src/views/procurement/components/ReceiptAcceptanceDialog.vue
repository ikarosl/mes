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
        v-if="readError"
        type="error"
        :title="
          line
            ? '依据核对失败，输入已保留；请关闭后重新核对。'
            : '定稿依据读取失败，请重新读取或关闭。'
        "
        :closable="false"
        class="notice"
      />
      <el-alert
        v-else-if="stale"
        type="error"
        title="依据已变化或核对失败。输入已保留，请关闭后从当前范围重新核对。"
        :closable="false"
        class="notice"
      />
      <template v-if="line && inspection">
        <el-descriptions
          :column="2"
          border
          size="small"
          class="acceptance-identity"
        >
          <el-descriptions-item label="本批物料 / 版本">
            <strong>{{ line.itemName }}</strong> · {{ line.itemCode }} ·
            {{ line.materialVariantCode }}
          </el-descriptions-item>
          <el-descriptions-item label="供应商 / 批号">
            {{ line.supplierName }} · {{ line.supplierBatchCode || '未提供批号' }}
          </el-descriptions-item>
          <el-descriptions-item label="来源采购">
            {{ line.purchaseNo }} · 采购行 ID：{{ line.purchaseOrderLineId }}
          </el-descriptions-item>
          <el-descriptions-item label="当前轮次">
            第 {{ line.currentRound.roundNo }} 轮 ·
            {{ RECEIPT_ROUND_STATUS_LABELS[line.currentRound.status] }} · 到货明细 ID：{{ line.id }}
          </el-descriptions-item>
        </el-descriptions>
        <el-alert
          v-if="line.quantities.hasOpenReview"
          type="warning"
          title="当前存在质量阻断，整批暂停正常定稿。请刷新依据并核对当前轮。"
          :closable="false"
          class="notice"
        />
        <ReceiptQuantityOverview :line="line" />
        <div class="evidence-toolbar">
          <div class="evidence-summary">
            <span>
              <strong>检验依据：</strong>
              {{ inspectionRoundNo === undefined ? '' : `第 ${inspectionRoundNo} 轮 · `
              }}{{ QUALITY_INSPECTION_METHOD_LABELS[inspection.inspectionMethod] }} ·
              {{ formatDateTimeForDisplay(inspection.inspectedAt) }}
            </span>
            <span>
              合格
              <InspectionQuantity
                :value="inspection.qualifiedQuantity"
                kind="qualified"
              />
              · 不合格
              <InspectionQuantity
                :value="inspection.unqualifiedQuantity"
                kind="unqualified"
              />
              {{ line.unit }}
            </span>
          </div>
          <el-button
            type="primary"
            plain
            :icon="Document"
            :aria-expanded="evidenceExpanded"
            :aria-controls="evidenceId"
            @click="evidenceExpanded = !evidenceExpanded"
          >
            {{ evidenceExpanded ? '收起完整检验凭据' : '查看完整检验凭据' }}
            <el-icon class="evidence-toggle-icon">
              <ArrowUp v-if="evidenceExpanded" />
              <ArrowDown v-else />
            </el-icon>
          </el-button>
        </div>
        <div
          v-show="evidenceExpanded"
          :id="evidenceId"
          class="evidence-details"
        >
          <InboundInspectionRecord
            :inspection="inspection"
            :round-no="inspectionRoundNo"
          />
        </div>
        <el-form
          :disabled="command.locked.value || stale || loading"
          @submit.prevent
        >
          <el-form-item
            label="本批到货总量修正"
            :error="receivedQuantityError"
            required
            class="received-quantity-field"
          >
            <el-input
              v-model="receivedQuantityInput"
              inputmode="numeric"
              :aria-invalid="!!receivedQuantityError"
              class="received-quantity-input"
            />
            <span class="quantity-unit">{{ line.unit }}</span>
          </el-form-item>
          <InlineHint class="received-quantity-hint">
            本轮待分配 = 到货总量 {{ correctedTotal ?? '待核对' }} − 已入库
            {{ line.quantities.inboundQuantity }} − 已退回 {{ line.quantities.returnedQuantity }} =
            <strong>{{ quantity ?? '待核对' }} {{ line.unit }}</strong
            >。
            <div v-if="receivedQuantityChanged">
              {{
                `按本次核对，本批到货量将由${line.quantities.receivedQuantity}${line.unit}更正为${correctedTotal}${line.unit}。`
              }}
            </div>
          </InlineHint>
          <InlineHint
            tone="info"
            class="inspection-suggestion-hint"
          >
            <template v-if="inspection.inspectionMethod === 'full'">
              <strong>同一检验建议可入：</strong>全检 {{ inspection.inspectedQuantity }} − 已入库
              {{ inspectionExecution.inboundQuantity }} − 其他已退回
              {{ inspectionExecution.otherReturnedQuantity }} − MAX(质量已退回
              {{ inspectionExecution.qualityReturnedQuantity }}，不合格
              {{ inspection.unqualifiedQuantity }})
              <template v-if="limit === null">；<strong>建议待核对</strong></template>
              <template v-else-if="fullLimitBeforeFloor !== null && fullLimitBeforeFloor < 0">
                = {{ fullLimitBeforeFloor }}，按 0 取值 <strong>{{ limit }} {{ line.unit }}</strong>
              </template>
              <template v-else
                >= <strong>{{ limit }} {{ line.unit }}</strong></template
              >
            </template>
            <template v-else>
              <strong>抽检建议可入：</strong>本轮剩余实物数量 {{ quantity ?? '待核对' }} −
              样本不合格
              {{ inspection.unqualifiedQuantity }}
              <template v-if="limit !== null"
                >= <strong>{{ limit }} {{ line.unit }}</strong></template
              >
              <template v-else>；<strong>建议待核对</strong></template>
            </template>
          </InlineHint>
          <el-alert
            v-if="quantityMismatch"
            type="warning"
            :closable="false"
            class="notice"
            title="到货总量与原记录不一致，或本轮剩余实物数量与全检依据不一致，请与现场核对，并在下方保存核对说明；原检查事实保持不变。"
          />
          <InlineHint
            v-if="overrideRequired"
            tone="warning"
            class="override-hint"
          >
            <template v-if="limit === null">
              本轮建议可入无法计算：本轮剩余实物数量 {{ quantity }}、检验检查
              {{ inspection.inspectedQuantity }}、不合格 {{ inspection.unqualifiedQuantity }}
              {{ line.unit }}；请核对并填写异常依据。
            </template>
            <template v-else>
              草稿可入 {{ inboundTotal }} − 本轮建议可入 {{ limit }} = 超出
              <strong>{{ inboundTotal - limit }}</strong> {{ line.unit }}；请填写超建议确认依据。
            </template>
          </InlineHint>
          <el-table
            :data="details"
            class="allocation-table"
          >
            <el-table-column
              label="去向"
              min-width="180"
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
              width="190"
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
              min-width="240"
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
                  disposition: 'pending',
                  quantity: 1,
                  returnReason: null,
                })
              "
              >增加分配</el-button
            >
            <span :class="{ 'allocation-mismatch': quantity !== undefined && total !== quantity }">
              已分配 {{ total }} / 应处理 {{ quantity ?? '待填写' }} {{ line.unit }}；差额
              {{ quantity === undefined ? '待填写' : quantity - total }} {{ line.unit }}
            </span>
          </div>
          <InlineHint class="allocation-help">
            待退是去向安排，实际交接另行确认；未落实量留待处理，计数更正须说明差异依据。
          </InlineHint>
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
        :disabled="loading || command.locked.value"
        @click="line ? check() : loadContext()"
        >核对当前依据</el-button
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
import { computed, ref, useId, watch } from 'vue';
import { ArrowDown, ArrowUp, Document } from '@element-plus/icons-vue';
import type { ProcurementReceiptCommandResult } from '@company/contracts';
import {
  RECEIPT_ALLOCATION_DISPOSITIONS,
  RECEIPT_ALLOCATION_DISPOSITION_LABELS,
  RECEIPT_RETURN_REASONS,
  SUPPLIER_RETURN_REASON_LABELS,
  PURCHASE_ORDER_MAX_QUANTITY,
  RECEIPT_ROUND_STATUS_LABELS,
  QUALITY_INSPECTION_METHOD_LABELS,
} from '@company/constants';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateTimeForDisplay } from '../../../utils/date';
import InlineHint from '../../../components/InlineHint.vue';
import { useReceiptAcceptance } from '../composables/useReceiptAcceptance';
import InboundInspectionRecord from './InboundInspectionRecord.vue';
import InspectionQuantity from '../../quality/components/InspectionQuantity.vue';
import ReceiptQuantityOverview from './ReceiptQuantityOverview.vue';
const emit = defineEmits<{ saved: [ProcurementReceiptCommandResult] }>();
const {
  visible,
  loading,
  readError,
  stale,
  remark,
  overrideReason,
  overrideRequired,
  quantityMismatch,
  physicalIdentityConfirmed,
  line,
  inspection,
  inspectionExecution,
  fullLimitBeforeFloor,
  details,
  quantity,
  receivedQuantityInput,
  receivedQuantityError,
  receivedQuantityChanged,
  limit,
  total,
  inboundTotal,
  correctedTotal,
  canConfirm,
  command,
  open,
  close,
  confirm,
  check,
  loadContext,
} = useReceiptAcceptance((result) => emit('saved', result));
const evidenceExpanded = ref(false);
const evidenceId = useId();
watch(visible, (isVisible) => {
  if (isVisible) evidenceExpanded.value = false;
});
const inspectionRoundNo = computed(() => line.value?.inspectionSourceRoundNo ?? undefined);
const beforeClose = () => {
  void close();
};
defineExpose({ open, close, visible, locked: command.locked });
</script>
<style scoped>
.notice {
  margin: 16px 0;
}
.inspection-suggestion-hint,
.override-hint {
  margin: 12px 0 16px;
}
.acceptance-identity {
  margin-bottom: 8px;
}
.evidence-toolbar,
.evidence-summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 16px;
  font-size: 14px;
}
.evidence-toolbar {
  justify-content: space-between;
  margin-bottom: 16px;
}
.evidence-toggle-icon {
  margin-left: 8px;
}
.evidence-details {
  padding: 12px;
  margin-bottom: 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
}
.allocation-actions {
  display: flex;
  align-items: center;
  gap: 20px;
  margin: 12px 0;
}
.allocation-mismatch {
  color: var(--el-color-warning-dark-2);
  font-weight: 600;
}
.allocation-help {
  margin: 8px 0 16px;
}
.received-quantity-field {
  margin-bottom: 20px;
}
.received-quantity-input {
  width: 145px;
}
.quantity-unit {
  margin-left: 8px;
}
.received-quantity-hint {
  margin-bottom: 12px;
}
.el-input-number {
  width: 145px;
}
</style>
