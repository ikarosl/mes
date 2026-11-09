<template>
  <section>
    <el-descriptions
      :column="mode === 'command' ? 2 : 3"
      border
    >
      <el-descriptions-item label="工单 / 任务"
        >{{ check.workOrderNo }} / {{ check.batchNo }}</el-descriptions-item
      >
      <el-descriptions-item label="当前需求"
        >id:{{ check.demandId }} ·
        {{ DEMAND_GENERATION_GROUP_TYPE_LABELS[check.demandType] }}</el-descriptions-item
      >
      <el-descriptions-item label="物料 / 版本 / 单位"
        >{{ check.itemCode }} / {{ check.materialVariantCode }} /
        {{ check.unit }}</el-descriptions-item
      >
      <template v-if="mode === 'full'">
        <el-descriptions-item label="来源说明">{{
          check.sourceReason ?? '—'
        }}</el-descriptions-item>
      </template>
      <el-descriptions-item label="当前目标总量">{{
        quantity(check.currentTotalQuantity)
      }}</el-descriptions-item>
      <el-descriptions-item label="历次累计已领">{{
        quantity(check.issuedQuantity)
      }}</el-descriptions-item>
      <el-descriptions-item
        v-if="mode === 'full'"
        label="旧需求待关闭余量"
        >{{ quantity(check.oldRemainingQuantity) }}</el-descriptions-item
      >
    </el-descriptions>
    <p v-if="mode === 'full'">
      原方案和已领料记录保留。替代需求只承接剩余量；退料另行办理，不抵减累计已领。
    </p>
    <el-table
      v-if="mode === 'full'"
      :data="check.chain"
      size="small"
    >
      <el-table-column
        label="需求"
        width="110"
        ><template #default="{ row }">id:{{ row.demandId }}</template></el-table-column
      >
      <el-table-column
        label="替代自"
        width="110"
        ><template #default="{ row }">{{
          row.replacesDemandId ? `id:${row.replacesDemandId}` : '—'
        }}</template></el-table-column
      >
      <el-table-column label="原数量"
        ><template #default="{ row }">{{ quantity(row.demandQuantity) }}</template></el-table-column
      >
      <el-table-column label="已领"
        ><template #default="{ row }">{{
          quantity(row.outboundQuantity)
        }}</template></el-table-column
      >
      <el-table-column label="保留剩余"
        ><template #default="{ row }">{{
          quantity(row.remainingQuantity)
        }}</template></el-table-column
      >
      <el-table-column label="关闭原因"
        ><template #default="{ row }">{{
          row.closeCause ? DEMAND_CLOSE_CAUSE_LABELS[row.closeCause as DemandCloseCause] : '—'
        }}</template></el-table-column
      >
    </el-table>
    <template v-if="check.reservations.length">
      <h4>批准后释放的未出库预留</h4>
      <el-table
        :data="check.reservations"
        size="small"
      >
        <el-table-column
          v-if="mode === 'full'"
          label="分配"
          ><template #default="{ row }">id:{{ row.allocationId }}</template></el-table-column
        ><el-table-column
          prop="inventoryBatchCode"
          label="库存批次"
        />
        <el-table-column label="释放数量"
          ><template #default="{ row }">{{ quantity(row.quantity) }}</template></el-table-column
        >
      </el-table>
    </template>
    <el-alert
      v-if="check.pendingOutboundNos.length"
      type="warning"
      :closable="false"
      :title="`须先处理待出库单：${check.pendingOutboundNos.join('、')}`"
    >
      涉及当前需求的待出库单须送审前处理；混合单据还关联其他需求，请核对整单影响范围。
    </el-alert>
  </section>
</template>
<script setup lang="ts">
import type { DemandCorrectionCheck, DemandCloseCause } from '@company/contracts';
import { DEMAND_CLOSE_CAUSE_LABELS, DEMAND_GENERATION_GROUP_TYPE_LABELS } from '@company/constants';
import { formatQuantity as quantity } from '../../../utils/quantity';
withDefaults(
  defineProps<{
    check: DemandCorrectionCheck;
    newRemainingQuantity?: number;
    mode?: 'full' | 'command';
  }>(),
  { mode: 'full', newRemainingQuantity: undefined },
);
</script>
<style scoped>
section p {
  color: var(--el-text-color-regular);
  line-height: 1.6;
}
h4 {
  margin-bottom: 8px;
}
.impact-group {
  margin-top: 16px;
}
</style>
