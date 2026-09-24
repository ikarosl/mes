<template>
  <el-table
    :data="order.items"
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
              Math.max(Number(row.plannedQuantity) - Number(row.quantities.receivedQuantity), 0)
            }}</el-descriptions-item>
            <el-descriptions-item label="有效允许入库量">{{
              Number(row.quantities.approvedQuantity)
            }}</el-descriptions-item>
            <el-descriptions-item label="放行差额">{{
              Math.max(Number(row.plannedQuantity) - Number(row.quantities.approvedQuantity), 0)
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
              :disabled="disabled"
              @click="$emit('navigate', row.originPurchaseOrderId)"
              >{{ row.originPurchaseNo }}</el-button
            >
            · 原采购行 {{ row.originOrderLineId }}
          </p>
          <p>
            履约方式：{{
              PURCHASE_FULFILLMENT_MODE_LABELS[row.fulfillmentMode as PurchaseFulfillmentMode]
            }}
          </p>
          <p v-if="row.supplementEvidence">补单依据：{{ row.supplementEvidence }}</p>
          <p v-if="row.originReceiptLineId">
            原到货明细：<el-button
              v-if="auth.can(PERMISSIONS.procurement.receipts.view)"
              link
              type="primary"
              :disabled="disabled"
              @click="$emit('source-receipt', row.originReceiptLineId)"
              >查看到货及正式清单</el-button
            ><span v-else>{{ row.originReceiptLineId }}</span> · 质量退回分配明细
            {{ row.originAllocationId || '—' }}
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
      prop="supplierName"
      label="实际供应商"
      min-width="160"
    />
    <el-table-column
      label="物料"
      min-width="195"
      ><template #default="{ row }"
        >{{ row.itemCode }} · {{ row.itemName }}</template
      ></el-table-column
    >
    <el-table-column
      prop="materialVariantCode"
      label="精确版本"
      min-width="165"
    />
    <el-table-column
      label="履约方式"
      min-width="140"
      ><template #default="{ row }">{{
        PURCHASE_FULFILLMENT_MODE_LABELS[row.fulfillmentMode as PurchaseFulfillmentMode]
      }}</template></el-table-column
    >
    <el-table-column
      label="采购量"
      width="120"
      ><template #default="{ row }"
        >{{ Number(row.plannedQuantity) }} {{ row.unit }}</template
      ></el-table-column
    >
    <el-table-column
      label="累计实收"
      width="100"
      ><template #default="{ row }">{{
        row.quantities.receivedQuantity
      }}</template></el-table-column
    >
    <el-table-column
      label="正式可入 / 已入"
      width="145"
      ><template #default="{ row }"
        >{{ row.quantities.pendingInboundQuantity }} /
        {{ row.quantities.inboundQuantity }}</template
      ></el-table-column
    >
    <el-table-column
      label="待处理 / 待退"
      width="145"
      ><template #default="{ row }"
        >{{ row.quantities.undeterminedQuantity }} /
        {{ row.quantities.pendingReturnQuantity }}</template
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
      width="320"
      fixed="right"
      ><template #default="{ row }">
        <el-button
          v-if="order.orderedAt && row.fulfillmentMode === 'new_arrival'"
          link
          type="primary"
          :disabled="disabled"
          @click="$emit('excess-supplement', row.id)"
          >超量补单</el-button
        >
        <el-button
          link
          type="primary"
          :disabled="disabled"
          @click="$emit('supplements', row.id)"
          >相关补单</el-button
        >
        <el-button
          v-if="row.status === 'open'"
          link
          type="primary"
          :disabled="disabled || !row.allowedCloseReasons.length"
          @click="$emit('close-line', row.id)"
          >结束此行</el-button
        >
        <el-button
          v-if="
            auth.can(PERMISSIONS.procurement.receipts.view) &&
            (order.status === 'ordered' || order.status === 'completed') &&
            row.status !== 'cancelled'
          "
          link
          type="primary"
          :disabled="disabled"
          @click="$emit('receipts')"
          >到货记录</el-button
        >
      </template></el-table-column
    >
  </el-table>
</template>
<script setup lang="ts">
import type {
  PurchaseOrderDetail,
  PurchaseOrderLineStatus,
  PurchaseOrderClosureReason,
  PurchaseFulfillmentMode,
} from '@company/contracts';
import {
  PURCHASE_ORDER_LINE_STATUS_LABELS,
  PURCHASE_ORDER_CLOSURE_REASON_LABELS,
  PURCHASE_FULFILLMENT_MODE_LABELS,
  PERMISSIONS,
} from '@company/constants';
import { useAuthStore } from '../../../stores/auth';
import PurchaseOrderSources from './PurchaseOrderSources.vue';
defineProps<{ order: PurchaseOrderDetail; disabled: boolean }>();
defineEmits<{
  'close-line': [string];
  supplements: [string];
  'excess-supplement': [string];
  receipts: [];
  'source-receipt': [string];
  navigate: [string];
}>();
const auth = useAuthStore();
</script>
<style scoped>
.line-context {
  padding: 16px 24px;
}
</style>
