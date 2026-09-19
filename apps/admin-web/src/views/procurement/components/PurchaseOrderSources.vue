<template>
  <el-table
    :data="sources"
    size="small"
    empty-text="独立备料，无需求来源"
  >
    <el-table-column
      prop="workOrderNo"
      label="来源工单"
      min-width="170"
    />
    <el-table-column
      prop="batchNo"
      label="来源任务"
      min-width="170"
    />
    <el-table-column
      prop="demandId"
      label="需求记录"
      min-width="140"
    />
    <el-table-column
      label="需求量"
      width="110"
      ><template #default="{ row }">{{ Number(row.demandQuantity) }}</template></el-table-column
    >
    <el-table-column
      label="当前剩余缺口"
      width="130"
      ><template #default="{ row }">{{
        Number(row.remainingDemandQuantity)
      }}</template></el-table-column
    >
  </el-table>
</template>
<script setup lang="ts">
import type { PurchaseOrderLineSource } from '@company/contracts';
defineProps<{ sources: PurchaseOrderLineSource[] }>();
</script>
