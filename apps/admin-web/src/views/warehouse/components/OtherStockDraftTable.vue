<template>
  <div class="draft-table-container">
    <table
      v-if="lines.length"
      class="draft-table"
      :aria-label="direction === 'inbound' ? '其他入库明细' : '其他出库明细'"
    >
      <colgroup>
        <col class="kind-column" />
        <col class="identity-column" />
        <col class="batch-column" />
        <col class="quantity-column" />
        <col class="unit-column" />
        <col class="remark-column" />
        <col class="actions-column" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">类型</th>
          <th scope="col">物料 / 成品</th>
          <th scope="col">{{ direction === 'inbound' ? '入库批次' : '出库批次' }}</th>
          <th scope="col">数量 <span class="required-mark">*</span></th>
          <th scope="col">单位</th>
          <th scope="col">行备注</th>
          <th
            scope="col"
            class="actions-heading"
          >
            操作
          </th>
        </tr>
      </thead>
      <OtherStockDraftLine
        v-for="(line, index) in lines"
        :key="line.key"
        :line="line"
        :direction="direction"
        :row-index="index"
        :disabled="disabled"
        :new-batch-groups="newBatchGroups(line)"
        :batch-summary="otherInventoryDraftBatchSummary(line, lines)"
        @update-line="emit('updateLine', $event)"
        @remove="emit('remove', $event)"
      />
    </table>
    <el-empty
      v-else
      description="请添加至少一条有效明细后保存"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { OtherInventoryDirection } from '@company/contracts';
import {
  otherInventoryDraftIdentity,
  type OtherInventoryDraftLine,
  type OtherInventoryDraftLineUpdate,
} from '../other-inventory-draft';
import { buildInboundNewBatchGroups, type NewBatchGroupChoice } from '../inbound-new-batch-groups';
import { otherInventoryDraftBatchSummary } from '../other-inventory-presentation';
import OtherStockDraftLine from './OtherStockDraftLine.vue';

defineOptions({ name: 'OtherStockDraftTable' });
const props = defineProps<{
  lines: OtherInventoryDraftLine[];
  direction: OtherInventoryDirection;
  disabled: boolean;
}>();
const emit = defineEmits<{
  updateLine: [update: OtherInventoryDraftLineUpdate];
  remove: [key: string];
}>();
const batchGroups = computed(() =>
  buildInboundNewBatchGroups(props.lines, (line) =>
    line.object ? otherInventoryDraftIdentity(line) : '',
  ),
);

function newBatchGroups(line: OtherInventoryDraftLine): NewBatchGroupChoice[] {
  if (!line.object || line.target.mode !== 'new') return [];
  const identity = otherInventoryDraftIdentity(line);
  return batchGroups.value.filter(
    (group) => !group.hasConflictingIdentity && group.identityKey === identity,
  );
}
</script>

<style scoped>
.draft-table-container {
  overflow-x: auto;
  border-top: 1px solid var(--el-border-color-lighter);
}
.draft-table {
  width: 100%;
  min-width: 1320px;
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0;
  color: var(--el-text-color-regular);
  font-size: 14px;
}
.kind-column {
  width: 118px;
}
.identity-column {
  width: 340px;
}
.batch-column {
  width: auto;
}
.quantity-column {
  width: 155px;
}
.unit-column {
  width: 70px;
}
.remark-column {
  width: 220px;
}
.actions-column {
  width: 78px;
}
th {
  padding: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  text-align: left;
  font-weight: 600;
}
.actions-heading {
  position: sticky;
  right: 0;
  z-index: 2;
  box-shadow: -1px 0 0 var(--el-border-color-lighter);
}
.required-mark {
  color: var(--el-color-danger);
}
</style>
