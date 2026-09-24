<template>
  <el-dialog
    v-model="visible"
    title="供应商质量补发 · 独立采购单"
    :width="DialogWidth.md"
    :before-close="beforeClose"
    :close-on-click-modal="false"
    :show-close="!command.busy.value"
  >
    <template v-if="line && basis">
      <el-alert
        title="依据库管已确认的质量退回处置和供应商补发约定建单。可先补后退，无需先关原单；创建补发单不会登记实际退回。"
        type="info"
        :closable="false"
        class="notice"
      />
      <el-alert
        v-if="command.status.value !== 'idle'"
        title="创建结果尚未确认，输入已锁定。请重试原操作或先核对采购单记录。"
        type="warning"
        :closable="false"
        class="notice"
      />
      <p>{{ line.itemCode }} · {{ line.itemName }} · {{ line.materialVariantCode }}</p>
      <p>
        依据：质量退回分配明细 {{ basis.allocationId }}；
        {{ basis.returned ? '本笔已退' : '本范围待退' }} {{ Number(basis.quantity) }}
        {{ line.unit }}
      </p>
      <el-form
        :disabled="command.locked.value"
        label-width="140px"
        @submit.prevent="save"
        ><el-form-item
          label="约定补发量"
          required
          ><el-input-number
            v-model="quantity"
            :min="1"
            :max="PURCHASE_ORDER_MAX_QUANTITY"
            :precision="0"
            controls-position="right" /></el-form-item
        ><el-form-item
          label="供应商补发约定"
          required
          ><el-input
            v-model="evidence"
            placeholder="填写供应商确认补发的数量、沟通时间及可追溯凭据；实际退回另行登记"
            type="textarea"
            :rows="3"
            maxlength="2000"
            show-word-limit /></el-form-item
        ><el-form-item label="补单备注"
          ><el-input
            v-model="remark"
            maxlength="2000" /></el-form-item
      ></el-form>
    </template>
    <template #footer
      ><el-button
        :disabled="command.busy.value"
        @click="close"
        >关闭</el-button
      ><el-button
        v-if="command.status.value === 'pending'"
        type="primary"
        :loading="command.busy.value"
        @click="command.retry"
        >重试原操作</el-button
      ><el-button
        v-else
        type="primary"
        :disabled="!canSave"
        :loading="command.busy.value"
        @click="save"
        >创建独立补单草稿</el-button
      ></template
    >
  </el-dialog>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ProcurementReceiptLine } from '@company/contracts';
import { PURCHASE_ORDER_MAX_QUANTITY } from '@company/constants';
import { procurementApi } from '../../../api/procurement';
import { DialogWidth } from '../../../utils/dialog';
import { useProcurementCommand } from '../composables/useProcurementCommand';
interface ReplacementBasis {
  allocationId: string;
  quantity: string;
  returned: boolean;
}
const emit = defineEmits<{ saved: [string] }>();
const visible = ref(false),
  line = ref<ProcurementReceiptLine | null>(null),
  basis = ref<ReplacementBasis | null>(null),
  quantity = ref<number | undefined>(),
  evidence = ref(''),
  remark = ref('');
const command = useProcurementCommand((result) => {
  visible.value = false;
  emit('saved', result.purchaseOrderId);
});
const canSave = computed(
  () =>
    !command.locked.value &&
    Number.isInteger(quantity.value) &&
    Number(quantity.value) > 0 &&
    Number(quantity.value) <= PURCHASE_ORDER_MAX_QUANTITY &&
    Boolean(evidence.value.trim()),
);
const open = (source: ProcurementReceiptLine, selection: ReplacementBasis): void => {
  if (visible.value || command.locked.value || !selection.allocationId) return;
  line.value = source;
  basis.value = selection;
  quantity.value = undefined;
  evidence.value = '';
  remark.value = '';
  visible.value = true;
};
const close = async (): Promise<boolean> => {
  if (!(await command.canClose(Boolean(quantity.value || evidence.value || remark.value))))
    return false;
  visible.value = false;
  return true;
};
const save = async (): Promise<void> => {
  if (!canSave.value || !line.value || !basis.value) return;
  const id = line.value.purchaseOrderLineId;
  const body = {
    supplementReason: 'quality_replacement' as const,
    originReceiptLineId: line.value.id,
    originAllocationId: basis.value.allocationId,
    plannedQuantity: Number(quantity.value),
    supplementEvidence: evidence.value.trim(),
    remark: remark.value.trim() || null,
  };
  await command.run(
    { intentType: 'procurement.order.quality-replacement', params: { id }, query: {}, body },
    (key) => procurementApi.createSupplement(id, body, key),
    '质量补发草稿已创建，请核对后正式下单',
  );
};
const beforeClose = (): void => {
  void close();
};
defineExpose({ open, close, visible, locked: command.locked });
</script>
<style scoped>
.notice {
  margin-bottom: 16px;
}
</style>
