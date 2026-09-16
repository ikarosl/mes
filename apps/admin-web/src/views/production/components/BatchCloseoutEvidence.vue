<template>
  <section>
    <el-descriptions
      :column="3"
      border
    >
      <el-descriptions-item label="工单 / 任务"
        >{{ snapshot.check.workOrderNo }} / {{ snapshot.check.batchNo }}</el-descriptions-item
      >
      <el-descriptions-item label="计划数量">{{
        quantity(snapshot.check.plannedQuantity)
      }}</el-descriptions-item>
      <el-descriptions-item label="可用产出（待入库）">{{
        quantity(snapshot.output.availableQuantity)
      }}</el-descriptions-item>
      <el-descriptions-item label="本次新增报废">{{
        quantity(snapshot.output.additionalScrapQuantity)
      }}</el-descriptions-item>
      <el-descriptions-item label="历史报废">{{
        quantity(snapshot.check.existingScrapQuantity)
      }}</el-descriptions-item>
      <el-descriptions-item label="计划差额">{{
        quantity(
          Number(snapshot.check.plannedQuantity) -
            snapshot.output.availableQuantity -
            snapshot.output.additionalScrapQuantity -
            Number(snapshot.check.existingScrapQuantity),
        )
      }}</el-descriptions-item>
      <el-descriptions-item
        label="结束原因"
        :span="3"
        >{{ snapshot.output.reason }}</el-descriptions-item
      >
      <el-descriptions-item
        label="物料安排"
        :span="3"
        >{{ snapshot.output.materialReviewNote }}</el-descriptions-item
      >
    </el-descriptions>
    <p>差额不计入报废。报废不触发补料或补产；本审批不确认库存。</p>
    <h4>管理员逐项处理结果</h4>
    <el-table
      :data="snapshot.actions"
      size="small"
    >
      <el-table-column label="事项"
        ><template #default="{ row }"
          >{{ BATCH_TERMINATION_IMPACT_LABELS[row.kind as BatchCloseoutItemKind] }} ·
          {{ row.label }}</template
        ></el-table-column
      >
      <el-table-column label="处理结果"
        ><template #default="{ row }"
          >{{ statusLabel(row.kind, row.previousStatus) }} →
          {{ statusLabel(row.kind, row.resultingStatus) }}</template
        ></el-table-column
      >
      <el-table-column
        prop="reason"
        label="说明"
        min-width="200"
      />
      <el-table-column
        label="处理数量"
        width="110"
        ><template #default="{ row }">{{
          row.quantity == null ? '—' : quantity(row.quantity) + ' ' + (row.unit ?? '')
        }}</template></el-table-column
      >
      <el-table-column
        prop="actorId"
        label="操作人 ID"
        width="100"
      />
      <el-table-column
        prop="createdAt"
        label="处理时间"
        min-width="160"
      />
    </el-table>
    <h4>物料核对依据</h4>
    <el-table
      :data="snapshot.check.materials"
      size="small"
    >
      <el-table-column
        prop="itemCode"
        label="物料"
      /><el-table-column
        prop="inventoryBatchCode"
        label="库存批次"
      />
      <el-table-column
        prop="outboundQuantity"
        label="累计已领"
      /><el-table-column
        prop="returnQuantity"
        label="退料占用"
      />
      <el-table-column
        prop="lossQuantity"
        label="损耗占用"
      /><el-table-column
        prop="returnableQuantity"
        label="可退上限"
      />
    </el-table>
  </section>
</template>
<script setup lang="ts">
import type { BatchCloseoutApprovalSnapshot, BatchCloseoutItemKind } from '@company/contracts';
import { BATCH_TERMINATION_IMPACT_LABELS, BATCH_CLOSEOUT_STATUS_LABELS } from '@company/constants';
import { formatQuantity as quantity } from '../production-status';
defineProps<{ snapshot: BatchCloseoutApprovalSnapshot }>();
const statusLabel = (kind: string, status: string) =>
  BATCH_CLOSEOUT_STATUS_LABELS[kind]?.[status] ?? '未知状态';
</script>
