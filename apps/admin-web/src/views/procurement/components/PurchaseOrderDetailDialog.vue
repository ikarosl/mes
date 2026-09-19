<template>
  <el-dialog
    v-model="visible"
    :title="`采购详情${detail ? ` · ${detail.purchaseNo}` : ''}`"
    :width="DialogWidth.workbench"
    workbench
    :before-close="beforeClose"
    :close-on-click-modal="false"
    :show-close="!command.busy.value"
  >
    <div v-loading="loading">
      <el-alert
        v-if="readError"
        title="详情加载失败，当前显示内容不能作为新的办理依据，请刷新。"
        type="error"
        :closable="false"
        class="notice"
      />
      <el-alert
        v-if="command.status.value !== 'idle'"
        title="上次操作结果尚未确认，请重试原操作或核对采购记录；其他操作暂时锁定。"
        type="warning"
        :closable="false"
        class="notice"
      />
      <template v-if="detail">
        <el-descriptions
          :column="3"
          border
        >
          <el-descriptions-item label="供应商">{{ detail.supplierName }}</el-descriptions-item>
          <el-descriptions-item label="采购来源">{{
            PURCHASE_ORDER_SOURCE_TYPE_LABELS[detail.sourceType]
          }}</el-descriptions-item>
          <el-descriptions-item label="状态"
            ><el-tag>{{
              PURCHASE_ORDER_STATUS_LABELS[detail.status]
            }}</el-tag></el-descriptions-item
          >
          <el-descriptions-item label="补单原因">{{
            detail.supplementReason
              ? PURCHASE_ORDER_SUPPLEMENT_REASON_LABELS[detail.supplementReason]
              : '普通采购'
          }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{
            formatDateTimeForDisplay(detail.createdAt)
          }}</el-descriptions-item>
          <el-descriptions-item label="下单时间">{{
            formatDateTimeForDisplay(detail.orderedAt)
          }}</el-descriptions-item>
          <el-descriptions-item
            label="备注"
            :span="3"
            >{{ detail.remark || '—' }}</el-descriptions-item
          >
        </el-descriptions>
        <div class="detail-toolbar">
          <div>
            <el-button
              v-if="detail.status === 'ordered' && auth.can(PERMISSIONS.procurement.receipts.view)"
              type="primary"
              :disabled="blocked"
              @click="receive"
              >登记实际到货</el-button
            >
            <el-button
              v-if="detail.status === 'draft'"
              type="primary"
              :disabled="blocked"
              @click="edit"
              >编辑草稿</el-button
            >
            <el-button
              v-if="detail.status === 'draft'"
              type="primary"
              plain
              :disabled="blocked"
              @click="place"
              >正式下单</el-button
            >
            <el-button
              v-if="detail.status === 'draft' || detail.status === 'ordered'"
              :disabled="blocked"
              @click="startAction('cancel')"
              >取消整单</el-button
            >
          </div>
          <el-button
            :disabled="command.locked.value"
            @click="load"
            >刷新详情</el-button
          >
        </div>
        <el-table
          :data="detail.items"
          row-key="id"
        >
          <el-table-column type="expand">
            <template #default="{ row }">
              <div class="line-context">
                <PurchaseOrderSources :sources="row.sources" />
                <el-descriptions
                  :column="4"
                  border
                  size="small"
                  title="当前履约与仓库待办"
                >
                  <el-descriptions-item label="累计实收">{{
                    Number(row.quantities.receivedQuantity)
                  }}</el-descriptions-item>
                  <el-descriptions-item label="少收量">{{
                    Math.max(
                      Number(row.plannedQuantity) - Number(row.quantities.receivedQuantity),
                      0,
                    )
                  }}</el-descriptions-item>
                  <el-descriptions-item label="有效允许入库量">{{
                    Number(row.quantities.approvedQuantity)
                  }}</el-descriptions-item>
                  <el-descriptions-item label="放行差额">{{
                    Math.max(
                      Number(row.plannedQuantity) - Number(row.quantities.approvedQuantity),
                      0,
                    )
                  }}</el-descriptions-item>
                  <el-descriptions-item label="累计已入量">{{
                    Number(row.quantities.inboundQuantity)
                  }}</el-descriptions-item>
                  <el-descriptions-item label="当前可入量">{{
                    Number(row.quantities.pendingInboundQuantity)
                  }}</el-descriptions-item>
                  <el-descriptions-item label="当前待退量">{{
                    Number(row.quantities.pendingReturnQuantity)
                  }}</el-descriptions-item>
                  <el-descriptions-item label="实际已退量">{{
                    Number(row.quantities.returnedQuantity)
                  }}</el-descriptions-item>
                  <el-descriptions-item label="未判定量">{{
                    Number(row.quantities.undeterminedQuantity)
                  }}</el-descriptions-item>
                  <el-descriptions-item label="复核中">{{
                    row.quantities.hasOpenReview ? '有范围暂停办理' : '无'
                  }}</el-descriptions-item>
                </el-descriptions>
                <p v-if="row.originPurchaseOrderId">
                  原采购：<el-button
                    link
                    type="primary"
                    :disabled="command.locked.value"
                    @click="$emit('navigate', row.originPurchaseOrderId)"
                    >{{ row.originPurchaseNo }}</el-button
                  >
                  · 原采购行 {{ row.originOrderLineId }}
                </p>
                <p v-if="row.supplementEvidence">补单依据：{{ row.supplementEvidence }}</p>
                <p v-if="row.originReceiptLineId">
                  原到货明细：<el-button
                    v-if="auth.can(PERMISSIONS.procurement.receipts.view)"
                    link
                    type="primary"
                    :disabled="blocked"
                    @click="sourceReceipt(row.originReceiptLineId)"
                    >查看到货及退回依据</el-button
                  ><span v-else>{{ row.originReceiptLineId }}</span> · 原质量退回
                  {{ row.originSupplierReturnId || '—' }}
                </p>
                <el-descriptions
                  v-if="row.closure"
                  :column="4"
                  border
                  size="small"
                  title="关闭时的冻结依据"
                >
                  <el-descriptions-item label="关闭原因">{{
                    PURCHASE_ORDER_CLOSURE_REASON_LABELS[
                      row.closure.reasonType as PurchaseOrderClosureReason
                    ]
                  }}</el-descriptions-item>
                  <el-descriptions-item label="计划量">{{
                    Number(row.closure.plannedQuantity)
                  }}</el-descriptions-item>
                  <el-descriptions-item label="实收量">{{
                    Number(row.closure.receivedQuantity)
                  }}</el-descriptions-item>
                  <el-descriptions-item label="未判定量">{{
                    Number(row.closure.undeterminedQuantity)
                  }}</el-descriptions-item>
                  <el-descriptions-item label="有效批准量">{{
                    Number(row.closure.approvedQuantity)
                  }}</el-descriptions-item>
                  <el-descriptions-item label="累计已入量">{{
                    Number(row.closure.inboundQuantity)
                  }}</el-descriptions-item>
                  <el-descriptions-item label="待退量">{{
                    Number(row.closure.returnDueQuantity)
                  }}</el-descriptions-item>
                  <el-descriptions-item label="实际已退量">{{
                    Number(row.closure.returnedQuantity)
                  }}</el-descriptions-item>
                  <el-descriptions-item
                    label="说明"
                    :span="4"
                    >{{ row.closure.reason || '—' }}</el-descriptions-item
                  >
                </el-descriptions>
              </div>
            </template>
          </el-table-column>
          <el-table-column
            prop="lineNo"
            label="行"
            width="55"
          />
          <el-table-column
            label="物料"
            min-width="230"
            ><template #default="{ row }"
              >{{ row.itemCode }} · {{ row.itemName }}</template
            ></el-table-column
          >
          <el-table-column
            prop="materialVariantCode"
            label="精确版本"
            min-width="180"
          />
          <el-table-column
            label="采购量"
            width="120"
            ><template #default="{ row }"
              >{{ Number(row.plannedQuantity) }} {{ row.unit }}</template
            ></el-table-column
          >
          <el-table-column
            label="状态"
            width="100"
            ><template #default="{ row }">{{
              PURCHASE_ORDER_LINE_STATUS_LABELS[row.status as PurchaseOrderLineStatus]
            }}</template></el-table-column
          >
          <el-table-column
            label="操作"
            width="255"
            ><template #default="{ row }">
              <el-button
                link
                type="primary"
                :disabled="command.locked.value"
                @click="supplements?.open(row.id)"
                >相关补单</el-button
              >
              <el-button
                v-if="row.status === 'open'"
                link
                type="primary"
                :disabled="blocked || !row.allowedCloseReasons.length"
                @click="startAction('close', row)"
                >逐行结束</el-button
              >
              <el-button
                v-if="
                  (detail.status === 'ordered' || detail.status === 'completed') &&
                  row.status !== 'cancelled'
                "
                link
                type="primary"
                :disabled="blocked"
                @click="startAction('supplement', row)"
                >超量补单</el-button
              >
            </template></el-table-column
          >
        </el-table>
        <p class="help">
          采购数量不作为需求已采购量。采购结束与仓库待办分开，已关闭行的合法后续处置仍保留。
        </p>
        <section
          v-if="action"
          class="action-panel"
        >
          <h3>
            {{
              action === 'cancel'
                ? '取消采购单'
                : action === 'close'
                  ? `结束采购第 ${actionLine?.lineNo} 行`
                  : '额外购买超量 · 独立补单'
            }}
          </h3>
          <el-alert
            v-if="actionStale"
            title="操作依据已变化，输入已保留。请取消本次填写并从最新详情重新选择操作。"
            type="warning"
            :closable="false"
            class="notice"
          />
          <p class="help">
            {{
              action === 'supplement'
                ? '仅用于已同意额外购买的超量。免费超量归原单；质量退回后的补发另按不合格补货处理。'
                : action === 'cancel'
                  ? '仅允许无已确认到货的整单取消。请记录真实取消原因。'
                  : '关闭仅按当前允许的依据办理。人工结束停止后续收货并将未判定范围指定待退；质检达标或质量退回处置完成仍须人员确认。'
            }}
          </p>
          <el-form
            label-width="105px"
            :disabled="command.locked.value"
            @submit.prevent="confirmAction"
          >
            <el-form-item
              v-if="action === 'close'"
              label="结束方式"
              ><el-radio-group v-model="closeReason"
                ><el-radio
                  v-for="value in actionLine?.allowedCloseReasons ?? []"
                  :key="value"
                  :value="value"
                  >{{ PURCHASE_ORDER_CLOSURE_REASON_LABELS[value] }}</el-radio
                ></el-radio-group
              ></el-form-item
            >
            <el-form-item
              v-if="action === 'supplement'"
              label="额外采购量"
              required
              ><el-input-number
                v-model="supplementQuantity"
                :precision="0"
                :min="1"
                :max="PURCHASE_ORDER_MAX_QUANTITY"
                controls-position="right"
            /></el-form-item>
            <el-form-item
              :label="action === 'supplement' ? '真实来货依据' : '原因'"
              required
              ><el-input
                v-model="reason"
                type="textarea"
                :rows="3"
                maxlength="2000"
                show-word-limit
            /></el-form-item>
            <el-form-item
              v-if="action === 'supplement'"
              label="补单备注"
              ><el-input
                v-model="supplementRemark"
                maxlength="2000"
            /></el-form-item>
            <el-form-item
              ><el-button
                :disabled="command.locked.value"
                @click="action = null"
                >取消本次填写</el-button
              ><el-button
                type="primary"
                :disabled="!actionValid"
                :loading="command.busy.value"
                native-type="submit"
                >{{ action === 'supplement' ? '创建独立补单草稿' : '确认办理' }}</el-button
              ></el-form-item
            >
          </el-form>
        </section>
      </template>
    </div>
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
      ></template
    >
  </el-dialog>
  <RelatedSupplementsDialog
    ref="supplements"
    @navigate="$emit('navigate', $event)"
  />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import type {
  PurchaseOrderClosureReason,
  PurchaseOrderDetail,
  PurchaseOrderLineStatus,
} from '@company/contracts';
import {
  PURCHASE_ORDER_SOURCE_TYPE_LABELS,
  PURCHASE_ORDER_STATUS_LABELS,
  PURCHASE_ORDER_LINE_STATUS_LABELS,
  PURCHASE_ORDER_SUPPLEMENT_REASON_LABELS,
  PURCHASE_ORDER_CLOSURE_REASON_LABELS,
  PURCHASE_ORDER_MAX_QUANTITY,
  PERMISSIONS,
} from '@company/constants';
import { useAuthStore } from '../../../stores/auth';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { usePurchaseOrderDetail } from '../composables/usePurchaseOrderDetail';
import PurchaseOrderSources from './PurchaseOrderSources.vue';
import RelatedSupplementsDialog from './RelatedSupplementsDialog.vue';
const emit = defineEmits<{ changed: []; edit: [PurchaseOrderDetail]; navigate: [string] }>();
const supplements = ref<InstanceType<typeof RelatedSupplementsDialog>>();
const auth = useAuthStore(),
  router = useRouter();
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
  supplementQuantity,
  supplementRemark,
  closeReason,
  actionValid,
  open,
  close,
  load,
  place,
  startAction,
  confirmAction,
} = usePurchaseOrderDetail(() => emit('changed'));
const blocked = computed(
  () => loading.value || readError.value || command.locked.value || Boolean(action.value),
);
const edit = async (): Promise<void> => {
  const current = detail.value;
  if (current && (await close())) emit('edit', current);
};
const beforeClose = (): void => {
  void close();
};
defineExpose({ visible, open, close, locked: command.locked });
const receive = async (): Promise<void> => {
  const id = detail.value?.id;
  if (id && (await close()))
    await router.push({ name: 'procurement-receipts', query: { purchaseOrderId: id } });
};
const sourceReceipt = async (id: string): Promise<void> => {
  if (await close())
    await router.push({ name: 'procurement-receipts', query: { receiptLineId: id } });
};
</script>

<style scoped>
.notice {
  margin-bottom: 16px;
}
.detail-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 20px 0 12px;
}
.line-context {
  padding: 16px 32px;
}
.help {
  color: #6b7280;
  font-size: 13px;
  line-height: 1.7;
}
.action-panel {
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  padding: 16px 20px;
  margin-top: 20px;
}
h3 {
  margin: 0 0 12px;
  font-size: 16px;
}
</style>
