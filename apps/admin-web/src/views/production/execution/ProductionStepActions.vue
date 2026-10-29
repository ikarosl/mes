<template>
  <div class="step-actions">
    <template v-if="!readonly">
      <el-tooltip
        v-if="step.status === 'assigned'"
        :disabled="canStart && !disabled"
        :content="step.startBlockedReason || '当前不可开工'"
        ><span
          ><el-button
            link
            type="primary"
            :disabled="disabled || !canStart"
            @click="$emit('action', 'start')"
            >{{ worker ? '开始工序' : '代办开工' }}</el-button
          ></span
        ></el-tooltip
      >
      <el-tooltip
        v-if="step.status === 'doing'"
        :disabled="canComplete && !disabled"
        :content="step.completeBlockedReason || '当前不可完成'"
        ><span
          ><el-button
            link
            type="primary"
            :disabled="disabled || !canComplete"
            @click="$emit('action', 'complete')"
            >{{ worker ? '明确完成' : '代办完成' }}</el-button
          ></span
        ></el-tooltip
      >
      <el-tooltip
        v-if="step.status === 'completed'"
        :disabled="canReopen && !disabled"
        :content="step.reopenBlockedReason || '当前不可重开'"
        ><span
          ><el-button
            link
            type="primary"
            :disabled="disabled || !canReopen"
            @click="$emit('action', 'reopen')"
            >重新打开</el-button
          ></span
        ></el-tooltip
      >
    </template>
    <el-button
      link
      type="primary"
      @click="$emit('history')"
      >状态历史</el-button
    >
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type {
  BatchStepExecutionRecordItem,
  ProductionStepExecutionActionType,
  ProductionWorkerTaskItem,
} from '@company/contracts';

type ActionStep = BatchStepExecutionRecordItem | ProductionWorkerTaskItem;
const props = withDefaults(
  defineProps<{ step: ActionStep; worker?: boolean; readonly?: boolean; disabled?: boolean }>(),
  { worker: false, readonly: false, disabled: false },
);
defineEmits<{
  action: [type: ProductionStepExecutionActionType];
  history: [];
}>();
const canStart = computed(() =>
  props.worker
    ? 'canStart' in props.step && props.step.canStart
    : 'canAdminStart' in props.step && props.step.canAdminStart,
);
const canComplete = computed(() =>
  props.worker
    ? 'canComplete' in props.step && props.step.canComplete
    : 'canAdminComplete' in props.step && props.step.canAdminComplete,
);
const canReopen = computed(() =>
  props.worker
    ? 'canReopen' in props.step && props.step.canReopen
    : 'canAdminReopen' in props.step && props.step.canAdminReopen,
);
</script>

<style scoped>
.step-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
