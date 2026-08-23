<template>
  <el-dialog
    :model-value="visible"
    :title="dialogTitle"
    :width="DialogWidth.lg"
    @update:model-value="$emit('update:visible', $event)"
  >
    <template v-if="order">
      <el-alert
        :title="alertTitle"
        :description="alertDescription"
        :type="alertType"
        :closable="false"
        show-icon
        class="transition-alert"
      />

      <el-descriptions
        :column="3"
        border
      >
        <el-descriptions-item label="工单号">{{ order.workOrderNo }}</el-descriptions-item>
        <el-descriptions-item label="当前状态">
          {{ orderStatusMeta(order.status).label }}
        </el-descriptions-item>
        <el-descriptions-item label="产品">
          {{ order.productCode }} · {{ order.productName }}
        </el-descriptions-item>
        <el-descriptions-item label="计划数量">
          {{ formatQuantity(order.plannedQuantity) }} {{ order.unit }}
        </el-descriptions-item>
        <el-descriptions-item label="批次完成量">
          {{ formatQuantity(completedQuantity) }} {{ order.unit }}
        </el-descriptions-item>
        <el-descriptions-item label="批次汇总">
          非取消 {{ activeBatches.length }} 个，未结束 {{ unfinishedBatches.length }} 个
        </el-descriptions-item>
      </el-descriptions>

      <div class="dialog-section-title">所属生产批次</div>
      <el-table
        v-if="order.batches.length"
        :data="order.batches"
        class="batch-summary-table"
        max-height="280"
      >
        <el-table-column
          prop="batchNo"
          label="生产批次号"
          min-width="170"
        />
        <el-table-column
          label="计划数量"
          width="120"
          align="right"
        >
          <template #default="{ row }">{{ formatQuantity(row.plannedQuantity) }}</template>
        </el-table-column>
        <el-table-column
          label="完成数量"
          width="120"
          align="right"
        >
          <template #default="{ row }">{{ formatQuantity(row.completedQuantity) }}</template>
        </el-table-column>
        <el-table-column
          label="状态"
          width="130"
        >
          <template #default="{ row }">
            <el-tag
              :type="batchStatusMeta(row.status).type"
              effect="light"
            >
              {{ batchStatusMeta(row.status).label }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
      <div
        v-else
        class="empty-hint"
      >
        暂无生产批次
      </div>

      <el-form
        v-if="mode === 'early-close'"
        label-position="top"
        class="reason-form"
      >
        <el-form-item
          label="关闭原因"
          required
          :error="reasonTouched && !trimmedReason ? '请填写提前关闭原因' : ''"
        >
          <el-input
            v-model="reason"
            type="textarea"
            :rows="3"
            maxlength="5000"
            show-word-limit
            placeholder="说明未生产或不足量结案原因"
            @blur="reasonTouched = true"
          />
        </el-form-item>
      </el-form>
    </template>

    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button
        :type="mode === 'early-close' ? 'danger' : 'primary'"
        :loading="submitting"
        :disabled="!canSubmit"
        @click="submit"
      >
        {{ confirmText }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { WorkOrderDetail } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import { batchStatusMeta, formatQuantity, orderStatusMeta } from '../production-status';

type TransitionMode = 'complete' | 'early-close' | 'archive';

const props = defineProps<{
  visible: boolean;
  mode: TransitionMode;
  order: WorkOrderDetail | null;
  submitting: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'confirm', value: { mode: TransitionMode; reason: string | null }): void;
}>();

const reason = ref('');
const reasonTouched = ref(false);
const integerQuantity = (value: string | number): number => Number(value);
const activeBatches = computed(() =>
  (props.order?.batches ?? []).filter((batch) => batch.status !== 'cancelled'),
);
const unfinishedBatches = computed(() =>
  activeBatches.value.filter((batch) => batch.status !== 'completed'),
);
const completedQuantity = computed(() =>
  activeBatches.value.reduce((sum, batch) => sum + integerQuantity(batch.completedQuantity), 0),
);
const plannedQuantity = computed(() => integerQuantity(props.order?.plannedQuantity ?? 0));
const isFullyProduced = computed(
  () =>
    activeBatches.value.length > 0 &&
    unfinishedBatches.value.length === 0 &&
    completedQuantity.value === plannedQuantity.value,
);
const canComplete = computed(() => isFullyProduced.value);
const trimmedReason = computed(() => reason.value.trim());
const canEarlyClose = computed(
  () =>
    unfinishedBatches.value.length === 0 && !isFullyProduced.value && Boolean(trimmedReason.value),
);
const canSubmit = computed(
  () =>
    !props.submitting &&
    Boolean(props.order) &&
    (props.mode === 'complete'
      ? canComplete.value
      : props.mode === 'early-close'
        ? canEarlyClose.value
        : props.order?.status === 'completed'),
);

const dialogTitle = computed(() =>
  props.mode === 'complete'
    ? '确认工单完工'
    : props.mode === 'early-close'
      ? '提前关闭工单'
      : '归档关闭工单',
);
const confirmText = computed(() =>
  props.mode === 'complete'
    ? '确认工单完工'
    : props.mode === 'early-close'
      ? '确认提前关闭'
      : '确认归档关闭',
);
const alertType = computed<'success' | 'warning' | 'error' | 'info'>(() => {
  if (props.mode === 'archive') return 'info';
  if (unfinishedBatches.value.length > 0) return 'error';
  if (props.mode === 'complete') return canComplete.value ? 'success' : 'warning';
  return isFullyProduced.value ? 'warning' : 'warning';
});
const alertTitle = computed(() => {
  if (props.mode === 'archive') return '归档后工单进入终态，不能继续生产操作';
  if (unfinishedBatches.value.length > 0) return '存在未结束生产批次，当前不能提交';
  if (props.mode === 'complete')
    return canComplete.value ? '批次汇总已达到工单计划量' : '批次汇总尚未达到足量完工条件';
  if (isFullyProduced.value) return '生产数量已足量完成，请改用“确认工单完工”';
  return activeBatches.value.length === 0 ? '该操作将按未生产结案' : '该操作将按不足量结案';
});
const alertDescription = computed(() => {
  if (unfinishedBatches.value.length > 0)
    return `请先完成或取消所有未结束生产批次：${unfinishedBatches.value
      .map((batch) => `${batch.batchNo}（${batchStatusMeta(batch.status).label}）`)
      .join('、')}`;
  if (props.mode === 'complete')
    return canComplete.value
      ? '请管理员复核工单、批次和完成数量；确认后工单状态变为“已完工”。'
      : '所有非取消批次必须完成，且批次完成量合计必须等于工单计划量。';
  if (props.mode === 'early-close')
    return isFullyProduced.value
      ? '足量生产不能按提前结案处理，应先确认完工，再执行行政归档。'
      : '提前关闭不会自动取消批次，关闭原因会随本次命令写入操作审计。';
  return '该操作只做成功完工后的行政归档，不改变批次生产事实。';
});

watch(
  () => [props.visible, props.mode, props.order?.id],
  ([visible]) => {
    if (visible) {
      reason.value = '';
      reasonTouched.value = false;
    }
  },
);

const submit = (): void => {
  if (props.mode === 'early-close') reasonTouched.value = true;
  if (!canSubmit.value) return;
  emit('confirm', {
    mode: props.mode,
    reason: props.mode === 'early-close' ? trimmedReason.value : null,
  });
};
</script>

<style scoped>
.transition-alert {
  margin-bottom: 16px;
}
.dialog-section-title {
  margin: 20px 0 12px;
  color: #1f2937;
  font-size: 16px;
  font-weight: 600;
}
.batch-summary-table {
  width: 100%;
}
.batch-summary-table :deep(.el-table__header th) {
  background: #f9fafb;
  color: #1f2937;
}
.empty-hint {
  padding: 24px;
  border: 1px dashed #e5e7eb;
  border-radius: 6px;
  text-align: center;
  color: #9ca3af;
}
.reason-form {
  margin-top: 18px;
}
</style>
