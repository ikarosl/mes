<template>
  <el-dialog
    :model-value="visible"
    title="生产领料出库"
    :width="DialogWidth.xl"
    @update:model-value="$emit('update:visible', $event)"
  >
    <div class="dialog-body">
      <el-alert
        title="出库将立即写入负数库存流水，请核对库存批次和本次数量。"
        type="warning"
        :closable="false"
      />
      <el-table
        :data="availableAllocations"
        class="outbound-table"
        @selection-change="selection = $event"
      >
        <el-table-column
          type="selection"
          width="50"
        />
        <el-table-column
          prop="itemName"
          label="物料"
          min-width="170"
        />
        <el-table-column
          prop="batchCode"
          label="库存批次"
          min-width="140"
        />
        <el-table-column
          label="未出库量"
          width="110"
          ><template #default="{ row }">{{
            formatQuantity(row.remainingOutboundQuantity)
          }}</template></el-table-column
        >
        <el-table-column
          label="本次出库"
          width="180"
          ><template #default="{ row }"
            ><el-input-number
              v-model="quantities[row.allocationId]"
              :min="0.0001"
              :max="Number(row.remainingOutboundQuantity)"
              :precision="4" /></template
        ></el-table-column>
      </el-table>
      <el-input
        v-model="remark"
        class="remark"
        type="textarea"
        :rows="2"
        maxlength="5000"
        placeholder="出库备注（可选）"
      />
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
          prop="outboundAt"
          label="出库时间"
          min-width="180"
        />
        <el-table-column
          prop="operatorName"
          label="操作人"
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
        :disabled="selection.length === 0"
        @click="submit"
        >确认领料出库</el-button
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
import { formatQuantity } from '../production-status';
type OutboundAllocation = ProductionMaterialAllocationItem & { itemName: string };
const props = defineProps<{
  visible: boolean;
  demands: ProductionMaterialDemandItem[];
  outbounds: MaterialOutboundItem[];
  loadingOutbounds: boolean;
  submitting: boolean;
}>();
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (
    e: 'submit',
    payload: {
      details: Array<{ allocationId: string; outboundQuantity: number }>;
      remark: string | null;
    },
  ): void;
}>();
const selection = ref<OutboundAllocation[]>([]);
const quantities = reactive<Record<string, number>>({});
const remark = ref('');
const availableAllocations = computed<OutboundAllocation[]>(() =>
  props.demands.flatMap((d) =>
    d.allocations
      .filter((a) => a.allocationStatus === 'active' && Number(a.remainingOutboundQuantity) > 0)
      .map((a) => ({ ...a, itemName: d.itemName })),
  ),
);
watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    selection.value = [];
    remark.value = '';
    for (const row of availableAllocations.value)
      quantities[row.allocationId] = Number(row.remainingOutboundQuantity);
  },
);
const submit = () =>
  emit('submit', {
    details: selection.value.map((row) => ({
      allocationId: row.allocationId,
      outboundQuantity: quantities[row.allocationId] ?? Number(row.remainingOutboundQuantity),
    })),
    remark: remark.value.trim() || null,
  });
</script>

<style scoped>
.dialog-body {
  max-height: 70vh;
  overflow-y: auto;
}
.outbound-table {
  margin-top: 16px;
}
.remark {
  margin: 16px 0;
}
h3 {
  margin: 18px 0 12px;
  color: #1f2937;
  font-size: 16px;
}
</style>
