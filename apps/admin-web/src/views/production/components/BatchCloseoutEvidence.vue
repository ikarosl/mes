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
      <el-descriptions-item label="计划内可入库产出">{{
        quantity(snapshot.output.availableQuantity)
      }}</el-descriptions-item>
      <el-descriptions-item label="计划外可入库产出">{{
        quantity(snapshot.output.extraQuantity)
      }}</el-descriptions-item>
      <el-descriptions-item label="本次新增报废">{{
        quantity(snapshot.output.additionalScrapQuantity)
      }}</el-descriptions-item>
      <el-descriptions-item label="历史报废">{{
        quantity(snapshot.check.existingScrapQuantity)
      }}</el-descriptions-item>
      <el-descriptions-item label="计划差额">{{
        quantity(Number(snapshot.check.plannedQuantity) - snapshot.output.availableQuantity)
      }}</el-descriptions-item>
      <el-descriptions-item
        label="产出说明 / 差异原因"
        :span="3"
        >{{ snapshot.output.reason }}</el-descriptions-item
      >
      <el-descriptions-item
        label="物料安排"
        :span="3"
        >{{ snapshot.output.materialReviewNote }}</el-descriptions-item
      >
    </el-descriptions>
    <p>
      计划缺口只扣除计划内产出。新增报废不重复包含工序历史报废，不触发补料或补产；批准清单不代表已入库。
    </p>
    <el-descriptions
      :column="3"
      border
    >
      <el-descriptions-item label="结案类型">{{
        PRODUCTION_CLOSEOUT_MODE_LABELS[snapshot.mode]
      }}</el-descriptions-item>
      <el-descriptions-item label="原批准版本">{{
        snapshot.previousRevisionId ? `#${snapshot.previousRevisionId}` : '首次结案'
      }}</el-descriptions-item>
      <el-descriptions-item label="引用质检记录"
        >#{{ snapshot.inspection.id }}</el-descriptions-item
      >
      <el-descriptions-item
        v-if="snapshot.correctionReason"
        label="本次更正原因"
        :span="3"
        >{{ snapshot.correctionReason }}</el-descriptions-item
      >
    </el-descriptions>
    <h4>质检留存依据</h4>
    <el-descriptions
      :column="3"
      border
    >
      <el-descriptions-item label="质检登记人">{{
        snapshot.inspection.createdByName
      }}</el-descriptions-item>
      <el-descriptions-item label="线下检验时间">{{
        snapshot.inspection.inspectedAt
      }}</el-descriptions-item>
      <el-descriptions-item label="当时申报版本">{{
        snapshot.inspection.declaredVersion
      }}</el-descriptions-item>
      <el-descriptions-item
        label="当时申报（计划内 / 外 / 报废）"
        :span="3"
        >{{ snapshot.inspection.declared.availableQuantity }} /
        {{ snapshot.inspection.declared.extraQuantity }} /
        {{ snapshot.inspection.declared.additionalScrapQuantity }}</el-descriptions-item
      >
      <el-descriptions-item
        label="实检数量（计划内 / 外 / 报废）"
        :span="3"
        >{{ snapshot.inspection.inspected.availableQuantity }} /
        {{ snapshot.inspection.inspected.extraQuantity }} /
        {{ snapshot.inspection.inspected.additionalScrapQuantity }}</el-descriptions-item
      >
      <el-descriptions-item
        label="质检说明"
        :span="3"
        >{{ snapshot.inspection.resultNote }}</el-descriptions-item
      >
      <el-descriptions-item
        label="凭据参考"
        :span="3"
        >{{ snapshot.inspection.evidenceReference || '未填写' }}</el-descriptions-item
      >
    </el-descriptions>
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
    <ProductionMaterialLossRecords :records="snapshot.check.lossRecords" />
  </section>
</template>
<script setup lang="ts">
import type { BatchCloseoutApprovalSnapshot, BatchCloseoutItemKind } from '@company/contracts';
import {
  BATCH_TERMINATION_IMPACT_LABELS,
  BATCH_CLOSEOUT_STATUS_LABELS,
  PRODUCTION_CLOSEOUT_MODE_LABELS,
} from '@company/constants';
import { formatQuantity as quantity } from '../production-status';
import ProductionMaterialLossRecords from './ProductionMaterialLossRecords.vue';
defineProps<{ snapshot: BatchCloseoutApprovalSnapshot }>();
const statusLabel = (kind: string, status: string) =>
  BATCH_CLOSEOUT_STATUS_LABELS[kind]?.[status] ?? '未知状态';
</script>
