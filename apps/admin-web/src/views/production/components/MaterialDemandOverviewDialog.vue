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
            row-key="demandId"
            :expand-row-keys="expandedDemandIds"
            class="group-table"
            @expand-change="handleDemandExpand"
          >
            <el-table-column
              type="expand"
              width="52"
            >
              <template #default="{ row }">
                <div class="demand-evidence">
                  <div>
                    <span>已分配</span
                    ><strong>{{ quantity(row.allocatedQuantity) }} {{ row.unit }}</strong>
                  </div>
                  <div v-if="row.businessStatus === 'active'">
                    <span>未分配缺口</span
                    ><strong>{{ quantity(row.remainingQuantity) }} {{ row.unit }}</strong>
                  </div>
                  <div class="evidence-purchases">
                    <span>采购关系只供追溯，不计入已领量</span>
                    <el-button
                      link
                      type="primary"
                      @click="showPurchases(row.demandId)"
                    >
                      {{
                        purchaseCounts.get(row.demandId) === undefined
                          ? '查看相关采购'
                          : `相关采购 ${purchaseCounts.get(row.demandId)} 单`
                      }}
                    </el-button>
                    <el-button
                      v-if="auth.can(PERMISSIONS.procurement.orders.view)"
                      link
                      type="primary"
                      @click="purchaseFromDemand(row.demandId)"
                      >发起采购</el-button
                    >
                  </div>
                  <div
                    v-if="hasCorrectionTrace(row)"
                    class="correction-trace"
                  >
                    <span>关闭 / 替代</span>
                    <span v-if="row.correction?.closeCause">{{
                      DEMAND_CLOSE_CAUSE_LABELS[row.correction.closeCause as DemandCloseCause]
                    }}</span>
                    <span v-if="row.correction?.replacesDemandId"
                      >替代 #{{ row.correction.replacesDemandId }}</span
                    >
                    <span v-if="row.correction?.replacementDemandId"
                      >后继 #{{ row.correction.replacementDemandId }}</span
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
                    <span v-else-if="row.correction?.closeoutId"
                      >收尾 #{{ row.correction.closeoutId }}，待提交结案审批</span
                    >
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column
              label="物料 / 精确版本"
              min-width="250"
              fixed="left"
            >
              <template #default="{ row }">
                <strong class="material-name">{{ row.itemName }}</strong>
                <div class="material-identity">
                  {{ row.itemCode }} · {{ row.materialVariantCode }}
                </div>
              </template>
            </el-table-column>
            <el-table-column
              label="需求量"
              width="115"
              align="right"
            >
              <template #default="{ row }"
                >{{ quantity(row.demandQuantity) }} {{ row.unit }}</template
              >
            </el-table-column>
            <el-table-column
              label="已领"
              width="115"
              align="right"
            >
              <template #default="{ row }"
                >{{ quantity(row.outboundQuantity) }} {{ row.unit }}</template
              >
            </el-table-column>
            <el-table-column
              label="未领"
              width="130"
              align="right"
            >
              <template #default="{ row }">
                {{ quantity(row.remainingDemandQuantity) }} {{ row.unit }}
                <div
                  v-if="row.businessStatus !== 'active'"
                  class="historical-note"
                >
                  历史余量
                </div>
              </template>
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
              label="操作"
              width="140"
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
  <RelatedPurchasesDialog
    v-model:visible="relatedVisible"
    :demand-id="relatedDemandId"
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
import {
  MATERIAL_DEMAND_PROGRESS_LABELS,
  DEMAND_CLOSE_CAUSE_LABELS,
  PERMISSIONS,
} from '@company/constants';
import DemandCorrectionDialog from './DemandCorrectionDialog.vue';
import RelatedPurchasesDialog from '../../procurement/components/RelatedPurchasesDialog.vue';
import { useRelatedPurchaseCounts } from '../../procurement/composables/useRelatedPurchaseCounts';
import { useAuthStore } from '../../../stores/auth';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateForDisplay } from '../../../utils/date';
import { formatQuantity as quantity } from '../production-status';
import { groupMaterialDemandRows } from '../material-demand-group-presentation';
const router = useRouter();
const auth = useAuthStore();

const props = defineProps<{
  visible: boolean;
  batch: ProductionBatchItem | null;
  demands: ProductionMaterialDemandItem[];
  loading: boolean;
}>();
defineEmits<{ 'update:visible': [boolean]; 'add-manual': []; changed: [] }>();

const correctionDemandId = ref<string | null>(null),
  correctionVisible = ref(false);
const relatedDemandId = ref<string | null>(null),
  relatedVisible = ref(false);
const { counts: purchaseCounts } = useRelatedPurchaseCounts(
  () => props.visible,
  () => props.demands.map((row) => row.demandId),
);
const showPurchases = (id: string): void => {
  relatedDemandId.value = id;
  relatedVisible.value = true;
};
const purchaseFromDemand = async (id: string): Promise<void> => {
  await router.push({
    name: 'procurement-orders',
    query: { demandId: id, workOrderId: props.batch?.workOrderId },
  });
};
const groups = computed(() => groupMaterialDemandRows(props.demands));
const expandedGroups = ref<string[]>([]);
const expandedDemandIds = ref<string[]>([]);
let knownBatchId: string | null = null;
let knownGroupKeys = new Set<string>();
const handleDemandExpand = (
  row: ProductionMaterialDemandItem,
  expandedRows: ProductionMaterialDemandItem[],
): void => {
  const current = new Set(expandedDemandIds.value);
  if (expandedRows.some((entry) => entry.demandId === row.demandId)) current.add(row.demandId);
  else current.delete(row.demandId);
  expandedDemandIds.value = [...current];
};
const hasCorrectionTrace = (row: ProductionMaterialDemandItem): boolean =>
  Boolean(
    row.correction?.closeCause ||
    row.correction?.replacesDemandId ||
    row.correction?.replacementDemandId ||
    row.correction?.closeoutApprovalId ||
    row.correction?.closeoutId,
  );
const canAdd = computed(() =>
  Boolean(
    props.batch &&
    !['pending', 'completed', 'cancelled', 'terminated', 'closing'].includes(props.batch.status),
  ),
);
const progressLabel = (row: ProductionMaterialDemandItem): string =>
  MATERIAL_DEMAND_PROGRESS_LABELS[row.demandProgressStatus];
watch(
  () => [props.batch?.id ?? null, groups.value] as const,
  ([batchId, value]) => {
    const keys = value.map((group) => group.generationGroupKey);
    if (batchId !== knownBatchId) {
      expandedGroups.value = keys;
      expandedDemandIds.value = [];
      knownBatchId = batchId;
    } else {
      expandedGroups.value = keys.filter(
        (key) => expandedGroups.value.includes(key) || !knownGroupKeys.has(key),
      );
      const demandIds = new Set(props.demands.map((row) => row.demandId));
      expandedDemandIds.value = expandedDemandIds.value.filter((id) => demandIds.has(id));
    }
    knownGroupKeys = new Set(keys);
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
.material-name {
  color: #1f2937;
}
.material-identity {
  margin-top: 4px;
  color: #6b7280;
}
.historical-note {
  color: #6b7280;
  font-size: 12px;
}
.demand-evidence {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 24px;
  padding: 8px 20px;
}
.demand-evidence > div {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.demand-evidence span:first-child {
  color: #6b7280;
}
.correction-trace {
  width: 100%;
}
</style>
