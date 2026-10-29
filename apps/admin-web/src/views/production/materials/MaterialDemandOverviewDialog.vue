<template>
  <el-dialog
    :model-value="visible"
    :title="`物料需求${batch ? ` · ${batch.batchNo}` : ''}`"
    :width="DialogWidth.workbench"
    :before-close="beforeClose"
    workbench
  >
    <div class="overview-toolbar">
      <div
        v-if="batch"
        class="batch-context"
      >
        <span>{{ batch.workOrderNo }}</span>
        <span>{{ batch.productCode }} · {{ batch.productName }}</span>
      </div>
      <div class="toolbar-actions">
        <el-button
          :disabled="!hasCollapsedGroups"
          @click="expandAllGroups"
          >全部展开</el-button
        >
        <el-button
          :disabled="!hasExpandedGroups"
          @click="collapseAllGroups"
          >全部收起</el-button
        >
        <el-button
          :loading="loading"
          @click="$emit('refresh')"
          >刷新</el-button
        >
        <el-button
          v-if="canAdd"
          type="primary"
          @click="addManual"
        >
          人工追加需求
        </el-button>
      </div>
    </div>
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      :closable="false"
      show-icon
    />
    <div
      v-else
      v-loading="loading"
      class="overview-body"
    >
      <el-empty
        v-if="demandGroups.length === 0 && !loading"
        description="当前任务没有已生成需求"
      />
      <MaterialDemandGroupSection
        v-for="group in demandGroups"
        :key="group.generationGroupKey"
        class="demand-group"
        :title="generationGroupTitle(group)"
        :count="group.rows.length"
        :summary="`本次生成 ${formatDateTimeForDisplay(group.rows[0]?.createdAt)}`"
        :expanded="!collapsedGroupKeys.has(group.generationGroupKey)"
        @toggle="toggleGroup(group.generationGroupKey)"
      >
        <el-table
          :data="group.rows"
          row-key="demandId"
        >
          <el-table-column
            label="需求 ID"
            width="140"
            fixed="left"
          >
            <template #default="{ row }">
              <span class="demand-id">id:{{ row.demandId }}</span>
              <div
                v-if="row.correction?.replacesDemandId"
                class="secondary"
              >
                更正自 id:{{ row.correction.replacesDemandId }}
              </div>
            </template>
          </el-table-column>
          <el-table-column
            label="物料 / 精确版本"
            min-width="210"
            fixed="left"
          >
            <template #default="{ row }">
              <strong>{{ row.itemName }}</strong>
              <div class="secondary">{{ row.itemCode }} · {{ row.materialVariantCode }}</div>
            </template>
          </el-table-column>
          <el-table-column
            label="需求量"
            width="100"
            align="right"
          >
            <template #default="{ row }"
              >{{ quantity(row.demandQuantity) }} {{ row.unit }}</template
            >
          </el-table-column>
          <el-table-column
            label="已领"
            width="100"
            align="right"
          >
            <template #default="{ row }"
              >{{ quantity(row.outboundQuantity) }} {{ row.unit }}</template
            >
          </el-table-column>
          <el-table-column
            label="未领"
            width="100"
            align="right"
          >
            <template #default="{ row }">
              {{ quantity(row.remainingDemandQuantity) }} {{ row.unit }}
              <div
                v-if="row.businessStatus !== 'active'"
                class="secondary"
              >
                历史余量
              </div>
            </template>
          </el-table-column>
          <el-table-column
            label="需求状态"
            min-width="150"
          >
            <template #default="{ row }">
              <el-tag
                :type="materialDemandProgressMeta(row.demandProgressStatus).type"
                effect="light"
                size="small"
                >{{ materialDemandProgressMeta(row.demandProgressStatus).label }}</el-tag
              >
              <div
                v-if="row.correction?.replacementDemandId"
                class="secondary"
              >
                已由 id:{{ row.correction.replacementDemandId }} 替代
              </div>
              <template v-else-if="row.businessStatus === 'active'">
                <div class="secondary">
                  已分配 {{ quantity(row.allocatedQuantity) }} {{ row.unit }}
                </div>
                <div class="secondary">
                  未分配 {{ quantity(row.remainingQuantity) }} {{ row.unit }}
                </div>
              </template>
            </template>
          </el-table-column>
          <el-table-column
            label="操作"
            width="180"
            fixed="right"
          >
            <template #default="{ row }">
              <div class="row-actions">
                <el-button
                  link
                  type="primary"
                  @click="showPurchases(row.demandId)"
                  >相关采购</el-button
                >
                <el-button
                  link
                  type="primary"
                  @click="showTrace(row.demandId)"
                  >变更追溯</el-button
                >
              </div>
            </template>
          </el-table-column>
        </el-table>
      </MaterialDemandGroupSection>
    </div>
    <template #footer><el-button @click="close">关闭</el-button></template>
  </el-dialog>
  <ProductionDemandTraceDialog
    ref="traceDialog"
    v-model:visible="traceVisible"
    :batch="batch"
    :demand-id="traceDemandId"
    :demands="demands"
    @correct="openCorrection"
  />
  <DemandCorrectionDialog
    ref="correctionDialog"
    v-model:visible="correctionVisible"
    :demand-id="correctionDemandId"
    @changed="correctionChanged"
  />
  <RelatedPurchasesDialog
    v-model:visible="relatedVisible"
    :demand-id="relatedDemandId"
    :work-order-id="batch?.workOrderId ?? null"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ProductionBatchItem, ProductionMaterialDemandItem } from '@company/contracts';
import DemandCorrectionDialog from './DemandCorrectionDialog.vue';
import MaterialDemandGroupSection from './MaterialDemandGroupSection.vue';
import ProductionDemandTraceDialog from './ProductionDemandTraceDialog.vue';
import RelatedPurchasesDialog from '../../procurement/components/RelatedPurchasesDialog.vue';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { formatQuantity as quantity } from '../../../utils/quantity';
import { materialDemandProgressMeta } from '../shared/production-status';
import {
  groupMaterialDemandRows,
  type MaterialDemandGroup,
} from './material-demand-group-presentation';

const props = defineProps<{
  visible: boolean;
  batch: ProductionBatchItem | null;
  demands: ProductionMaterialDemandItem[];
  loading: boolean;
  error?: string;
}>();
const emit = defineEmits<{
  'update:visible': [boolean];
  'add-manual': [];
  changed: [];
  refresh: [];
}>();
const correctionDialog = ref<InstanceType<typeof DemandCorrectionDialog> | null>(null);
const traceDialog = ref<InstanceType<typeof ProductionDemandTraceDialog> | null>(null);
const correctionDemandId = ref<string | null>(null);
const correctionVisible = ref(false);
const traceDemandId = ref<string | null>(null);
const traceVisible = ref(false);
const relatedDemandId = ref<string | null>(null);
const relatedVisible = ref(false);
const demandGroups = computed(() => groupMaterialDemandRows(props.demands));
const collapsedGroupKeys = ref(new Set<string>());
const hasCollapsedGroups = computed(() =>
  demandGroups.value.some((group) => collapsedGroupKeys.value.has(group.generationGroupKey)),
);
const hasExpandedGroups = computed(() =>
  demandGroups.value.some((group) => !collapsedGroupKeys.value.has(group.generationGroupKey)),
);
const toggleGroup = (key: string): void => {
  if (collapsedGroupKeys.value.has(key)) collapsedGroupKeys.value.delete(key);
  else collapsedGroupKeys.value.add(key);
};
const expandAllGroups = (): void => collapsedGroupKeys.value.clear();
const collapseAllGroups = (): void => {
  for (const group of demandGroups.value) collapsedGroupKeys.value.add(group.generationGroupKey);
};
watch(
  [() => props.visible, () => props.batch?.id],
  () => {
    collapsedGroupKeys.value = new Set();
  },
  { flush: 'sync' },
);
const generationGroupTitle = (group: MaterialDemandGroup<ProductionMaterialDemandItem>): string =>
  group.rows.some((row) => row.correction?.replacesDemandId)
    ? `更正生成 · 来源 ${group.supplementNo ?? group.label}`
    : group.label;
const closeEditor = async (): Promise<boolean> =>
  !correctionVisible.value || (await correctionDialog.value?.close()) === true;
const close = async (): Promise<boolean> => {
  if (!(await closeEditor())) return false;
  traceVisible.value = false;
  relatedVisible.value = false;
  emit('update:visible', false);
  return true;
};
const beforeClose = async (done: () => void): Promise<void> => {
  if (await close()) done();
};
const showPurchases = async (id: string): Promise<void> => {
  if (!(await closeEditor())) return;
  traceVisible.value = false;
  relatedDemandId.value = id;
  relatedVisible.value = true;
};
const showTrace = async (id: string): Promise<void> => {
  if (!(await closeEditor())) return;
  relatedVisible.value = false;
  traceDemandId.value = id;
  traceVisible.value = true;
};
const openCorrection = async (id: string): Promise<void> => {
  if (!(await closeEditor())) return;
  correctionDemandId.value = id;
  correctionVisible.value = true;
};
const correctionChanged = (): void => {
  emit('changed');
  if (traceVisible.value) void traceDialog.value?.refresh();
};
const addManual = async (): Promise<void> => {
  if (await closeEditor()) emit('add-manual');
};
const canAdd = computed(() =>
  Boolean(
    props.batch &&
    !['pending', 'completed', 'cancelled', 'terminated', 'closing'].includes(props.batch.status),
  ),
);
watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      traceVisible.value = false;
      relatedVisible.value = false;
    }
  },
);
defineExpose({ close });
</script>

<style scoped>
.overview-toolbar,
.batch-context,
.toolbar-actions,
.row-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.overview-toolbar {
  justify-content: space-between;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.batch-context {
  flex-wrap: wrap;
  color: var(--el-text-color-regular);
}
.overview-body {
  min-height: 180px;
}
.demand-group + .demand-group {
  margin-top: 16px;
}
.demand-id {
  white-space: nowrap;
}
.secondary {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.toolbar-actions .el-button + .el-button,
.row-actions .el-button + .el-button {
  margin-left: 0;
}
</style>
