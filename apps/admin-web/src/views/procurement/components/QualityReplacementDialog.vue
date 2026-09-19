<template>
  <el-dialog
    v-model="visible"
    title="质量退回后补发 · 独立采购补单"
    :width="DialogWidth.md"
    :before-close="beforeClose"
    :close-on-click-modal="false"
    :show-close="!command.busy.value"
  >
    <template v-if="line && supplierReturn">
      <el-alert
        title="补发单追溯本次真实质量退回，原需求已关闭仍保留来源。额外采购量独立填写，不自动冲减原单或按退回量分摊。"
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
        依据：{{ supplierReturn.returnNo }}，实际质量退回
        {{ Number(supplierReturn.returnedQuantity) }} {{ line.unit }}
      </p>
      <el-form
        :disabled="command.locked.value"
        label-width="110px"
        @submit.prevent="save"
        ><el-form-item
          label="补发采购量"
          required
          ><el-input-number
            v-model="quantity"
            :min="1"
            :max="PURCHASE_ORDER_MAX_QUANTITY"
            :precision="0"
            controls-position="right" /></el-form-item
        ><el-form-item
          label="补发真实依据"
          required
          ><el-input
            v-model="evidence"
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
import type { ProcurementReceiptLine, SupplierReturnItem } from '@company/contracts';
import { PURCHASE_ORDER_MAX_QUANTITY } from '@company/constants';
import { procurementApi } from '../../../api/procurement';
import { DialogWidth } from '../../../utils/dialog';
import { useProcurementCommand } from '../composables/useProcurementCommand';
const emit = defineEmits<{ saved: [string] }>();
const visible = ref(false),
  line = ref<ProcurementReceiptLine | null>(null),
  supplierReturn = ref<SupplierReturnItem | null>(null),
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
const open = (source: ProcurementReceiptLine, returned: SupplierReturnItem): void => {
  if (visible.value || command.locked.value || returned.reasonType !== 'quality') return;
  line.value = source;
  supplierReturn.value = returned;
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
  if (!canSave.value || !line.value || !supplierReturn.value) return;
  const id = line.value.purchaseOrderLineId;
  const body = {
    supplementReason: 'quality_replacement' as const,
    originReceiptLineId: line.value.id,
    originSupplierReturnId: supplierReturn.value.id,
    plannedQuantity: Number(quantity.value),
    supplementEvidence: evidence.value.trim(),
    remark: remark.value.trim() || null,
  };
  await command.run(
    { intentType: 'procurement.order.quality-replacement', params: { id }, query: {}, body },
    (key) => procurementApi.createSupplement(id, body, key),
    '不合格补货草稿已创建，请核对后正式下单',
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
