<template>
  <el-dialog
    :model-value="visible"
    title="取消生产任务"
    :width="DialogWidth.lg"
    @update:model-value="$emit('update:visible', $event)"
  >
    <template v-if="batch && check">
      <el-alert
        :title="check.canCancel ? '请核对取消任务的全部影响' : blockerTitle"
        :description="
          check.canCancel
            ? '提交时后端会重新校验任务状态和出库事实；任一条件变化都会拒绝取消。'
            : blockerDescription
        "
        :type="check.canCancel ? 'warning' : 'error'"
        :closable="false"
        show-icon
        class="cancel-alert"
      />

      <el-descriptions
        :column="3"
        border
      >
        <el-descriptions-item label="生产任务">{{ batch.batchNo }}</el-descriptions-item>
        <el-descriptions-item label="生产工单">{{ batch.workOrderNo }}</el-descriptions-item>
        <el-descriptions-item label="当前状态">
          {{ batchStatusMeta(batch.status).label }}
        </el-descriptions-item>
        <el-descriptions-item label="产品">
          {{ batch.productCode }} · {{ batch.productName }}
        </el-descriptions-item>
        <el-descriptions-item label="计划数量">
          {{ formatQuantity(batch.plannedQuantity) }}
        </el-descriptions-item>
        <el-descriptions-item label="完成数量">
          {{ formatQuantity(batch.completedQuantity) }}
        </el-descriptions-item>
      </el-descriptions>

      <div class="dialog-section-title">取消后的联动处理</div>
      <div class="effect-grid">
        <div class="effect-item">
          <span>任务状态</span>
          <strong>转为“已取消”</strong>
        </div>
        <div class="effect-item">
          <span>待确认出库单</span>
          <strong>{{ check.pendingOutboundCount }} 张将一并取消</strong>
          <small v-if="check.pendingOutbounds.length">
            {{ check.pendingOutbounds.map((item) => item.outboundNo).join('、') }}
          </small>
        </div>
        <div class="effect-item">
          <span>有效物料预留</span>
          <strong>{{ check.activeAllocationCount }} 条将取消并释放库存占用</strong>
        </div>
        <div class="effect-item">
          <span>活动物料需求</span>
          <strong>{{ check.activeDemandCount }} 条将转为已取消</strong>
        </div>
        <div class="effect-item effect-item-wide">
          <span>库存影响</span>
          <strong>不会生成库存流水</strong>
          <small>仅允许物料尚未实际出库的任务执行取消。</small>
        </div>
      </div>

      <el-form
        label-position="top"
        class="reason-form"
      >
        <el-form-item
          label="取消原因"
          required
          :error="reasonTouched && !trimmedReason ? '请填写取消原因' : ''"
        >
          <el-input
            v-model="reason"
            type="textarea"
            :rows="3"
            maxlength="5000"
            show-word-limit
            placeholder="说明取消该生产任务的原因"
            :disabled="!check.canCancel"
            @blur="reasonTouched = true"
          />
        </el-form-item>
      </el-form>
    </template>

    <template #footer>
      <el-button @click="$emit('update:visible', false)">返回</el-button>
      <el-button
        type="danger"
        :loading="submitting"
        :disabled="!canSubmit"
        @click="submit"
      >
        确认取消任务
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ProductionBatchCancellationCheck, ProductionBatchItem } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import { batchStatusMeta, formatQuantity } from '../production-status';

const props = defineProps<{
  visible: boolean;
  batch: ProductionBatchItem | null;
  check: ProductionBatchCancellationCheck | null;
  submitting: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'confirm', reason: string): void;
}>();

const reason = ref('');
const reasonTouched = ref(false);
const trimmedReason = computed(() => reason.value.trim());
const canSubmit = computed(
  () => Boolean(props.check?.canCancel && trimmedReason.value) && !props.submitting,
);
const blockerTitle = computed(() =>
  props.check?.blockers.includes('material_already_outbound')
    ? '物料已经实际出库，禁止取消任务'
    : '任务已经开工或结束，禁止取消任务',
);
const blockerDescription = computed(() =>
  props.check?.blockers.includes('material_already_outbound')
    ? '请继续完成生产闭环；第一版不提供已出库任务的强制取消。'
    : '第一版只允许未开工且物料未实际出库的生产任务取消。',
);

watch(
  () => [props.visible, props.batch?.id],
  ([visible]) => {
    if (visible) {
      reason.value = '';
      reasonTouched.value = false;
    }
  },
);

const submit = (): void => {
  reasonTouched.value = true;
  if (!canSubmit.value) return;
  emit('confirm', trimmedReason.value);
};
</script>

<style scoped>
.cancel-alert {
  margin-bottom: 16px;
}
.dialog-section-title {
  margin: 20px 0 12px;
  color: #1f2937;
  font-size: 16px;
  font-weight: 600;
}
.effect-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.effect-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #f9fafb;
}
.effect-item-wide {
  grid-column: 1 / -1;
}
.effect-item span,
.effect-item small {
  color: #6b7280;
}
.effect-item strong {
  color: #1f2937;
  font-size: 14px;
}
.reason-form {
  margin-top: 18px;
}
</style>
