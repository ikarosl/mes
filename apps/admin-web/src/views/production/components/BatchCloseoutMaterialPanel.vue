<template>
  <section>
    <p class="muted">
      {{
        check.termination
          ? '以下为结束时保存的物料快照，可退上限不代表当前可退数量或现场实物余量。'
          : '按原分配逐项核对来源需求和库存批次。可退上限不代表现场实物余量；核对说明不会自动办理退料。'
      }}
    </p>
    <el-table
      :data="rows"
      row-key="allocationId"
      empty-text="没有需要核对的分配来源"
    >
      <el-table-column
        label="来源需求 / 原分配"
        min-width="210"
      >
        <template #default="{ row }">
          <strong>需求 #{{ row.review?.demandId ?? '—' }} · 分配 #{{ row.allocationId }}</strong>
          <div
            v-if="row.demand"
            class="muted"
          >
            {{ DEMAND_GENERATION_GROUP_TYPE_LABELS[row.demand.demandType as DemandType] }} · 原需求
            {{ quantity(row.demand.demandQuantity) }} {{ row.unit }}
          </div>
          <div class="muted">本次分配 {{ quantity(row.assignedQuantity) }} {{ row.unit }}</div>
        </template>
      </el-table-column>
      <el-table-column
        label="物料 / 版本 / 库存批次"
        min-width="190"
      >
        <template #default="{ row }"
          >{{ row.itemCode }}
          <div>{{ row.materialVariantCode }}</div>
          <div class="muted">库存批次 {{ row.inventoryBatchCode }}</div></template
        >
      </el-table-column>
      <el-table-column
        label="已领 / 退料占用 / 损耗占用"
        width="210"
        ><template #default="{ row }"
          >{{ quantity(row.outboundQuantity) }} / {{ quantity(row.returnQuantity) }} /
          {{ quantity(row.lossQuantity) }} {{ row.unit }}</template
        ></el-table-column
      >
      <el-table-column
        :label="readonly ? '可退上限' : '可退 / 可登记上限'"
        width="150"
        ><template #default="{ row }"
          >{{ quantity(row.returnableQuantity) }} {{ row.unit }}</template
        ></el-table-column
      >
      <el-table-column
        label="核对结果与安排"
        min-width="240"
      >
        <template #default="{ row }">
          <el-tag
            v-if="row.review || !check.termination"
            :type="row.review?.status === 'reviewed' ? 'success' : 'warning'"
            size="small"
            >{{
              BATCH_CLOSEOUT_MATERIAL_REVIEW_LABELS[
                (row.review?.status ?? 'pending') as BatchCloseoutMaterialReview['status']
              ]
            }}</el-tag
          >
          <span
            v-else
            class="muted"
            >未记录逐项实核结果</span
          >
          <div
            v-if="row.review?.reason"
            class="review-note"
          >
            {{ row.review.reason }}
          </div>
          <div
            v-if="row.review?.reviewedAt"
            class="muted"
          >
            {{ row.review.reviewedAt }} · 操作人 #{{ row.review.actorId }}
          </div>
        </template>
      </el-table-column>
      <el-table-column
        v-if="detail && !readonly"
        label="操作"
        width="170"
        fixed="right"
      >
        <template #default="{ row }">
          <el-button
            link
            type="primary"
            :disabled="locked"
            @click="emit('review', row)"
            >{{ row.review?.status === 'reviewed' ? '更新安排' : '核对安排' }}</el-button
          >
          <slot
            name="actions"
            :row="row"
          />
        </template>
      </el-table-column>
    </el-table>
    <slot />
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import type {
  BatchCloseoutDetail,
  BatchCloseoutMaterialReview,
  BatchTerminationCheck,
  BatchTerminationMaterial,
  DemandType,
} from '@company/contracts';
import {
  BATCH_CLOSEOUT_MATERIAL_REVIEW_LABELS,
  DEMAND_GENERATION_GROUP_TYPE_LABELS,
} from '@company/constants';
import { formatQuantity as quantity } from '../production-status';
const props = defineProps<{
  check: BatchTerminationCheck;
  detail: BatchCloseoutDetail | null;
  readonly: boolean;
  locked: boolean;
}>();
const emit = defineEmits<{ review: [BatchTerminationMaterial] }>();
const rows = computed(() =>
  props.check.materials.map((material) => {
    const review = props.detail?.materialReviews.find(
      (row) => row.allocationId === material.allocationId,
    );
    return {
      ...material,
      review,
      demand: props.detail?.demands.find((row) => row.id === review?.demandId),
    };
  }),
);
</script>
<style scoped>
.muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.7;
}
.review-note {
  margin-top: 6px;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
