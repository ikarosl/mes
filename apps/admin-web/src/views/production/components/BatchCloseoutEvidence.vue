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
      <el-descriptions-item label="本次送审时末道正常报工"
        >{{ quantity(snapshot.check.reportedNormalQuantity) }}
        {{ snapshot.check.unit }}</el-descriptions-item
      >
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
      <el-descriptions-item label="前次批准清单">{{
        snapshot.previousRevisionId === null
          ? '首次结案'
          : snapshot.previousRevisionNo === null
            ? '原批准版本无法读取'
            : `第 ${snapshot.previousRevisionNo} 版`
      }}</el-descriptions-item>
      <el-descriptions-item label="质检记录">id {{ snapshot.inspection.id }}</el-descriptions-item>
      <el-descriptions-item
        v-if="snapshot.correctionReason"
        label="本次更正原因"
        :span="3"
        >{{ snapshot.correctionReason }}</el-descriptions-item
      >
    </el-descriptions>
    <h4>质检留存依据</h4>
    <FinishedInspectionRecordDetail
      :inspection="snapshot.inspection"
      :unit="snapshot.check.unit"
    />
    <InlineHint class="output-note">
      清单累计可入库量：{{ snapshot.output.availableQuantity + snapshot.output.extraQuantity }}
      {{ snapshot.check.unit }}；批准清单不代表已入库，请结合历史已入库事实核对。
    </InlineHint>
    <h4>管理员收尾与任务行动</h4>
    <el-table
      :data="snapshot.actions"
      size="small"
    >
      <el-table-column label="事项"
        ><template #default="{ row }"
          >{{ batchCloseoutActionLabel(row) }} · {{ row.label }}</template
        ></el-table-column
      >
      <el-table-column label="处理结果"
        ><template #default="{ row }"
          >{{ batchCloseoutActionStatusLabel(row.kind, row.previousStatus) }} →
          {{ batchCloseoutActionStatusLabel(row.kind, row.resultingStatus) }}</template
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
        label="处理时间"
        min-width="160"
        ><template #default="{ row }">{{
          formatDateTimeForDisplay(row.createdAt)
        }}</template></el-table-column
      >
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
import type { BatchCloseoutApprovalDisplaySnapshot } from '@company/contracts';
import { PRODUCTION_CLOSEOUT_MODE_LABELS } from '@company/constants';
import { formatQuantity as quantity } from '../production-status';
import { formatDateTimeForDisplay } from '../../../utils/date';
import ProductionMaterialLossRecords from './ProductionMaterialLossRecords.vue';
import FinishedInspectionRecordDetail from '../../quality/components/FinishedInspectionRecordDetail.vue';
import InlineHint from '../../../components/InlineHint.vue';
import {
  batchCloseoutActionLabel,
  batchCloseoutActionStatusLabel,
} from '../batch-closeout-action-presentation';
defineProps<{ snapshot: BatchCloseoutApprovalDisplaySnapshot }>();
</script>
<style scoped>
.output-note {
  margin-top: 12px;
}
</style>
