<template>
  <section>
    <el-descriptions
      :column="3"
      border
    >
      <el-descriptions-item label="工单 / 任务"
        >{{ check.workOrderNo }} / {{ check.batchNo }}</el-descriptions-item
      >
      <el-descriptions-item label="需求"
        >#{{ check.demandId }} · {{ check.itemCode }}</el-descriptions-item
      >
      <el-descriptions-item label="版本 / 单位"
        >{{ check.materialVariantCode }} / {{ check.unit }}</el-descriptions-item
      >
      <el-descriptions-item label="原补料单">{{ check.supplementNo ?? '—' }}</el-descriptions-item>
      <el-descriptions-item label="原始需求">{{
        check.parentDemandId ? `#${check.parentDemandId}` : '—'
      }}</el-descriptions-item>
      <el-descriptions-item label="来源说明">{{ check.sourceReason ?? '—' }}</el-descriptions-item>
      <el-descriptions-item label="当前总要求">{{
        quantity(check.currentTotalQuantity)
      }}</el-descriptions-item>
      <el-descriptions-item label="链上累计已领">{{
        quantity(check.issuedQuantity)
      }}</el-descriptions-item>
      <el-descriptions-item label="旧需求待关闭余量">{{
        quantity(check.oldRemainingQuantity)
      }}</el-descriptions-item>
    </el-descriptions>
    <p>原方案和已领料记录保留。替代需求只承接剩余量；退料另行办理，不抵减累计已领。</p>
    <el-table
      :data="check.chain"
      size="small"
    >
      <el-table-column
        prop="demandId"
        label="需求 ID"
        width="100"
      />
      <el-table-column
        prop="replacesDemandId"
        label="替代自"
        width="100"
      />
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
    <template v-if="check.supplementRequirements.length">
      <h4>原补料方案与当前要求</h4>
      <p
        v-for="line in check.originalPlan"
        :key="line.originalDemandId"
      >
        原方案 #{{ line.planId }}：原始需求 #{{ line.originalDemandId }}，计划补料
        {{ quantity(line.plannedQuantity) }}。
      </p>
      <el-table
        :data="check.supplementRequirements"
        size="small"
      >
        <el-table-column
          prop="demandId"
          label="需求 ID"
          width="95"
        />
        <el-table-column
          prop="itemCode"
          label="物料编码"
        /><el-table-column
          prop="materialVariantCode"
          label="精确版本"
        />
        <el-table-column label="状态"
          ><template #default="{ row }">{{
            row.pendingCorrectionId
              ? MATERIAL_DEMAND_PROGRESS_LABELS.correction_pending
              : DEMAND_BUSINESS_STATUS_LABELS[row.businessStatus as DemandBusinessStatus]
          }}</template></el-table-column
        >
        <el-table-column label="累计领料 / 当前待领"
          ><template #default="{ row }"
            >{{ quantity(row.outboundQuantity) }} /
            {{ quantity(row.businessStatus === 'active' ? row.remainingQuantity : 0) }}
            {{ row.unit }}</template
          ></el-table-column
        >
        <el-table-column
          prop="replacesDemandId"
          label="替代自"
          width="95"
        />
      </el-table>
    </template>
    <template v-if="check.reservations.length">
      <h4>批准后释放的未出库预留</h4>
      <el-table
        :data="check.reservations"
        size="small"
      >
        <el-table-column
          prop="allocationId"
          label="分配 ID"
        /><el-table-column
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
      :title="`先处理待出库单：${check.pendingOutboundNos.join('、')}`"
    />
    <template v-if="check.authorizations.length">
      <h4>原补产授权影响</h4>
      <p
        v-for="authorization in check.authorizations"
        :key="authorization.id"
      >
        授权 #{{ authorization.id }}：{{ authorization.stepName }}，{{
          quantity(authorization.quantity)
        }}
        件。仅在原补料单全部有效要求满足后放行。
      </p>
      <template v-if="check.zeroRemainderImpact">
        <p v-if="newRemainingQuantity !== 0">
          本次仍需新建需求并领齐后才能放行补产，批准更正不会立即增加可执行额度。
        </p>
        <template v-else-if="check.zeroRemainderImpact.fulfillsSupplement">
          <p>
            按本次核对结果，批准后原补料单将齐套，以上原授权具备物料条件。工序执行仍须满足负责人、批次状态及前道正常放行量。
          </p>
          <p>
            立即重开的工序：{{
              check.zeroRemainderImpact.reopenedSteps
                .map(
                  (item) =>
                    item.stepName + '（正常目标 ' + quantity(item.requiredNormalQuantity) + '）',
                )
                .join('、') || '无'
            }}。
          </p>
        </template>
        <p v-else-if="!check.zeroRemainderImpact.hasConfirmedIssue">
          本次免除剩余后整单仍无真实领料，不自动放行补产。
        </p>
        <p v-else>
          仍有未满足要求：{{
            check.zeroRemainderImpact.blockingDemandIds.map((id) => '#' + id).join('、')
          }}，批准本次更正不放行补产。
        </p>
      </template>
      <p>最终批准重新核对上述依据；实际齐套和重开结果保存在更正历史中。</p>
      <p>整张补料单零领料、全部要求免除时，不自动放行补产。</p>
    </template>
  </section>
</template>
<script setup lang="ts">
import type {
  DemandCorrectionCheck,
  DemandCloseCause,
  DemandBusinessStatus,
} from '@company/contracts';
import {
  DEMAND_CLOSE_CAUSE_LABELS,
  DEMAND_BUSINESS_STATUS_LABELS,
  MATERIAL_DEMAND_PROGRESS_LABELS,
} from '@company/constants';
import { formatQuantity as quantity } from '../production-status';
defineProps<{ check: DemandCorrectionCheck; newRemainingQuantity?: number }>();
</script>
<style scoped>
section p {
  color: #606266;
  line-height: 1.6;
}
h4 {
  margin-bottom: 8px;
}
</style>
