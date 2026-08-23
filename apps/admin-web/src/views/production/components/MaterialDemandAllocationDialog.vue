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
      <el-table
        :data="demands"
        highlight-current-row
        @current-change="selectDemand"
      >
        <el-table-column
          prop="itemCode"
          label="物料编码"
          min-width="130"
        />
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
            {{ formatQuantity(row.allocatedQuantity) }} / {{ formatQuantity(row.outboundQuantity) }}
            {{ row.unit }}</template
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
            ><el-tag>{{ progressLabel(row.progressStatus) }}</el-tag></template
          ></el-table-column
        >
      </el-table>

      <section
        v-if="selectedDemand"
        class="allocation-section"
      >
        <h3>{{ selectedDemand.itemName }} · 库存批次分配</h3>
        <el-form
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
                v-for="item in availableItemBatches"
                :key="item.itemBatchId"
                :value="item.itemBatchId"
                :label="`${item.batchCode}（可分配 ${formatQuantity(item.availableToAllocateQuantity)}）`"
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
        <el-table
          :data="selectedDemand.allocations"
          empty-text="暂无分配记录"
        >
          <el-table-column
            prop="batchCode"
            label="库存批次"
            min-width="150"
          />
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
  ProductionMaterialAllocationItem,
  ProductionMaterialDemandItem,
} from '@company/contracts';
import { ALLOCATION_STATUS_LABELS, MATERIAL_DEMAND_PROGRESS_LABELS } from '@company/constants';
import { DialogWidth } from '../../../utils/dialog';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { formatQuantity } from '../production-status';

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
const selectedBatch = computed(() =>
  props.availableItemBatches.find((item) => item.itemBatchId === form.itemBatchId),
);
const canAllocate = computed(() =>
  Boolean(
    selectedDemand.value &&
    form.itemBatchId &&
    Number.isInteger(form.assignedQuantity) &&
    form.assignedQuantity > 0 &&
    form.assignedQuantity <= Number(selectedDemand.value.remainingQuantity) &&
    form.assignedQuantity <= Number(selectedBatch.value?.availableToAllocateQuantity ?? 0),
  ),
);
watch(
  () => props.visible,
  (visible) => {
    if (visible && props.demands[0]) selectDemand(props.demands[0]);
  },
);
watch(
  () => props.demands,
  (demands) => {
    if (selectedDemandId.value && !selectedDemand.value) selectedDemandId.value = null;
    if (props.visible && !selectedDemandId.value && demands[0]) selectDemand(demands[0]);
  },
  { deep: true },
);
const selectDemand = (row: ProductionMaterialDemandItem | null) => {
  if (!row) return;
  selectedDemandId.value = row.demandId;
  form.itemBatchId = '';
  form.assignedQuantity = Math.max(1, Number(row.remainingQuantity));
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
  if (visible && selectedDemand.value) emit('load-available', selectedDemand.value.demandId);
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
const progressLabel = (status: ProductionMaterialDemandItem['progressStatus']) =>
  MATERIAL_DEMAND_PROGRESS_LABELS[status as keyof typeof MATERIAL_DEMAND_PROGRESS_LABELS] ?? status;
const allocationLabel = (status: AllocationStatus) => ALLOCATION_STATUS_LABELS[status];
</script>

<style scoped>
.dialog-body {
  max-height: 70vh;
  overflow-y: auto;
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
