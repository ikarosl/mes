<template>
  <div
    v-loading="loading"
    class="candidate-groups"
  >
    <div
      v-if="!groups.length"
      class="empty-list"
    >
      {{ emptyText }}
    </div>
    <section
      v-for="group in groups"
      :key="group.workOrderId"
      class="inbound-block"
    >
      <InboundGroupHeader
        :expanded="!collapsedWorkOrderIds.has(group.workOrderId)"
        title-label="工单"
        :title="group.workOrderNo"
        :count-label="`本页 ${group.items.length} 条待入库明细`"
        @toggle="toggleWorkOrder(group.workOrderId)"
      >
        <span class="group-meta">{{ group.productLabel }}</span>
        <span class="group-meta">{{ group.taskLabel }}</span>
        <span
          v-if="group.blockedCount"
          class="group-blocked"
          >{{ group.blockedCount }} 条暂不可入：{{ group.blockerSummary }}</span
        >
      </InboundGroupHeader>
      <div
        v-if="!collapsedWorkOrderIds.has(group.workOrderId)"
        class="details-scroll"
      >
        <el-table
          :data="group.items"
          row-key="allocationId"
        >
          <el-table-column
            width="44"
            align="center"
          >
            <template #default="{ row }">
              <el-checkbox
                :model-value="isSelected(row.allocationId)"
                :disabled="
                  !row.canConfirm ||
                  (selectedTaskId !== null && selectedTaskId !== row.productionBatchId)
                "
                :aria-label="`${isSelected(row.allocationId) ? '取消已选明细' : '选择可入库明细'} ${row.batchNo} ${row.productCode} ${FINISHED_GOODS_INBOUND_SOURCE_LABELS[row.sourceType as FinishedGoodsInboundSource]}`"
                @change="emit('toggle', row)"
              />
            </template>
          </el-table-column>
          <el-table-column
            label="任务"
            min-width="160"
          >
            <template #default="{ row }">{{ row.batchNo }}</template>
          </el-table-column>
          <el-table-column
            label="成品"
            min-width="240"
          >
            <template #default="{ row }">
              <div>{{ row.productCode }} · {{ row.productName }}</div>
            </template>
          </el-table-column>
          <el-table-column
            label="授权来源类别"
            width="128"
            align="center"
          >
            <template #default="{ row }">
              <el-tag
                :type="finishedGoodsInboundSourceTagType(row.sourceType)"
                size="small"
                effect="light"
              >
                {{
                  FINISHED_GOODS_INBOUND_SOURCE_LABELS[row.sourceType as FinishedGoodsInboundSource]
                }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column
            label="批准 / 已入"
            width="200"
            align="right"
          >
            <template #default="{ row }">
              <div class="quantity-summary">
                <strong>{{ formatQuantity(row.authorizedQuantity) }}</strong>
                <span class="quantity-separator">/</span>
                <strong>{{ formatQuantity(row.receivedQuantity) }}</strong>
                <span class="quantity-unit">{{ row.unit }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column
            label="操作"
            :width="canViewInspection ? 200 : 110"
            fixed="right"
          >
            <template #default="{ row }">
              <el-button
                link
                type="primary"
                :disabled="
                  !row.canConfirm ||
                  (selectedTaskId !== null && selectedTaskId !== row.productionBatchId)
                "
                @click="emit('open', row)"
                >办理入库</el-button
              >
              <el-button
                v-if="canViewInspection"
                link
                type="primary"
                @click="emit('inspection', row.productionBatchId)"
                >查看成品质检</el-button
              >
              <div
                v-if="!row.canConfirm"
                class="operation-blocked"
              >
                {{ row.blockers.join('；') || '当前不可入库' }}
              </div>
              <div
                v-else-if="selectedTaskId !== null && selectedTaskId !== row.productionBatchId"
                class="operation-constrained"
              >
                需与已选明细同一任务
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { FinishedGoodsInboundCandidate, FinishedGoodsInboundSource } from '@company/contracts';
import { FINISHED_GOODS_INBOUND_SOURCE_LABELS } from '@company/constants';
import { formatQuantity } from '../../../utils/quantity';
import { finishedGoodsInboundSourceTagType } from '../warehouse-list-presentation';
import InboundGroupHeader from './InboundGroupHeader.vue';

defineOptions({ name: 'FinishedGoodsInboundCandidateGroups' });
const props = defineProps<{
  rows: FinishedGoodsInboundCandidate[];
  loading: boolean;
  emptyText: string;
  selectedTaskId: string | null;
  isSelected: (allocationId: string) => boolean;
  canViewInspection: boolean;
}>();
const emit = defineEmits<{
  toggle: [source: FinishedGoodsInboundCandidate];
  open: [source: FinishedGoodsInboundCandidate];
  inspection: [batchId: string];
}>();
interface WorkOrderPageGroup {
  workOrderId: string;
  workOrderNo: string;
  items: FinishedGoodsInboundCandidate[];
  productLabel: string;
  taskLabel: string;
  blockedCount: number;
  blockerSummary: string;
}
const groups = computed<WorkOrderPageGroup[]>(() => {
  const byWorkOrder = new Map<string, FinishedGoodsInboundCandidate[]>();
  for (const row of props.rows) {
    const items = byWorkOrder.get(row.workOrderId) ?? [];
    items.push(row);
    byWorkOrder.set(row.workOrderId, items);
  }
  return [...byWorkOrder].map(([workOrderId, items]) => {
    const first = items[0]!;
    const productIds = new Set(items.map((item) => item.productId));
    const taskNos = [...new Set(items.map((item) => item.batchNo))];
    const blocked = items.filter((item) => !item.canConfirm);
    const reasons = [...new Set(blocked.flatMap((item) => item.blockers))];
    return {
      workOrderId,
      workOrderNo: first.workOrderNo,
      items,
      productLabel:
        productIds.size === 1
          ? `成品 ${first.productCode} · ${first.productName}`
          : `本页 ${productIds.size} 种成品`,
      taskLabel: taskNos.length === 1 ? `任务 ${taskNos[0]}` : `本页 ${taskNos.length} 个任务`,
      blockedCount: blocked.length,
      blockerSummary: reasons.join('；') || '当前资格不满足',
    };
  });
});
const collapsedWorkOrderIds = ref(new Set<string>());
const orderedRowKeys = computed(() =>
  props.rows.map((row) => `${row.workOrderId}/${row.allocationId}`),
);
watch(orderedRowKeys, (keys, previousKeys) => {
  if (
    previousKeys &&
    keys.length === previousKeys.length &&
    keys.every((key, index) => key === previousKeys[index])
  )
    return;
  collapsedWorkOrderIds.value = new Set();
});
function toggleWorkOrder(id: string): void {
  const next = new Set(collapsedWorkOrderIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsedWorkOrderIds.value = next;
}
</script>

<style scoped>
.candidate-groups {
  min-height: 90px;
}
.empty-list {
  padding: 32px 16px;
  color: var(--el-text-color-secondary);
  text-align: center;
}
.inbound-block {
  border-top: 1px solid var(--el-border-color-lighter);
}
.group-meta {
  color: var(--el-text-color-regular);
  font-size: 13px;
}
.group-blocked {
  color: var(--el-color-danger);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.details-scroll {
  max-width: 100%;
  overflow-x: auto;
}
.quantity-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: flex-end;
  gap: 6px;
  font-variant-numeric: tabular-nums;
}
.quantity-summary strong {
  color: var(--el-text-color-primary);
  font-weight: 600;
  white-space: nowrap;
}
.quantity-separator,
.quantity-unit {
  color: var(--el-text-color-secondary);
}
.quantity-unit {
  font-size: 12px;
  white-space: nowrap;
}
.operation-blocked,
.operation-constrained {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.operation-constrained {
  color: var(--el-color-warning-dark-2);
}
.operation-blocked {
  color: var(--el-color-danger);
}
</style>
