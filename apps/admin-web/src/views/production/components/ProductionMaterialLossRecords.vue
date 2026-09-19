<template>
  <section class="loss-records">
    <h4>领料损耗记录（{{ records.length }}）</h4>
    <p class="muted">
      仅待确认或已确认记录占用可退上限；已取消记录不占用。结案损坏只留存损耗事实，不生成补料、不补产，也不计入成品报废。
    </p>
    <el-table
      :data="records"
      row-key="id"
      size="small"
      empty-text="未登记领料损耗或结案损坏"
    >
      <el-table-column
        label="单据 / 用途"
        min-width="200"
        ><template #default="{ row }"
          ><strong>{{ row.scrapNo }}</strong>
          <div>{{ MATERIAL_LOSS_PURPOSE_LABELS[row.purpose as MaterialLossPurpose] }}</div>
          <div class="muted">
            {{ row.closeoutId ? `收尾记录 #${row.closeoutId}` : '生产过程中申报' }}
          </div></template
        ></el-table-column
      >
      <el-table-column
        label="来源 / 物料"
        min-width="235"
        ><template #default="{ row }"
          ><div>需求 #{{ row.demandId }} · 分配 #{{ row.allocationId }}</div>
          <div>{{ row.itemCode }} · {{ row.materialVariantCode }}</div>
          <div class="muted">库存批次 {{ row.inventoryBatchCode }}</div></template
        ></el-table-column
      >
      <el-table-column
        label="数量 / 状态"
        min-width="120"
        ><template #default="{ row }"
          ><div>{{ quantity(row.scrapQuantity) }} {{ row.unit }}</div>
          <el-tag
            size="small"
            :type="
              row.status === 'confirmed' ? 'success' : row.status === 'pending' ? 'warning' : 'info'
            "
            >{{ scrapStatusLabel(row.status) }}</el-tag
          ></template
        ></el-table-column
      >
      <el-table-column
        prop="reason"
        label="原因"
        min-width="210"
      />
      <el-table-column
        label="登记 / 确认"
        min-width="210"
        ><template #default="{ row }"
          ><div>登记人 #{{ row.createdBy }} · {{ formatDateTimeForDisplay(row.createdAt) }}</div>
          <div
            v-if="row.confirmedAt"
            class="muted"
          >
            确认人 #{{ row.confirmedBy }} · {{ formatDateTimeForDisplay(row.confirmedAt) }}
          </div></template
        ></el-table-column
      >
    </el-table>
  </section>
</template>
<script setup lang="ts">
import type { BatchTerminationLossRecord, MaterialLossPurpose } from '@company/contracts';
import { MATERIAL_LOSS_PURPOSE_LABELS } from '@company/constants';
import { scrapStatusLabel } from '../../../constants/business-status';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { formatQuantity as quantity } from '../production-status';
defineProps<{ records: BatchTerminationLossRecord[] }>();
</script>
<style scoped>
.loss-records {
  margin-top: 20px;
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.7;
}
</style>
