<template>
  <el-dialog
    :model-value="visible"
    :title="`物料需求${batch ? ` · ${batch.batchNo}` : ''}`"
    :width="DialogWidth.workbench"
    workbench
    @update:model-value="$emit('update:visible', $event)"
  >
    <div class="overview-toolbar">
      <div
        v-if="batch"
        class="batch-context"
      >
        <span>{{ batch.workOrderNo }}</span>
        <span>{{ batch.productCode }} · {{ batch.productName }}</span>
      </div>
      <el-button
        v-if="canAdd"
        type="primary"
        @click="$emit('add-manual')"
      >
        人工追加需求
      </el-button>
    </div>
    <div
      v-loading="loading"
      class="overview-body"
    >
      <el-empty
        v-if="!loading && groups.length === 0"
        description="当前任务没有已生成需求"
      />
      <el-collapse
        v-else
        v-model="expandedGroups"
      >
        <el-collapse-item
          v-for="group in groups"
          :key="group.generationGroupKey"
          :name="group.generationGroupKey"
        >
          <template #title>
            <div class="group-title">
              <strong>{{ group.label }}</strong>
              <span>{{ formatDateForDisplay(group.rows[0]?.createdAt) }}</span>
              <span
                v-if="group.rows[0]?.generationReason"
                class="group-reason"
              >
                {{ group.rows[0].generationReason }}
              </span>
              <el-tag
                size="small"
                type="info"
                >{{ group.rows.length }} 条</el-tag
              >
            </div>
          </template>
          <el-table
            :data="group.rows"
            class="group-table"
          >
            <el-table-column
              prop="itemCode"
              label="基础物料编码"
              min-width="150"
              fixed="left"
            />
            <el-table-column
              label="物料名称"
              min-width="150"
            >
              <template #default="{ row }">{{ row.itemName }}</template>
            </el-table-column>
            <el-table-column
              prop="materialVariantCode"
              label="具体版本"
              min-width="190"
            />
            <el-table-column
              label="需求 / 已分配 / 已出库"
              min-width="230"
            >
              <template #default="{ row }">
                {{ quantity(row.demandQuantity) }} / {{ quantity(row.allocatedQuantity) }} /
                {{ quantity(row.outboundQuantity) }} {{ row.unit }}
              </template>
            </el-table-column>
            <el-table-column
              label="剩余缺口"
              width="120"
              align="right"
            >
              <template #default="{ row }">{{ quantity(row.remainingQuantity) }}</template>
            </el-table-column>
            <el-table-column
              label="进度"
              width="120"
            >
              <template #default="{ row }">
                <el-tag size="small">{{ progressLabel(row) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column
              label="关闭 / 替代关系"
              min-width="200"
            >
              <template #default="{ row }">
                <span v-if="row.correction?.closeCause">{{
                  DEMAND_CLOSE_CAUSE_LABELS[row.correction.closeCause as DemandCloseCause]
                }}</span>
                <span v-if="row.correction?.replacesDemandId">
                  · 替代 #{{ row.correction.replacesDemandId }}</span
                >
                <span v-if="row.correction?.replacementDemandId">
                  · 后继 #{{ row.correction.replacementDemandId }}</span
                >
                <el-button
                  v-if="row.correction?.closeoutApprovalId"
                  link
                  type="primary"
                  @click="
                    router.push({
                      name: 'approval-inbox',
                      query: { instanceId: row.correction.closeoutApprovalId },
                    })
                  "
                  >结案审批</el-button
                >
                <span v-else-if="row.correction?.closeoutId">
                  · 收尾 #{{ row.correction.closeoutId }}，待提交结案审批</span
                >
              </template>
            </el-table-column>
            <el-table-column
              label="操作"
              width="150"
              fixed="right"
            >
              <template #default="{ row }"
                ><el-button
                  link
                  type="primary"
                  @click="
                    correctionDemandId = row.demandId;
                    correctionVisible = true;
                  "
                  >{{
                    ['manual_additional', 'scrap_supplement'].includes(row.demandType) &&
                    row.businessStatus === 'active' &&
                    !row.correction?.pendingCorrectionId
                      ? '更正此需求'
                      : '查看更正与追溯'
                  }}</el-button
                ></template
              >
            </el-table-column>
          </el-table>
        </el-collapse-item>
      </el-collapse>
    </div>
    <template #footer><el-button @click="$emit('update:visible', false)">关闭</el-button></template>
  </el-dialog>
  <DemandCorrectionDialog
    v-model:visible="correctionVisible"
    :demand-id="correctionDemandId"
    @changed="$emit('changed')"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type {
  ProductionBatchItem,
  ProductionMaterialDemandItem,
  DemandCloseCause,
} from '@company/contracts';
import { MATERIAL_DEMAND_PROGRESS_LABELS, DEMAND_CLOSE_CAUSE_LABELS } from '@company/constants';
import DemandCorrectionDialog from './DemandCorrectionDialog.vue';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateForDisplay } from '../../../utils/date';
import { formatQuantity as quantity } from '../production-status';
import { groupMaterialDemandRows } from '../material-demand-group-presentation';
const router = useRouter();

const props = defineProps<{
  visible: boolean;
  batch: ProductionBatchItem | null;
  demands: ProductionMaterialDemandItem[];
  loading: boolean;
}>();
defineEmits<{ 'update:visible': [boolean]; 'add-manual': []; changed: [] }>();

const correctionDemandId = ref<string | null>(null),
  correctionVisible = ref(false);
const groups = computed(() => groupMaterialDemandRows(props.demands));
const expandedGroups = ref<string[]>([]);
const canAdd = computed(() =>
  Boolean(
    props.batch &&
    !['pending', 'completed', 'cancelled', 'terminated', 'closing'].includes(props.batch.status),
  ),
);
const progressLabel = (row: ProductionMaterialDemandItem): string =>
  MATERIAL_DEMAND_PROGRESS_LABELS[row.demandProgressStatus];
watch(
  groups,
  (value) => {
    expandedGroups.value = value.map((group) => group.generationGroupKey);
  },
  { immediate: true },
);
</script>

<style scoped>
.overview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.batch-context {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  color: #606266;
}
.overview-body {
  min-height: 180px;
}
.group-title {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}
.group-title span {
  color: #909399;
  font-size: 12px;
}
.group-title .group-reason {
  overflow: hidden;
  max-width: 360px;
  color: #606266;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.group-table {
  margin-bottom: 12px;
}
</style>
