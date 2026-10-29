<template>
  <el-dialog
    v-model="visible"
    :title="`查看/编辑采购单${order ? ` · ${order.purchaseNo}` : ''}`"
    :width="DialogWidth.workbench"
    workbench
    :before-close="beforeClose"
    :close-on-click-modal="false"
    :close-on-press-escape="!command.busy.value"
    :show-close="!command.busy.value"
  >
    <template #header="{ titleId, titleClass }">
      <span
        :id="titleId"
        :class="[titleClass, 'document-title']"
        >查看/编辑采购单<template v-if="order">
          · <strong class="identity-value">{{ order.purchaseNo }}</strong></template
        ></span
      >
    </template>
    <div v-loading="loading">
      <el-alert
        v-if="readError"
        title="采购单读取失败，请重新读取。已有输入已保留，读取成功前不能保存。"
        type="error"
        :closable="false"
        class="notice"
      />
      <el-alert
        v-if="stale"
        title="采购单或物料行已变化，当前输入已保留。请关闭后重新打开最新采购单核对。"
        type="warning"
        :closable="false"
        class="notice"
      />
      <el-alert
        v-if="command.status.value !== 'idle'"
        :title="submissionRecoveryMessage(command.status.value, '采购单金额')"
        type="warning"
        :closable="false"
        class="notice"
      />
      <template v-if="order">
        <el-descriptions
          :column="3"
          border
          class="order-summary"
        >
          <el-descriptions-item label="采购单"
            ><strong class="identity-value">{{ order.purchaseNo }}</strong></el-descriptions-item
          >
          <el-descriptions-item label="供应商">{{ order.supplierName }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag v-bind="purchaseOrderStatusTag(order.status)">{{
              PURCHASE_ORDER_STATUS_LABELS[order.status]
            }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="采购来源">{{
            PURCHASE_ORDER_SOURCE_TYPE_LABELS[order.sourceType]
          }}</el-descriptions-item>
          <el-descriptions-item label="所属工单">{{
            order.workOrderNo ?? '—'
          }}</el-descriptions-item>
          <el-descriptions-item label="补单原因">
            <el-tag
              v-if="order.supplementReason"
              size="small"
              v-bind="purchaseOrderSupplementReasonTag(order.supplementReason)"
              >{{ PURCHASE_ORDER_SUPPLEMENT_REASON_LABELS[order.supplementReason] }}</el-tag
            >
            <span v-else>—</span>
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">{{
            formatDateTimeForDisplay(order.createdAt)
          }}</el-descriptions-item>
          <el-descriptions-item label="下单时间">{{
            formatDateTimeForDisplay(order.orderedAt)
          }}</el-descriptions-item>
          <el-descriptions-item label="物料行">{{ order.lineCount }} 行</el-descriptions-item>
          <el-descriptions-item
            v-if="order.remark"
            label="备注"
            :span="3"
            ><span class="preserve-text">{{ order.remark }}</span></el-descriptions-item
          >
        </el-descriptions>
        <PurchaseOrderAmountHelp
          v-if="eligible"
          class="amount-help"
        >
          <template #editing-scope>
            可更正单价、税率及总额，采购数量及其他信息只读。多行修改统一保存，需填写原因。
          </template>
        </PurchaseOrderAmountHelp>
        <p
          v-else
          class="amount-help"
        >
          当前采购单仅供查看。
        </p>
        <el-table
          :data="rows"
          row-key="line.id"
          :row-expandable="hasSources"
          class="amount-table"
        >
          <el-table-column
            v-if="rows.some(hasSources)"
            type="expand"
            width="48"
            fixed="left"
          >
            <template #default="{ row }">
              <div class="line-sources">
                <PurchaseOrderSources
                  v-if="row.line.sources.length"
                  :sources="row.line.sources"
                />
                <p v-if="row.line.originPurchaseOrderId">
                  原采购单：
                  <span :class="{ 'identity-value': row.line.originPurchaseNo }">{{
                    row.line.originPurchaseNo ?? '未提供'
                  }}</span>
                  · 采购行 ID：<strong class="identity-value">{{
                    row.line.originOrderLineId
                  }}</strong>
                </p>
                <p v-if="row.line.originReceiptLineId">
                  原到货：
                  <span :class="{ 'identity-value': row.line.originReceiptNo }">{{
                    row.line.originReceiptNo ?? '未提供'
                  }}</span>
                  · 到货行 ID：<strong class="identity-value">{{
                    row.line.originReceiptLineId
                  }}</strong>
                </p>
                <p
                  v-if="row.line.supplementEvidence"
                  class="preserve-text"
                >
                  补单依据：{{ row.line.supplementEvidence }}
                </p>
              </div>
            </template>
          </el-table-column>
          <el-table-column
            label="物料 / 精确版本"
            min-width="220"
            fixed="left"
          >
            <template #default="{ row }">
              <div class="material-identity">
                <strong>{{ row.line.itemName }}</strong>
                <span>{{ row.line.materialVariantCode }}</span>
                <span
                  >采购行 ID：<strong class="identity-value">{{ row.line.id }}</strong></span
                >
              </div>
            </template>
          </el-table-column>
          <el-table-column
            :label="order.supplementReason === 'excess_purchase' ? '补购量' : '采购量'"
            width="110"
          >
            <template #default="{ row }"
              >{{ row.line.plannedQuantity }} {{ row.line.unit }}</template
            >
          </el-table-column>
          <el-table-column
            label="到货方式"
            min-width="130"
          >
            <template #default="{ row }">{{
              PURCHASE_FULFILLMENT_MODE_LABELS[row.line.fulfillmentMode as PurchaseFulfillmentMode]
            }}</template>
          </el-table-column>
          <el-table-column
            label="无税单价"
            min-width="130"
          >
            <template #default="{ row }">
              <el-input
                v-if="canEditRow(row)"
                v-model="row.taxExclusiveAmount"
                :maxlength="PURCHASE_ORDER_AMOUNT_TEXT_MAX_LENGTH"
                :disabled="inputsDisabled"
                :aria-label="`${row.line.itemName}无税单价`"
                inputmode="decimal"
                placeholder="选填单价"
                clearable
              />
              <span
                v-else
                class="price-value"
                >{{ row.line.taxExclusiveAmount ?? '—' }}</span
              >
            </template>
          </el-table-column>
          <el-table-column
            label="含税单价"
            min-width="130"
          >
            <template #default="{ row }">
              <el-input
                v-if="canEditRow(row)"
                v-model="row.taxInclusiveAmount"
                :maxlength="PURCHASE_ORDER_AMOUNT_TEXT_MAX_LENGTH"
                :disabled="inputsDisabled"
                :aria-label="`${row.line.itemName}含税单价`"
                inputmode="decimal"
                placeholder="选填单价"
                clearable
              />
              <span
                v-else
                class="price-value"
                >{{ row.line.taxInclusiveAmount ?? '—' }}</span
              >
            </template>
          </el-table-column>
          <el-table-column
            label="税率（%）"
            width="125"
          >
            <template #default="{ row }">
              <el-input
                v-if="canEditRow(row)"
                v-model="row.taxRatePercent"
                :maxlength="PURCHASE_ORDER_AMOUNT_TEXT_MAX_LENGTH"
                :disabled="inputsDisabled"
                :aria-label="`${row.line.itemName}税率百分比`"
                inputmode="decimal"
              />
              <span v-else>{{ row.taxRatePercent }}%</span>
            </template>
          </el-table-column>
          <el-table-column
            label="含税总金额"
            min-width="245"
          >
            <template #default="{ row }">
              <PurchaseLineTotalAmountInput
                v-if="canEditRow(row)"
                v-model:manual-total-amount="row.manualTotalAmount"
                :planned-quantity="row.line.plannedQuantity"
                :tax-exclusive-amount="row.taxExclusiveAmount"
                :tax-inclusive-amount="row.taxInclusiveAmount"
                :tax-rate-percent="row.taxRatePercent"
                :item-name="row.line.itemName"
                :saved-total-amount="row.line.totalAmount"
                :saved-total-amount-source="row.line.totalAmountSource"
                :disabled="inputsDisabled"
              />
              <PurchaseLineTotalAmount
                v-else
                :total-amount="row.line.totalAmount"
                :total-amount-source="row.line.totalAmountSource"
              />
            </template>
          </el-table-column>
          <el-table-column
            label="行状态"
            width="90"
          >
            <template #default="{ row }">
              <el-tag
                v-bind="purchaseOrderLineStatusTag(row.line.status as PurchaseOrderLineStatus)"
                >{{
                  PURCHASE_ORDER_LINE_STATUS_LABELS[row.line.status as PurchaseOrderLineStatus]
                }}</el-tag
              >
            </template>
          </el-table-column>
        </el-table>
        <el-form
          v-if="eligible"
          :disabled="inputsDisabled"
          class="correction-form"
          label-width="90px"
          @submit.prevent="save"
        >
          <el-form-item
            label="更正原因"
            required
          >
            <el-input
              v-model="reason"
              type="textarea"
              :rows="2"
              maxlength="2000"
              show-word-limit
              placeholder="说明本次金额或税率的更正原因"
            />
          </el-form-item>
        </el-form>
      </template>
      <el-empty
        v-else-if="!loading && !readError"
        description="采购单尚未读取，请重新读取"
      />
    </div>
    <template #footer>
      <span
        v-if="eligible"
        class="change-count"
        >已修改 {{ changedRows.length }} 行</span
      >
      <el-button
        :disabled="command.busy.value"
        @click="close"
        >关闭</el-button
      >
      <el-button
        :disabled="loading || command.locked.value"
        @click="load"
        >重新读取</el-button
      >
      <el-button
        v-if="command.status.value === 'pending'"
        type="primary"
        :loading="command.busy.value"
        @click="command.retry"
        >重试本次提交</el-button
      >
      <el-button
        v-else-if="eligible"
        type="primary"
        :disabled="!canSave"
        :loading="command.busy.value"
        @click="save"
        >保存修改</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onScopeDispose } from 'vue';
import type {
  PurchaseFulfillmentMode,
  PurchaseOrderLine,
  PurchaseOrderLineStatus,
} from '@company/contracts';
import {
  PURCHASE_ORDER_AMOUNT_TEXT_MAX_LENGTH,
  PURCHASE_FULFILLMENT_MODE_LABELS,
  PURCHASE_ORDER_LINE_STATUS_LABELS,
  PURCHASE_ORDER_SOURCE_TYPE_LABELS,
  PURCHASE_ORDER_STATUS_LABELS,
  PURCHASE_ORDER_SUPPLEMENT_REASON_LABELS,
} from '@company/constants';
import { submissionRecoveryMessage } from '../../../composables/idempotency/useIdempotentIntent';
import { useTabsStore } from '../../../stores/tabs';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { DialogWidth } from '../../../utils/dialog';
import { usePurchaseOrderDetails } from '../composables/usePurchaseOrderDetails';
import {
  purchaseOrderLineStatusTag,
  purchaseOrderStatusTag,
  purchaseOrderSupplementReasonTag,
} from '../purchase-order-presentation';
import PurchaseOrderSources from './PurchaseOrderSources.vue';
import PurchaseLineTotalAmount from './PurchaseLineTotalAmount.vue';
import PurchaseLineTotalAmountInput from './PurchaseLineTotalAmountInput.vue';
import PurchaseOrderAmountHelp from './PurchaseOrderAmountHelp.vue';

defineOptions({ name: 'PurchaseOrderDetailsDialog' });
const emit = defineEmits<{ changed: [string] }>();
const {
  visible,
  loading,
  readError,
  stale,
  order,
  rows,
  reason,
  command,
  eligible,
  changedRows,
  canEditRow,
  canSave,
  open,
  close,
  load,
  save,
} = usePurchaseOrderDetails((id) => emit('changed', id));
const inputsDisabled = computed(
  () => command.locked.value || loading.value || readError.value || stale.value,
);
const hasSources = ({ line }: { line: PurchaseOrderLine }): boolean =>
  Boolean(
    line.sources.length ||
    line.originPurchaseOrderId ||
    line.originReceiptLineId ||
    line.supplementEvidence,
  );
const beforeClose = (): void => {
  void close();
};
onScopeDispose(useTabsStore().registerCloseGuard('procurement-orders', close));
defineExpose({ open, close, visible, locked: command.locked });
</script>

<style scoped>
.document-title {
  font-weight: 400;
}
.identity-value {
  color: var(--el-text-color-primary);
  font-weight: 600;
}
.notice,
.order-summary {
  margin-bottom: 16px;
}
.amount-help {
  color: var(--el-text-color-regular);
  line-height: 1.7;
}
.material-identity {
  display: flex;
  flex-direction: column;
  gap: 3px;
  overflow-wrap: anywhere;
}
.material-identity span {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.price-value {
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}
.line-sources {
  padding: 12px 20px;
  overflow-wrap: anywhere;
}
.line-sources p {
  margin: 8px 0;
}
.preserve-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.correction-form {
  margin-top: 18px;
}
.correction-form :deep(.el-form-item) {
  margin-bottom: 0;
}
.change-count {
  margin-right: 16px;
  color: var(--el-text-color-regular);
}
.amount-table :deep(.el-table__expand-icon.is-disabled) {
  visibility: hidden;
}
</style>
