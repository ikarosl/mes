<template>
  <el-dialog
    :model-value="visible"
    title="物料需求与分配"
    :width="DialogWidth.xl"
    @update:model-value="$emit('update:visible', $event)"
  >
    <div
      v-loading="loadingDemands"
      class="dialog-body"
    >
      <el-empty
        v-if="demandGroups.length === 0 && !loadingDemands"
        description="当前任务没有物料需求"
      />
      <section
        v-for="group in demandGroups"
        :key="group.generationGroupKey"
        class="demand-group"
      >
        <header class="demand-group-header">
          <strong>{{ generationGroupLabel(group) }}</strong>
          <span>{{ formatDateForDisplay(group.createdAt) }}</span>
        </header>
        <el-table
          :data="group.demands"
          :row-class-name="demandRowClassName"
          @row-click="selectDemand"
        >
          <el-table-column
            label="选择"
            width="64"
            align="center"
          >
            <template #default="{ row }">
              <el-radio
                v-model="selectedDemandId"
                :value="row.demandId"
                :aria-label="`选择需求 ${row.itemCode}`"
                @change="selectDemand(row)"
              />
            </template>
          </el-table-column>
          <el-table-column
            prop="itemCode"
            label="基础物料编码"
            min-width="130"
          />
          <el-table-column
            prop="materialVariantCode"
            label="物料版本"
            min-width="190"
          >
            <template #default="{ row }">{{ row.materialVariantCode || '未选择版本' }}</template>
          </el-table-column>
          <el-table-column
            prop="itemName"
            label="物料名称"
            min-width="170"
          />
          <el-table-column
            label="需求/已分配/已出库"
            min-width="210"
          >
            <template #default="{ row }"
              >{{ formatQuantity(row.demandQuantity) }} /
              {{ formatQuantity(row.allocatedQuantity) }} /
              {{ formatQuantity(row.outboundQuantity) }} {{ row.unit }}</template
            >
          </el-table-column>
          <el-table-column
            label="剩余缺口"
            width="120"
            ><template #default="{ row }">{{
              formatQuantity(row.remainingQuantity)
            }}</template></el-table-column
          >
          <el-table-column
            label="进度"
            width="110"
            ><template #default="{ row }"
              ><el-tag>{{ progressLabel(row.demandProgressStatus) }}</el-tag></template
            ></el-table-column
          >
        </el-table>
      </section>

      <section
        v-if="selectedDemand"
        class="allocation-section"
      >
        <h3>{{ selectedDemand.itemName }} · 库存批次分配</h3>
        <el-form
          v-if="selectedDemandCanAllocate"
          :inline="true"
          class="allocation-form"
        >
          <el-form-item label="库存批次">
            <el-select
              v-model="form.itemBatchId"
              filterable
              placeholder="选择库存批次"
              :loading="loadingAvailable"
              @visible-change="handleAvailableVisible"
            >
              <el-option
                v-for="item in exactAvailableItemBatches"
                :key="item.itemBatchId"
                :value="item.itemBatchId"
                :label="`${item.materialVariantCode || item.itemCode} · ${item.batchCode}（可分配 ${formatQuantity(item.availableToAllocateQuantity)}）`"
                :disabled="Number(item.availableToAllocateQuantity) <= 0"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="分配数量"
            ><el-input-number
              v-model="form.assignedQuantity"
              :min="1"
              :step="1"
              :precision="0"
          /></el-form-item>
          <el-form-item
            ><el-button
              type="primary"
              :loading="submitting"
              :disabled="!canAllocate"
              @click="submitAllocation"
              >确认分配</el-button
            ></el-form-item
          >
        </el-form>
        <el-alert
          v-else
          title="当前需求已无可分配缺口，仅可查看历史分配记录"
          type="info"
          :closable="false"
          show-icon
        />
        <el-table
          :data="selectedDemand.allocations"
          empty-text="暂无分配记录"
        >
          <el-table-column
            prop="batchCode"
            label="库存批次 / 版本"
            min-width="150"
          >
            <template #default="{ row }">
              <div>{{ row.batchCode }}</div>
              <div class="secondary">{{ row.materialVariantCode || '未记录版本' }}</div>
            </template>
          </el-table-column>
          <el-table-column
            label="分配数量"
            width="110"
            ><template #default="{ row }">{{
              formatQuantity(row.assignedQuantity)
            }}</template></el-table-column
          >
          <el-table-column
            label="已出库"
            width="110"
            ><template #default="{ row }">{{
              formatQuantity(row.outboundQuantity)
            }}</template></el-table-column
          >
          <el-table-column
            label="状态"
            width="100"
            ><template #default="{ row }">{{
              allocationLabel(row.allocationStatus)
            }}</template></el-table-column
          >
          <el-table-column
            label="操作"
            width="90"
            ><template #default="{ row }"
              ><el-button
                link
                type="danger"
                :loading="releasePendingIds.has(row.allocationId)"
                :disabled="row.allocationStatus !== 'active' || Number(row.outboundQuantity) > 0"
                @click="confirmRelease(row)"
                >释放</el-button
              ></template
            ></el-table-column
          >
        </el-table>
      </section>
    </div>
    <template #footer><el-button @click="$emit('update:visible', false)">关闭</el-button></template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type {
  AllocationStatus,
  AvailableItemBatchItem,
  DemandGenerationGroupType,
  ProductionMaterialAllocationItem,
  ProductionMaterialDemandItem,
} from '@company/contracts';
import {
  ALLOCATION_STATUS_LABELS,
  DEMAND_GENERATION_GROUP_TYPE_LABELS,
  MATERIAL_DEMAND_PROGRESS_LABELS,
} from '@company/constants';
import { DialogWidth } from '../../../utils/dialog';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { formatDateForDisplay } from '../../../utils/date';
import { formatQuantity } from '../production-status';

interface DemandGenerationGroupView {
  generationGroupKey: string;
  generationGroupType: DemandGenerationGroupType;
  supplementNo: string | null;
  createdAt: string;
  demands: ProductionMaterialDemandItem[];
}

const props = defineProps<{
  visible: boolean;
  demands: ProductionMaterialDemandItem[];
  availableItemBatches: AvailableItemBatchItem[];
  loadingDemands: boolean;
  loadingAvailable: boolean;
  submitting: boolean;
  releasePendingIds: Set<string>;
}>();
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'load-available', demandId: string): void;
  (
    e: 'allocate',
    payload: {
      allocations: Array<{ demandId: string; itemBatchId: string; assignedQuantity: number }>;
    },
  ): void;
  (e: 'release', allocation: ProductionMaterialAllocationItem): void;
}>();
const selectedDemandId = ref<string | null>(null);
const form = reactive({ itemBatchId: '', assignedQuantity: 1 });
const selectedDemand = computed(
  () => props.demands.find((item) => item.demandId === selectedDemandId.value) ?? null,
);
const demandGroups = computed<DemandGenerationGroupView[]>(() => {
  const groups = new Map<string, DemandGenerationGroupView>();
  for (const demand of props.demands) {
    const existing = groups.get(demand.generationGroupKey);
    if (existing) {
      existing.demands.push(demand);
      continue;
    }
    groups.set(demand.generationGroupKey, {
      generationGroupKey: demand.generationGroupKey,
      generationGroupType: demand.generationGroupType,
      supplementNo: demand.supplementNo,
      createdAt: demand.createdAt,
      demands: [demand],
    });
  }
  return [...groups.values()];
});
const selectedBatch = computed(() =>
  props.availableItemBatches.find((item) => item.itemBatchId === form.itemBatchId),
);
const exactAvailableItemBatches = computed(() => {
  const variantId = selectedDemand.value?.materialVariantId;
  return variantId
    ? props.availableItemBatches.filter((item) => item.materialVariantId === variantId)
    : [];
});
const selectedBatchMatchesDemand = computed(
  () =>
    Boolean(selectedDemand.value) &&
    Boolean(selectedBatch.value) &&
    selectedBatch.value?.materialVariantId === selectedDemand.value?.materialVariantId,
);
const selectedDemandCanAllocate = computed(() => {
  const demand = selectedDemand.value;
  return Boolean(
    demand && demand.businessStatus === 'active' && Number(demand.remainingQuantity) > 0,
  );
});
const canAllocate = computed(() =>
  Boolean(
    selectedDemandCanAllocate.value &&
    selectedBatchMatchesDemand.value &&
    form.itemBatchId &&
    Number.isInteger(form.assignedQuantity) &&
    form.assignedQuantity > 0 &&
    form.assignedQuantity <= Number(selectedDemand.value?.remainingQuantity ?? 0) &&
    form.assignedQuantity <= Number(selectedBatch.value?.availableToAllocateQuantity ?? 0),
  ),
);
watch(
  () => props.visible,
  (visible) => {
    if (visible) selectDefaultDemand();
  },
);
watch(
  () => props.demands,
  () => {
    if (selectedDemandId.value && !selectedDemand.value) selectedDemandId.value = null;
    if (props.visible && !selectedDemandId.value) selectDefaultDemand();
  },
  { deep: true },
);
const selectDefaultDemand = (): void => {
  const oldestActionableGroup = demandGroups.value.find((group) =>
    group.demands.some(
      (item) => item.businessStatus === 'active' && Number(item.remainingQuantity) > 0,
    ),
  );
  const demand =
    oldestActionableGroup?.demands.find(
      (item) => item.businessStatus === 'active' && Number(item.remainingQuantity) > 0,
    ) ?? demandGroups.value[0]?.demands[0];
  if (demand) selectDemand(demand);
};
const selectDemand = (row: ProductionMaterialDemandItem | null) => {
  if (!row) return;
  selectedDemandId.value = row.demandId;
  form.itemBatchId = '';
  form.assignedQuantity = Math.max(1, Number(row.remainingQuantity));
  if (row.businessStatus === 'active' && Number(row.remainingQuantity) > 0)
    emit('load-available', row.demandId);
};
const submitAllocation = () => {
  if (!selectedDemand.value || !canAllocate.value) return;
  emit('allocate', {
    allocations: [
      {
        demandId: selectedDemand.value.demandId,
        itemBatchId: form.itemBatchId,
        assignedQuantity: form.assignedQuantity,
      },
    ],
  });
};
const handleAvailableVisible = (visible: boolean) => {
  if (visible && selectedDemand.value && selectedDemandCanAllocate.value)
    emit('load-available', selectedDemand.value.demandId);
};
const confirmRelease = async (row: ProductionMaterialAllocationItem) => {
  try {
    await RouteMessageBox.confirm(`确认释放库存批次 ${row.batchCode} 的未出库分配？`, '释放分配', {
      type: 'warning',
      confirmButtonText: '确认释放',
      cancelButtonText: '取消',
    });
    emit('release', row);
  } catch {
    /* 用户取消 */
  }
};
const progressLabel = (status: ProductionMaterialDemandItem['demandProgressStatus']): string =>
  MATERIAL_DEMAND_PROGRESS_LABELS[status];
const allocationLabel = (status: AllocationStatus) => ALLOCATION_STATUS_LABELS[status];
const generationGroupLabel = (group: DemandGenerationGroupView): string => {
  const label = DEMAND_GENERATION_GROUP_TYPE_LABELS[group.generationGroupType];
  return group.supplementNo ? `${label} ${group.supplementNo}` : label;
};
const demandRowClassName = ({ row }: { row: ProductionMaterialDemandItem }): string =>
  row.demandId === selectedDemandId.value ? 'selected-demand-row' : '';
</script>

<style scoped>
.dialog-body {
  max-height: 70vh;
  overflow-y: auto;
}
.demand-group + .demand-group {
  margin-top: 18px;
}
.demand-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  color: #1f2937;
}
.demand-group-header span {
  color: #6b7280;
  font-size: 13px;
}
.secondary {
  color: #6b7280;
  font-size: 12px;
}
.demand-group :deep(.selected-demand-row) {
  --el-table-tr-bg-color: var(--el-color-primary-light-9);
}
.allocation-section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
}
.allocation-section h3 {
  margin: 0 0 16px;
  color: #1f2937;
  font-size: 16px;
}
.allocation-form {
  padding: 16px 16px 0;
  border-radius: 8px;
  background: #f9fafb;
}
.allocation-form :deep(.el-select) {
  width: 280px;
}
</style>
