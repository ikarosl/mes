<template>
  <el-dialog
    :model-value="modelValue"
    title="通用出库详情（界面预览）"
    :width="DialogWidth.xl"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div
      v-if="detail"
      class="detail-body"
    >
      <InlineHint>示例单只影响本页内存数据；刷新或关闭页面标签后重置。</InlineHint>
      <el-descriptions
        :column="2"
        border
      >
        <el-descriptions-item label="出库单号">{{ detail.outboundNo }}</el-descriptions-item>
        <el-descriptions-item label="状态"
          ><el-tag :type="previewOutboundStatusTag(detail.status)">{{
            OUTBOUND_ORDER_STATUS_LABELS[detail.status]
          }}</el-tag></el-descriptions-item
        >
        <el-descriptions-item label="出库类型">{{
          INVENTORY_ITEM_KIND_LABELS[detail.itemKind]
        }}</el-descriptions-item>
        <el-descriptions-item label="明细数量"
          >{{ detail.details.length }} 个库存批次</el-descriptions-item
        >
        <el-descriptions-item
          label="出库去向"
          :span="2"
          ><span class="preserve-text">{{ detail.destination }}</span></el-descriptions-item
        >
        <el-descriptions-item
          label="本单数量"
          :span="2"
          >{{ previewOutboundQuantitySummary(detail.details) }}</el-descriptions-item
        >
        <el-descriptions-item label="制单人">{{ detail.createdByName }}</el-descriptions-item>
        <el-descriptions-item label="制单时间">{{
          formatDateTimeForDisplay(detail.createdAt)
        }}</el-descriptions-item>
        <el-descriptions-item label="确认人">{{ detail.operatorName || '—' }}</el-descriptions-item>
        <el-descriptions-item label="出库时间">{{
          formatDateTimeForDisplay(detail.outboundAt, '—')
        }}</el-descriptions-item>
        <el-descriptions-item
          label="备注"
          :span="2"
          ><span class="preserve-text">{{ detail.remark || '—' }}</span></el-descriptions-item
        >
        <template v-if="detail.status === 'cancelled'">
          <el-descriptions-item label="取消人">{{ detail.cancelledByName }}</el-descriptions-item>
          <el-descriptions-item label="取消时间">{{
            formatDateTimeForDisplay(detail.cancelledAt)
          }}</el-descriptions-item>
          <el-descriptions-item
            label="取消原因"
            :span="2"
            ><span class="preserve-text">{{ detail.cancelReason }}</span></el-descriptions-item
          >
        </template>
      </el-descriptions>
      <InlineHint v-if="detail.status === 'pending_picking'"
        >此单尚未扣减示例库存，也未占用额度；当前可出库量可能变化，确认时重新核对。</InlineHint
      >
      <InlineHint
        v-else-if="detail.status === 'completed'"
        tone="success"
        >此示例单已确认，对应数量已从 mock 库存中扣减。</InlineHint
      >
      <InlineHint v-else>此示例单已取消，明细作为历史保留，未扣减 mock 库存。</InlineHint>
      <el-table
        :data="detail.details"
        row-key="itemBatchId"
        class="preview-table"
      >
        <el-table-column
          prop="itemCode"
          label="编码"
          min-width="115"
        />
        <el-table-column
          prop="itemName"
          label="名称"
          min-width="145"
        />
        <el-table-column
          v-if="detail.itemKind === 'material'"
          prop="materialVariantCode"
          label="精确版本"
          min-width="160"
        />
        <el-table-column
          prop="batchCode"
          label="库存批号"
          min-width="190"
        />
        <el-table-column
          label="本单出库量"
          width="115"
          align="right"
          ><template #default="{ row }"
            ><strong>{{ formatQuantity(row.outboundQuantity) }}</strong></template
          ></el-table-column
        >
        <el-table-column
          v-if="detail.status === 'pending_picking'"
          label="当前可出库量"
          width="135"
          align="right"
          ><template #default="{ row }">{{
            availableQuantity(row.itemBatchId)
          }}</template></el-table-column
        >
        <el-table-column
          prop="unit"
          label="单位"
          width="65"
        />
      </el-table>
    </div>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">关闭</el-button>
      <template v-if="detail?.status === 'pending_picking'">
        <el-button
          :disabled="busy"
          @click="$emit('cancel', detail)"
          >取消出库单</el-button
        >
        <el-button
          type="primary"
          :loading="busy"
          @click="$emit('confirm', detail)"
          >确认出库</el-button
        >
      </template>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import type { InventoryBatchItem } from '@company/contracts';
import { INVENTORY_ITEM_KIND_LABELS, OUTBOUND_ORDER_STATUS_LABELS } from '@company/constants';
import InlineHint from '../../../components/InlineHint.vue';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { formatQuantity } from '../../production/production-status';
import {
  previewOutboundAvailableQuantity,
  previewOutboundQuantitySummary,
  previewOutboundStatusTag,
} from '../general-outbound-preview';
import type { PreviewOutboundOrder } from '../general-outbound-preview';

defineOptions({ name: 'GeneralOutboundDetailDialog' });
const props = defineProps<{
  modelValue: boolean;
  active: boolean;
  detail: PreviewOutboundOrder | null;
  inventory: InventoryBatchItem[];
  busy: boolean;
}>();
defineEmits<{
  'update:modelValue': [value: boolean];
  confirm: [order: PreviewOutboundOrder];
  cancel: [order: PreviewOutboundOrder];
}>();
const availableQuantity = (id: string): string => {
  const batch = props.inventory.find((item) => item.itemBatchId === id);
  return batch ? formatQuantity(previewOutboundAvailableQuantity(batch)) : '—';
};
</script>

<style scoped>
.detail-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.preserve-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.preview-table :deep(.el-table__header th) {
  background: var(--el-fill-color-light);
}
.preview-table :deep(.el-table__row) {
  height: 48px;
}
</style>
