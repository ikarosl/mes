<template>
  <div
    v-loading="loading"
    class="history-groups"
  >
    <div
      v-if="!rows.length"
      class="empty-list"
    >
      暂无其他入库单
    </div>
    <section
      v-for="order in rows"
      :key="order.id"
      class="inbound-block"
    >
      <InboundGroupHeader
        :expanded="!collapsedInboundIds.has(order.id)"
        title-label="入库单"
        :title="order.orderNo"
        :count-label="`本单 ${activeOtherInventoryLines(order).length} 条有效明细`"
        @toggle="toggleInbound(order.id)"
      >
        <el-tag :type="otherInventoryStatusTag(order.status)">
          {{ OTHER_INVENTORY_STATUS_LABELS[order.status] }}
        </el-tag>
        <span class="group-meta">
          {{ order.status === 'completed' ? '本次实际入库' : '本单数量' }}
          <strong>{{ otherInventoryQuantitySummary(order) }}</strong>
        </span>
        <span class="group-meta">
          制单 {{ order.createdByName || '未记录' }} ·
          {{ formatDateTimeForDisplay(order.createdAt) }}
        </span>
        <span
          v-if="order.confirmedAt"
          class="group-meta"
        >
          确认 {{ order.operatorName || '未记录' }} ·
          {{ formatDateTimeForDisplay(order.confirmedAt) }}
        </span>
        <span
          v-else
          class="group-meta"
        >
          {{ order.status === 'cancelled' ? '已取消，库存未变动' : '等待整单确认' }}
        </span>
        <div class="order-actions">
          <el-button
            link
            type="primary"
            @click="emit('detail', order.id)"
            >详情</el-button
          >
          <template v-if="order.status === pendingStatus">
            <el-button
              link
              type="primary"
              @click="emit('edit', order.id)"
              >编辑草稿</el-button
            >
            <el-button
              link
              type="warning"
              @click="emit('confirm', order.id)"
              >确认</el-button
            >
            <el-button
              link
              type="danger"
              @click="emit('cancel', order.id)"
              >取消</el-button
            >
          </template>
        </div>
      </InboundGroupHeader>
      <div
        v-if="!collapsedInboundIds.has(order.id)"
        class="expanded-body"
      >
        <div class="order-notes">
          <div class="order-note"><span>办理原因：</span>{{ order.reason }}</div>
          <div
            v-if="order.remark"
            class="order-note"
          >
            <span>单据备注：</span>{{ order.remark }}
          </div>
          <div
            v-if="order.status === 'cancelled'"
            class="order-note"
          >
            <span>取消：</span>{{ order.cancelledByName || '未记录' }} ·
            {{ formatDateTimeForDisplay(order.cancelledAt) }}；{{ order.cancelReason }}
          </div>
        </div>
        <el-table
          :data="activeOtherInventoryLines(order)"
          row-key="id"
          class="details-table"
          empty-text="本单无有效明细"
        >
          <el-table-column
            label="库存批次"
            min-width="230"
          >
            <template #default="{ row }">
              <el-button
                v-if="
                  row.batchCode && row.batchId && canAccessRoute({ name: 'warehouse-inventory' })
                "
                class="source-link"
                type="primary"
                link
                @click="emit('batch', row.batchId)"
                >{{ row.batchCode }}</el-button
              >
              <span v-else>{{ batchLabel(order, row) }}</span>
              <div class="secondary-text">
                {{ INVENTORY_TARGET_MODE_LABELS[row.targetMode as 'new' | 'existing'] }}
                <template
                  v-if="
                    row.targetMode === 'new' && !row.batchCode && order.status === pendingStatus
                  "
                >
                  · 确认时生成实际批号
                </template>
              </div>
            </template>
          </el-table-column>
          <el-table-column
            label="库存对象 / 精确版本"
            min-width="260"
          >
            <template #default="{ row }">
              <div>{{ row.itemCode }} · {{ row.itemName }}</div>
              <div class="secondary-text">
                {{ INVENTORY_ITEM_KIND_LABELS[row.itemKind as OtherInventoryItemKind] }}
                <template v-if="row.materialVariantCode">
                  · 版本 {{ row.materialVariantCode }}
                </template>
              </div>
            </template>
          </el-table-column>
          <el-table-column
            :label="order.status === 'completed' ? '本次实际入库' : '本单数量'"
            min-width="145"
            align="right"
          >
            <template #default="{ row }">
              <strong>{{ otherInventoryQuantity(row.quantity) }} {{ row.unit }}</strong>
            </template>
          </el-table-column>
          <el-table-column
            label="行备注"
            min-width="220"
          >
            <template #default="{ row }">
              <span class="line-remark">{{ row.remark || '—' }}</span>
            </template>
          </el-table-column>
        </el-table>
        <div
          v-if="order.details.length > activeOtherInventoryLines(order).length"
          class="history-note"
        >
          已移除的历史明细可在“详情”中查看。
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  INVENTORY_ITEM_KIND_LABELS,
  INVENTORY_TARGET_MODE_LABELS,
  OTHER_INVENTORY_STATUS_LABELS,
} from '@company/constants';
import type {
  OtherInventoryItemKind,
  OtherInventoryLine,
  OtherInventoryOrder,
} from '@company/contracts';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import { formatDateTimeForDisplay } from '../../../utils/date';
import {
  activeOtherInventoryLines,
  otherInventoryNewBatchGroupLabel,
  otherInventoryPendingStatus,
  otherInventoryQuantity,
  otherInventoryQuantitySummary,
  otherInventoryStatusTag,
} from '../other-inventory-presentation';
import InboundGroupHeader from './InboundGroupHeader.vue';

defineOptions({ name: 'OtherInboundHistoryGroups' });
const props = defineProps<{ rows: OtherInventoryOrder[]; loading: boolean }>();
const emit = defineEmits<{
  detail: [id: string];
  edit: [id: string];
  confirm: [id: string];
  cancel: [id: string];
  batch: [itemBatchId: string];
}>();
const { canAccessRoute } = useRouteAccess();
const pendingStatus = otherInventoryPendingStatus('inbound');
const collapsedInboundIds = ref(new Set<string>());
watch(
  () => props.rows.map((order) => order.id).join('\u0000'),
  () => {
    collapsedInboundIds.value = new Set(props.rows.slice(1).map((order) => order.id));
  },
  { immediate: true },
);
function toggleInbound(id: string): void {
  const next = new Set(collapsedInboundIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsedInboundIds.value = next;
}
function batchLabel(order: OtherInventoryOrder, line: OtherInventoryLine): string {
  if (line.batchCode) return line.batchCode;
  if (line.targetMode === 'new') {
    if (order.status === pendingStatus)
      return otherInventoryNewBatchGroupLabel(order, line) || '确认时生成库存批次';
    if (order.status === 'cancelled') return '未生成库存批次';
  }
  return '批次信息未提供';
}
</script>

<style scoped>
.history-groups {
  min-height: 90px;
}
.empty-list {
  padding: 32px 16px;
  text-align: center;
  color: var(--el-text-color-secondary);
}
.inbound-block {
  border-top: 1px solid var(--el-border-color-lighter);
}
.group-meta {
  color: var(--el-text-color-regular);
  font-size: 13px;
}
.group-meta strong {
  color: var(--el-text-color-primary);
}
.order-actions {
  display: flex;
  align-items: center;
  flex: none;
  margin-left: auto;
}
.expanded-body {
  max-width: 100%;
  overflow-x: auto;
}
.order-notes {
  display: grid;
  gap: 4px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1.7;
}
.order-note,
.line-remark {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.order-note > span {
  font-weight: 600;
}
.details-table {
  min-width: 855px;
}
.details-table :deep(th.el-table__cell) {
  background: var(--el-fill-color-light);
}
.secondary-text {
  margin-top: 3px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.7;
}
.source-link {
  height: auto;
  white-space: normal;
  text-align: left;
  overflow-wrap: anywhere;
}
.history-note {
  padding: 8px 16px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
