<template>
  <el-dialog
    :model-value="visible"
    title="生产领料出库"
    :width="DialogWidth.xl"
    :close-on-click-modal="false"
    :show-close="!submitting"
    :close-on-press-escape="!submitting"
    :before-close="() => emit('update:visible', false)"
  >
    <div class="dialog-body">
      <el-alert
        title="有效需求可按当前分配分次领料。创建后进入待出库状态，不会立即扣减库存；请打印单据完成拣货、领料和签字，再到出库管理中整单确认。"
        type="info"
        :closable="false"
      />
      <SubmissionRecoveryNotice
        :status="intentStatus"
        :busy="submitting"
        class="outbound-groups"
        records-label="领料出库单列表"
        allow-restart
        @retry="emit('retry')"
        @restart="emit('restart')"
      />
      <el-button
        :loading="loadingDemands || loadingOutbounds"
        class="outbound-groups"
        @click="emit('refresh')"
        >刷新领料数据</el-button
      >
      <el-alert
        v-if="(!demandsReady || !outboundsReady) && !loadingDemands && !loadingOutbounds"
        title="领料数据尚未读取成功，请刷新后再创建新的出库单。"
        type="warning"
        :closable="false"
      />
      <div class="outbound-groups">
        <el-alert
          v-if="!controlsLocked && unavailableSelection"
          title="部分已选分配当前不可制单，原选择与数量仍保留；请刷新核对，或取消这些行后再提交。"
          type="warning"
          :closable="false"
        />
        <section
          v-for="group in allocationGroups"
          :key="group.generationGroupKey"
          class="outbound-group"
        >
          <div class="group-header">
            <strong>{{ group.label }}</strong>
            <span>{{ group.rows.length }} 条可制单分配</span>
          </div>
          <el-table
            :data="group.rows"
            row-key="allocationId"
            @selection-change="handleGroupSelection(group.generationGroupKey, $event)"
          >
            <el-table-column
              type="selection"
              width="50"
              :selectable="() => !controlsLocked"
              :reserve-selection="true"
            />
            <el-table-column
              prop="itemName"
              label="物料"
              min-width="170"
            />
            <el-table-column
              prop="materialVariantCode"
              label="物料版本"
              min-width="190"
            >
              <template #default="{ row }">{{ row.materialVariantCode || '未记录版本' }}</template>
            </el-table-column>
            <el-table-column
              prop="batchCode"
              label="库存批次"
              min-width="140"
            />
            <el-table-column
              label="分配数量"
              width="110"
            >
              <template #default="{ row }">{{ formatQuantity(row.assignedQuantity) }}</template>
            </el-table-column>
            <el-table-column
              label="已确认出库"
              width="120"
            >
              <template #default="{ row }">{{ formatQuantity(row.outboundQuantity) }}</template>
            </el-table-column>
            <el-table-column
              label="待确认占用"
              width="120"
            >
              <template #default="{ row }">{{
                formatQuantity(row.pendingOutboundQuantity)
              }}</template>
            </el-table-column>
            <el-table-column
              label="可制单"
              width="110"
            >
              <template #default="{ row }">{{
                formatQuantity(row.availableToOrderQuantity)
              }}</template>
            </el-table-column>
            <el-table-column
              label="本次出库"
              width="180"
            >
              <template #default="{ row }">
                <el-input-number
                  v-model="quantities[row.allocationId]"
                  :min="1"
                  :max="
                    Math.max(
                      Number(row.availableToOrderQuantity),
                      quantities[row.allocationId] ?? 0,
                    )
                  "
                  :step="1"
                  :precision="0"
                  :disabled="controlsLocked"
                />
              </template>
            </el-table-column>
          </el-table>
        </section>
      </div>
      <el-input
        v-model="remark"
        class="remark"
        type="textarea"
        :rows="2"
        :disabled="controlsLocked"
        maxlength="5000"
        placeholder="出库备注（可选）"
      />
      <div class="selection-summary">
        已选择 {{ selectedGroupCount }} 个需求组、{{ selection.length }}
        条分配明细；数量按各行单位分别记录，不跨单位合计。
      </div>
      <h3>本批次出库记录</h3>
      <el-table
        v-loading="loadingOutbounds"
        :data="outbounds"
        empty-text="暂无出库记录"
      >
        <el-table-column
          prop="outboundNo"
          label="出库单号"
          min-width="190"
        />
        <el-table-column
          label="状态"
          width="110"
          ><template #default="{ row }">{{ statusLabel(row.status) }}</template></el-table-column
        >
        <el-table-column
          label="制单时间"
          min-width="180"
          ><template #default="{ row }">{{
            formatDateTimeForDisplay(row.createdAt)
          }}</template></el-table-column
        >
        <el-table-column
          prop="createdByName"
          label="制单人"
          width="120"
        />
        <el-table-column
          label="明细数"
          width="90"
          ><template #default="{ row }">{{ row.details.length }}</template></el-table-column
        >
      </el-table>
    </div>
    <template #footer
      ><el-button @click="$emit('update:visible', false)">取消</el-button
      ><el-button
        type="primary"
        :loading="submitting"
        :disabled="submitting || !canSubmit"
        @click="submit"
        >创建待出库单</el-button
      ></template
    >
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type {
  MaterialOutboundItem,
  ProductionMaterialAllocationItem,
  ProductionMaterialDemandItem,
} from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { formatQuantity } from '../../../utils/quantity';
import { OUTBOUND_ORDER_STATUS_LABELS } from '@company/constants';
import { groupMaterialDemandRows } from './material-demand-group-presentation';
import type { IdempotentIntentStatus } from '../../../composables/idempotency/useIdempotentIntent';
import SubmissionRecoveryNotice from '../../../components/SubmissionRecoveryNotice.vue';
type OutboundAllocation = ProductionMaterialAllocationItem & {
  itemName: string;
  generationGroupKey: string;
  generationGroupType: ProductionMaterialDemandItem['generationGroupType'];
  manualAdditionNo: string | null;
};
const props = defineProps<{
  visible: boolean;
  demands: ProductionMaterialDemandItem[];
  outbounds: MaterialOutboundItem[];
  loadingOutbounds: boolean;
  submitting: boolean;
  loadingDemands: boolean;
  demandsReady: boolean;
  outboundsReady: boolean;
  intentStatus: IdempotentIntentStatus;
}>();
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'retry'): void;
  (e: 'restart'): void;
  (e: 'refresh'): void;
  (
    e: 'submit',
    payload: {
      details: Array<{ allocationId: string; outboundQuantity: number }>;
      remark: string | null;
    },
  ): void;
}>();
const selectedByGroup = reactive<Record<string, OutboundAllocation[]>>({});
const quantities = reactive<Record<string, number>>({});
const remark = ref('');
const controlsLocked = computed(() => props.submitting || props.intentStatus !== 'idle');
const chosenAllocations = computed(() => Object.values(selectedByGroup).flat());
const availableAllocations = computed<OutboundAllocation[]>(() =>
  props.demands
    .filter((d) => d.businessStatus === 'active')
    .flatMap((d) =>
      d.allocations
        .filter((a) => a.allocationStatus === 'active' && Number(a.availableToOrderQuantity) > 0)
        .map((a) => ({
          ...a,
          itemName: d.itemName,
          generationGroupKey: d.generationGroupKey,
          generationGroupType: d.generationGroupType,
          manualAdditionNo: d.manualAdditionNo,
        })),
    ),
);
const selection = computed(() => {
  if (controlsLocked.value) return chosenAllocations.value;
  const currentRows = new Map(availableAllocations.value.map((row) => [row.allocationId, row]));
  return chosenAllocations.value.map((row) => currentRows.get(row.allocationId) ?? row);
});
const unavailableSelection = computed(() =>
  selection.value.some(
    (row) =>
      !availableAllocations.value.some((current) => current.allocationId === row.allocationId),
  ),
);
const allocationGroups = computed(() =>
  groupMaterialDemandRows(
    controlsLocked.value
      ? chosenAllocations.value
      : [
          ...availableAllocations.value,
          ...chosenAllocations.value.filter(
            (row) =>
              !availableAllocations.value.some(
                (current) => current.allocationId === row.allocationId,
              ),
          ),
        ],
  ),
);
const selectedGroupCount = computed(
  () => new Set(selection.value.map((row) => row.generationGroupKey)).size,
);
const canSubmit = computed(
  () =>
    props.demandsReady &&
    props.outboundsReady &&
    !props.loadingDemands &&
    !props.loadingOutbounds &&
    props.intentStatus === 'idle' &&
    selection.value.length > 0 &&
    !unavailableSelection.value &&
    selection.value.every((row) => {
      const quantity = quantities[row.allocationId];
      return (
        Number.isInteger(quantity) &&
        quantity > 0 &&
        quantity <= Number(row.availableToOrderQuantity)
      );
    }),
);
watch([availableAllocations, controlsLocked], ([rows, locked]) => {
  if (locked) return;
  for (const row of rows) quantities[row.allocationId] ??= Number(row.availableToOrderQuantity);
});
watch(
  () => props.visible,
  (visible) => {
    if (!visible || props.intentStatus !== 'idle') return;
    clearSelections();
    remark.value = '';
    for (const row of availableAllocations.value)
      quantities[row.allocationId] = Number(row.availableToOrderQuantity);
  },
);
const handleGroupSelection = (generationGroupKey: string, rows: OutboundAllocation[]): void => {
  if (controlsLocked.value) return;
  selectedByGroup[generationGroupKey] = rows;
};
const clearSelections = (): void => {
  for (const key of Object.keys(selectedByGroup)) delete selectedByGroup[key];
};
const submit = () => {
  if (!canSubmit.value || props.submitting) return;
  emit('submit', {
    details: selection.value.map((row) => ({
      allocationId: row.allocationId,
      outboundQuantity: quantities[row.allocationId] ?? Number(row.availableToOrderQuantity),
    })),
    remark: remark.value.trim() || null,
  });
};
const statusLabel = (status: MaterialOutboundItem['status']) =>
  OUTBOUND_ORDER_STATUS_LABELS[status];
</script>

<style scoped>
.outbound-groups {
  margin-top: 16px;
}
.outbound-group + .outbound-group {
  margin-top: 18px;
}
.group-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}
.group-header span {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.remark {
  margin: 16px 0;
}
.selection-summary {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  margin-bottom: 16px;
}
h3 {
  margin: 18px 0 12px;
  color: #1f2937;
  font-size: 16px;
}
</style>
