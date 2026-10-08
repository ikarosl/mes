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
        <el-descriptions
          :column="3"
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
          <el-descriptions-item label="当前轮次">
            第 {{ line.currentRound.roundNo }} 轮 ·
            {{ RECEIPT_ROUND_STATUS_LABELS[line.currentRound.status] }}
          </el-descriptions-item>
        </el-descriptions>
        <el-alert
          v-if="line.quantities.hasOpenReview"
          type="warning"
          title="当前存在质量阻断，整批暂停正常定稿。请刷新依据并核对当前轮。"
          :closable="false"
          class="notice"
        />
        <el-descriptions
          :column="3"
          border
          size="small"
          class="review-summary"
        >
          <el-descriptions-item label="实物账">
            <div>本批到货核实 {{ line.quantities.receivedQuantity }} {{ line.unit }}</div>
            <div>
              历史已入 {{ line.quantities.inboundQuantity }} · 已退
              {{ line.quantities.returnedQuantity }} {{ line.unit }}
            </div>
            <div>本轮未处置 {{ line.quantities.unprocessedQuantity }} {{ line.unit }}</div>
          </el-descriptions-item>
          <el-descriptions-item label="检验依据">
            <div>
              {{ inspectionRoundNo === undefined ? '' : `第 ${inspectionRoundNo} 轮 · `
              }}{{ QUALITY_INSPECTION_METHOD_LABELS[inspection.inspectionMethod] }} ·
              {{ formatDateTimeForDisplay(inspection.inspectedAt) }}
            </div>
            <div>
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
            </div>
          </el-descriptions-item>
          <el-descriptions-item label="本轮去向草稿">
            <div>核实剩余 {{ quantity ?? '待填写' }} {{ line.unit }}</div>
            <div>
              原单 / 补单可入 {{ inboundTotal }} · 待退 {{ returnTotal }} · 待处理
              {{ pendingTotal }} {{ line.unit }}
            </div>
            <div>
              到货总量复核 {{ line.quantities.receivedQuantity }} →
              {{ Number.isFinite(correctedTotal) ? correctedTotal : '待填写' }}
            </div>
          </el-descriptions-item>
        </el-descriptions>
        <el-collapse class="evidence-collapse business-collapse">
          <el-collapse-item
            name="evidence"
            title="查看完整检验凭据与数量依据"
          >
            <InboundInspectionRecord
              :inspection="inspection"
              :round-no="inspectionRoundNo"
            />
            <ReceiptLineSummary :line="line" />
          </el-collapse-item>
        </el-collapse>
        <div class="allocation-search-toolbar">
          <span>按采购单号搜索归属；刷新会清除搜索，已填分配保留。</span>
          <el-button
            :loading="allocationOptions.loading.value"
            :disabled="command.locked.value || stale || loading"
            @click="refreshCandidates"
            >刷新采购归属</el-button
          >
        </div>
        <el-alert
          v-if="allocationOptions.error.value"
          type="error"
          title="采购归属加载失败，已填内容保留。请点击刷新采购归属重试。"
          :closable="false"
          class="notice"
        />
        <el-alert
          v-else-if="allocationOptions.invalidSelectedIds.value.length"
          type="warning"
          title="部分已选采购归属当前不可用，已保留原选择。请重新选择后再确认。"
          :closable="false"
          class="notice"
        />
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
          <InlineHint
            tone="info"
            class="inspection-suggestion-hint"
          >
            <template v-if="inspection.inspectionMethod === 'full'">
              <strong>同一检验建议可入：</strong>全检 {{ inspection.inspectedQuantity }} − 已入
              {{ inspectionExecution.inboundQuantity }} − 其他已退
              {{ inspectionExecution.otherReturnedQuantity }} − MAX(质量已退
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
              <strong>抽检建议可入：</strong>草稿核实剩余 {{ quantity ?? '待填写' }} − 样本不合格
              {{ inspection.unqualifiedQuantity }}
              <template v-if="limit !== null"
                >= <strong>{{ limit }} {{ line.unit }}</strong></template
              >
              <template v-else>；<strong>建议待核对</strong></template>
            </template>
            <template
              v-if="
                quantity !== undefined &&
                Number(quantity) !== Number(line.quantities.unprocessedQuantity)
              "
            >
              本次草稿核实剩余 {{ quantity }}、复核到货总量
              {{ Number.isFinite(correctedTotal) ? correctedTotal : '待填写' }} {{ line.unit }}。
            </template>
          </InlineHint>
          <el-alert
            v-if="quantityMismatch"
            type="warning"
            :closable="false"
            class="notice"
            title="核实数量与原申报或全检总数不一致，请与现场核对，并在下方保存核对说明；原检查事实保持不变。"
          />
          <InlineHint
            v-if="overrideRequired"
            tone="warning"
            class="override-hint"
          >
            <template v-if="limit === null">
              本轮建议可入无法计算：草稿核实剩余 {{ quantity }}、检验检查
              {{ inspection.inspectedQuantity }}、不合格 {{ inspection.unqualifiedQuantity }}
              {{ line.unit }}；请核对并填写异常依据。
            </template>
            <template v-else>
              草稿可入 {{ inboundTotal }} − 本轮建议可入 {{ limit }} = 超出
              <strong>{{ inboundTotal - limit }}</strong> {{ line.unit }}；请填写超建议确认依据。
            </template>
          </InlineHint>
          <el-alert
            v-if="retainedOwners.length"
            type="info"
            :closable="false"
            class="notice"
          >
            <span
              v-for="owner in retainedOwners"
              :key="owner.purchaseOrderLineId"
              class="binding-note"
            >
              {{ owner.purchaseNo }}：原剩余归属 {{ owner.quantity }} {{ line.unit }}。
            </span>
          </el-alert>
          <el-table :data="details">
            <el-table-column
              label="采购归属"
              min-width="250"
              ><template #default="{ row }">
                <RemoteSearchSelect
                  v-model="row.purchaseOrderLineId"
                  :options="allocationOptions.optionsFor(row.purchaseOrderLineId)"
                  :loading="allocationOptions.loading.value"
                  :error="allocationOptions.error.value"
                  :disabled="command.locked.value || stale || loading"
                  :has-more="allocationOptions.hasMore.value"
                  more-text="仅显示前 10 条匹配，请继续输入采购单号缩小范围"
                  placeholder="输入采购单号搜索"
                  empty-text="没有匹配的采购单，请确认补单已正式下单"
                  missing-selection-label="原已选采购归属（待重新核验）"
                  @search="allocationOptions.search"
                  @open="allocationOptions.search('')"
                  @refresh="allocationOptions.refresh"
                /> </template
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
            <span :class="{ 'allocation-mismatch': quantity !== undefined && total !== quantity }">
              已分配 {{ total }} / 应处理 {{ quantity ?? '待填写' }} {{ line.unit }}；差额
              {{ quantity === undefined ? '待填写' : quantity - total }} {{ line.unit }}
            </span>
          </div>
          <InlineHint class="allocation-help">
            待退是去向安排，实际交接另行确认；<strong>补单须先正式下单</strong>，不重复登记到货；未落实量留待处理；计数更正须核对采购归属并说明差异依据。
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
import { computed } from 'vue';
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
import RemoteSearchSelect from '../../../components/RemoteSearchSelect.vue';
import { useReceiptAcceptance } from '../composables/useReceiptAcceptance';
import ReceiptLineSummary from './ReceiptLineSummary.vue';
import InboundInspectionRecord from './InboundInspectionRecord.vue';
import InspectionQuantity from '../../quality/components/InspectionQuantity.vue';
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
  inspectionExecution,
  fullLimitBeforeFloor,
  retainedOwners,
  allocationOptions,
  refreshCandidates,
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
const inspectionRoundNo = computed(() => {
  const receiptLine = line.value;
  const record = inspection.value;
  if (!receiptLine || !record) return undefined;
  const caseRecord = receiptLine.cases.find((row) => row.inspection?.id === record.id);
  if (!caseRecord) return undefined;
  if (receiptLine.currentRound.id === caseRecord.roundId) return receiptLine.currentRound.roundNo;
  return receiptLine.rounds.find((round) => round.id === caseRecord.roundId)?.roundNo;
});
const returnTotal = computed(() =>
  details.value
    .filter((row) => row.disposition === 'return')
    .reduce((sum, row) => sum + Number(row.quantity), 0),
);
const pendingTotal = computed(() =>
  details.value
    .filter((row) => row.disposition === 'pending')
    .reduce((sum, row) => sum + Number(row.quantity), 0),
);
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
.inspection-suggestion-hint,
.override-hint {
  margin: 12px 0 16px;
}
.review-summary {
  margin: 8px 0 12px;
}
.acceptance-identity {
  margin-bottom: 8px;
}
.evidence-collapse {
  margin-bottom: 12px;
}
.review-summary :deep(.el-descriptions__content) > div {
  margin-bottom: 4px;
}
.allocation-actions {
  display: flex;
  align-items: center;
  gap: 20px;
  margin: 12px 0;
}
.allocation-search-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.allocation-search-toolbar {
  margin: 12px 0;
  color: var(--el-text-color-secondary);
  font-size: var(--el-font-size-base);
}
.allocation-mismatch {
  color: var(--el-color-warning-dark-2);
  font-weight: 600;
}
.allocation-help {
  margin: 8px 0 16px;
}
.el-input-number {
  width: 145px;
}
</style>
