<template>
  <el-dialog
    :model-value="visible"
    title="登记结案损坏（不补料）"
    :width="DialogWidth.lg"
    :close-on-click-modal="false"
    :before-close="editor.close"
    @update:model-value="(value: boolean) => !value && editor.close()"
  >
    <el-alert
      title="确认后永久扣减可退上限"
      description="用于登记已领到产线的物料损坏。登记后会扣减可退上限，不改变仓库库存；补料需另行申请。本次登记立即生效，结案审批驳回也不会撤销。物料退料与成品报废请另行办理。"
      type="warning"
      :closable="false"
      show-icon
    />
    <el-descriptions
      v-if="source"
      :column="2"
      border
      class="section"
    >
      <el-descriptions-item label="来源需求 / 原分配"
        >#{{ demandId ?? '—' }} / #{{ source.allocationId }}</el-descriptions-item
      ><el-descriptions-item label="库存批次">{{ source.inventoryBatchCode }}</el-descriptions-item>
      <el-descriptions-item
        label="物料 / 精确版本"
        :span="2"
        >{{ source.itemCode }} / {{ source.materialVariantCode }}</el-descriptions-item
      >
      <el-descriptions-item label="已领 / 退料占用 / 损耗占用"
        >{{ quantity(source.outboundQuantity) }} / {{ quantity(source.returnQuantity) }} /
        {{ quantity(source.lossQuantity) }} {{ source.unit }}</el-descriptions-item
      ><el-descriptions-item label="本次可登记上限"
        >{{ quantity(maximum) }} {{ source.unit }}</el-descriptions-item
      >
    </el-descriptions>
    <el-alert
      v-if="stale"
      class="section"
      title="领退料、损耗或收尾状态已变化，请返回列表刷新后重新选择本项"
      type="warning"
      :closable="false"
    />
    <el-alert
      v-if="unresolved"
      class="section"
      :title="editor.recoveryMessage()"
      type="warning"
      :closable="false"
    />
    <el-form
      label-position="top"
      class="section"
      :disabled="locked"
    >
      <el-form-item
        label="本次损坏数量"
        required
        ><el-input-number
          v-model="form.scrapQuantity"
          :min="1"
          :max="Math.max(maximum, 1)"
          :step="1"
          :precision="0"
        /><span class="unit">{{ source?.unit }}</span
        ><span class="preview"
          >登记后可退上限 {{ quantity(remaining) }} {{ source?.unit }}</span
        ></el-form-item
      >
      <el-form-item
        label="损坏原因"
        required
        ><el-input
          v-model="form.reason"
          type="textarea"
          :rows="4"
          maxlength="5000"
          show-word-limit
          placeholder="说明现场损坏情况及处理安排"
      /></el-form-item>
    </el-form>
    <template #footer
      ><el-button
        :disabled="submitting || confirming"
        @click="editor.close"
        >返回物料核对</el-button
      ><el-button
        v-if="unresolved"
        type="primary"
        :loading="submitting"
        :disabled="!editor.canRetry()"
        @click="editor.retry"
        >重试本次提交</el-button
      ><el-button
        v-else
        type="primary"
        :disabled="!canSubmit"
        :loading="submitting"
        @click="editor.submit"
        >确认登记损坏</el-button
      ></template
    >
  </el-dialog>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import type { BatchCloseoutDetail, BatchTerminationMaterial } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import { formatQuantity as quantity } from '../production-status';
import { useCloseoutMaterialLoss } from '../composables/useCloseoutMaterialLoss';
const props = defineProps<{
  visible: boolean;
  batchId: string | null;
  material: BatchTerminationMaterial | null;
  detail: BatchCloseoutDetail | null;
  disabled: boolean;
}>();
const emit = defineEmits<{ 'update:visible': [boolean]; recorded: [] }>();
const editor = useCloseoutMaterialLoss(
  props,
  () => emit('recorded'),
  () => emit('update:visible', false),
);
const {
  source,
  form,
  maximum,
  remaining,
  submitting,
  confirming,
  unresolved,
  stale,
  locked,
  canSubmit,
} = editor;
const demandId = computed(
  () =>
    props.detail?.materialReviews.find((row) => row.allocationId === source.value?.allocationId)
      ?.demandId,
);
defineExpose({ close: editor.close });
</script>
<style scoped>
.section {
  margin-top: 16px;
}
.unit {
  margin-left: 8px;
}
.preview {
  margin-left: 16px;
  color: var(--el-text-color-secondary);
}
</style>
