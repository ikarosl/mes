<template>
  <el-dialog
    v-model="visible"
    :title="title"
    :width="hasConfirmationTable ? DialogWidth.workbench : DialogWidth.lg"
    :workbench="hasConfirmationTable"
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
          <el-descriptions-item label="采购单"
            ><strong class="identity-value">{{ detail.purchaseNo }}</strong></el-descriptions-item
          >
          <el-descriptions-item label="供应商">{{ detail.supplierName }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag v-bind="purchaseOrderStatusTag(detail.status)">{{
              PURCHASE_ORDER_STATUS_LABELS[detail.status]
            }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item
            v-if="actionLine"
            label="采购行 ID"
            ><strong class="identity-value">{{ actionLine.id }}</strong></el-descriptions-item
          >
          <el-descriptions-item
            v-if="actionLine"
            label="物料"
            :span="2"
            >{{ actionLine.itemCode }} · {{ actionLine.itemName }} ·
            {{ actionLine.materialVariantCode }}</el-descriptions-item
          >
          <el-descriptions-item
            v-if="actionLine"
            :label="detail.supplementReason === 'excess_purchase' ? '补购量' : '采购量'"
            >{{ actionLine.plannedQuantity }} {{ actionLine.unit }}</el-descriptions-item
          >
          <el-descriptions-item
            v-if="actionLine?.quantities"
            label="累计到货"
            >{{ actionLine.quantities.receivedQuantity }}</el-descriptions-item
          >
          <el-descriptions-item
            v-if="actionLine?.quantities"
            label="累计已入"
            >{{ actionLine.quantities.inboundQuantity }}</el-descriptions-item
          >
          <el-descriptions-item
            v-if="actionLine?.quantities"
            label="当前待退"
            >{{ actionLine.quantities.pendingReturnQuantity }}</el-descriptions-item
          >
          <el-descriptions-item
            v-if="actionLine?.quantities"
            label="实际已退"
            >{{ actionLine.quantities.returnedQuantity }}</el-descriptions-item
          >
        </el-descriptions>
        <el-table
          v-if="hasConfirmationTable"
          :data="confirmationLines"
          max-height="300"
          scrollbar-always-on
        >
          <el-table-column
            prop="id"
            label="采购行 ID"
            min-width="110"
          >
            <template #default="{ row }"
              ><strong class="identity-value">{{ row.id }}</strong></template
            >
          </el-table-column>
          <el-table-column
            prop="materialVariantCode"
            label="物料精确版本"
            min-width="180"
          />
          <el-table-column
            prop="plannedQuantity"
            :label="detail.supplementReason === 'excess_purchase' ? '补购量' : '采购量'"
            width="100"
          />
          <el-table-column
            prop="unit"
            label="单位"
            width="70"
          />
          <el-table-column
            label="无税单价"
            min-width="140"
          >
            <template #header><span title="按本行采购单位填写的无税单价">无税单价</span></template>
            <template #default="{ row }">{{ row.taxExclusiveAmount ?? '—' }}</template>
          </el-table-column>
          <el-table-column
            label="含税单价"
            min-width="140"
          >
            <template #header><span title="按本行采购单位填写的含税单价">含税单价</span></template>
            <template #default="{ row }">{{ row.taxInclusiveAmount ?? '—' }}</template>
          </el-table-column>
          <el-table-column
            label="税率"
            width="95"
          >
            <template #default="{ row }">{{ row.taxRatePercent }}%</template>
          </el-table-column>
          <el-table-column
            label="含税总金额"
            min-width="190"
          >
            <template #default="{ row }">
              <template v-if="mode === 'place'">
                <div class="placement-total">
                  <span>本次下单：</span>
                  <span v-if="placementAmount(row)?.totalAmount === null">待填写单价</span>
                  <PurchaseLineTotalAmount
                    v-else
                    :total-amount="placementAmount(row)?.totalAmount ?? null"
                    :total-amount-source="placementAmount(row)?.totalAmountSource ?? null"
                  />
                </div>
                <div
                  v-if="placementAmountDiffers(row)"
                  class="placement-total saved-total"
                >
                  <span>已保存总金额：</span>
                  <PurchaseLineTotalAmount
                    :total-amount="row.totalAmount"
                    :total-amount-source="row.totalAmountSource"
                  />
                </div>
              </template>
              <PurchaseLineTotalAmount
                v-else
                :total-amount="row.totalAmount"
                :total-amount-source="row.totalAmountSource"
              />
            </template>
          </el-table-column>
          <el-table-column
            v-if="detail.supplementReason === 'quality_replacement'"
            label="补单依据"
            min-width="230"
          >
            <template #default="{ row }">
              <div>
                <strong class="identity-value">{{ row.originReceiptNo }}</strong> · 到货行
                ID：<strong class="identity-value">{{ row.originReceiptLineId }}</strong>
              </div>
            </template>
          </el-table-column>
        </el-table>
        <PurchaseOrderAmountHelp v-if="mode === 'place'">
          确认下单后，供应商、物料及精确版本和来源将锁定；更正金额时需填写原因。
        </PurchaseOrderAmountHelp>
        <p v-else-if="mode === 'cancel'">
          草稿可整单取消；已下单采购须没有属于本单的到货记录（含已作废登记）。取消后整单及物料行均不可恢复。
        </p>
        <p v-else-if="mode === 'close-order'">
          将结束本单剩余 {{ confirmationLines.length }} 条进行中的物料行，整单显示“{{
            PURCHASE_ORDER_STATUS_LABELS.completed
          }}”。已结束物料行保留原记录；已有到货的检验、入库和退回继续办理。
        </p>
        <p v-else-if="mode === 'reopen'">
          <template v-if="actionOrder?.status === 'completed'">
            恢复此行后，整张采购单将从“{{ PURCHASE_ORDER_STATUS_LABELS.completed }}”回到“{{
              PURCHASE_ORDER_STATUS_LABELS.ordered
            }}”。
          </template>
          <template v-else>
            恢复此行后，整单保持“{{ PURCHASE_ORDER_STATUS_LABELS.ordered }}”。
          </template>
          此行恢复进行中，其他物料行保持原状态；恢复原因将记录在操作日志中。
        </p>
        <p v-else-if="mode === 'close'">
          结束此行后停止新增到货；已有实物的检验、入库和退回继续办理。
          <template v-if="isLastOpenLine">
            这是最后一条进行中的物料行，确认后整单显示“{{
              PURCHASE_ORDER_STATUS_LABELS.completed
            }}”。
          </template>
          <template v-else>
            本单仍有其他进行中的物料行，整单保持“{{ PURCHASE_ORDER_STATUS_LABELS.ordered }}”。
          </template>
        </p>
        <el-alert
          v-if="actionStale"
          title="采购状态、版本或物料行信息已变化，请关闭后重新选择操作；本次输入已保留。"
          type="warning"
          :closable="false"
        />
        <el-alert
          v-else-if="!eligible && !loading"
          :title="ineligibleMessage"
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
        :disabled="loading || command.locked.value"
        @click="retryLoad"
        >刷新依据</el-button
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
        >{{ confirmLabel }}</el-button
      >
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { PurchaseOrderDetail, PurchaseOrderLine } from '@company/contracts';
import { PURCHASE_ORDER_STATUS_LABELS } from '@company/constants';
import { DialogWidth } from '../../../utils/dialog';
import { purchaseOrderStatusTag } from '../purchase-order-presentation';
import { previewPurchaseLineAmount } from '../purchase-line-amount';
import PurchaseLineTotalAmount from './PurchaseLineTotalAmount.vue';
import PurchaseOrderAmountHelp from './PurchaseOrderAmountHelp.vue';
import {
  usePurchaseOrderActions,
  type PurchaseOrderAction,
} from '../composables/usePurchaseOrderActions';
const emit = defineEmits<{ changed: [string, PurchaseOrderDetail | null] }>();
const initializing = ref(false);
const mode = ref<PurchaseOrderAction>('place'),
  lineId = ref<string>();
const hasConfirmationTable = computed(() => mode.value === 'place' || mode.value === 'close-order');
const {
  visible,
  detail,
  loading,
  readError,
  command,
  action,
  actionLine,
  actionOrder,
  actionStale,
  reason,
  actionValid,
  eligible,
  open: openDetail,
  close,
  load,
  startAction,
  confirmAction,
} = usePurchaseOrderActions((id, result) => emit('changed', id, result));
const title = computed(() => {
  if (mode.value === 'place') return '正式下单';
  if (mode.value === 'cancel') return '取消整张采购单';
  if (mode.value === 'close-order') return '结束整张采购单';
  if (mode.value === 'reopen') return '恢复采购物料行';
  return '结束采购物料行';
});
const confirmLabel = computed(() => {
  if (mode.value === 'place') return '确认下单';
  if (mode.value === 'cancel') return '确认取消';
  if (mode.value === 'reopen') return '确认恢复';
  return '确认结束';
});
const confirmationLines = computed(() => {
  const items = actionOrder.value?.items ?? detail.value?.items ?? [];
  return mode.value === 'close-order' ? items.filter((line) => line.status === 'open') : items;
});
const placementAmounts = computed(
  () =>
    new Map(
      confirmationLines.value.map((line) => [
        line.id,
        previewPurchaseLineAmount({
          plannedQuantity: line.plannedQuantity,
          taxExclusiveAmount: line.taxExclusiveAmount ?? '',
          taxInclusiveAmount: line.taxInclusiveAmount ?? '',
          taxRatePercent: line.taxRatePercent,
          manualTotalAmount: line.totalAmountSource === 'manual' ? (line.totalAmount ?? '') : '',
        }).amount,
      ]),
    ),
);
const placementAmount = (line: PurchaseOrderLine) => placementAmounts.value.get(line.id) ?? null;
const placementAmountDiffers = (line: PurchaseOrderLine): boolean => {
  const amount = placementAmount(line);
  return (
    amount !== null &&
    (amount.totalAmount !== line.totalAmount || amount.totalAmountSource !== line.totalAmountSource)
  );
};
const isLastOpenLine = computed(
  () => actionOrder.value?.items.filter((line) => line.status === 'open').length === 1,
);
const ineligibleMessage = computed(() => {
  if (mode.value === 'cancel') {
    return detail.value?.status === 'draft' || detail.value?.status === 'ordered'
      ? '本单已有到货记录（包括已作废登记），不能取消；需要停止后续采购时可结束整单或物料行。'
      : '当前采购单状态不能取消。';
  }
  if (mode.value === 'close-order') return '仅已下单且仍有进行中物料行的采购单可结束。';
  if (mode.value === 'close') return '仅已下单采购单内进行中的物料行可结束。';
  if (mode.value === 'reopen') return '仅已下单或已结束采购单内已结束的物料行可恢复。';
  return '仅草稿采购单可正式下单。';
});
const initialize = () => {
  if (!initializing.value || readError.value || loading.value || !visible.value || !detail.value)
    return;
  initializing.value = false;
  startAction(
    mode.value,
    detail.value?.items.find((line) => line.id === lineId.value),
  );
};
const open = async (id: string, action: PurchaseOrderAction, targetLineId?: string) => {
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
.identity-value {
  color: var(--el-text-color-primary);
  font-weight: 600;
}
.el-alert,
.el-descriptions,
.el-table {
  margin-bottom: 16px;
}
p {
  line-height: 1.7;
  color: #606266;
}
.placement-total {
  display: flex;
  flex-wrap: wrap;
  gap: 0 4px;
}
.saved-total {
  margin-top: 4px;
  color: var(--el-text-color-regular);
  font-size: 12px;
}
</style>
