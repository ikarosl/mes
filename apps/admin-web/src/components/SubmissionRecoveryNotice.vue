<template>
  <div
    v-if="status !== 'idle'"
    class="submission-recovery"
    role="status"
  >
    <span>{{ submissionRecoveryMessage(status, recordsLabel) }}</span>
    <el-button
      v-if="showRetry && status === 'pending'"
      link
      type="primary"
      :loading="busy"
      :disabled="retryDisabled || confirmingRestart"
      @click="$emit('retry')"
      >重试上次提交</el-button
    >
    <el-button
      v-if="allowRestart"
      link
      :disabled="busy || confirmingRestart"
      @click="restart"
    >
      按新操作继续
    </el-button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { confirmSubmissionRestart } from '../composables/idempotency/submission-recovery';
import {
  submissionRecoveryMessage,
  type IdempotentIntentStatus,
} from '../composables/idempotency/useIdempotentIntent';

const props = withDefaults(
  defineProps<{
    status: IdempotentIntentStatus;
    recordsLabel: string;
    busy?: boolean;
    showRetry?: boolean;
    retryDisabled?: boolean;
    allowRestart?: boolean;
  }>(),
  { busy: false, showRetry: true, retryDisabled: false, allowRestart: false },
);
const emit = defineEmits<{ retry: []; restart: [] }>();
const confirmingRestart = ref(false);
const canRestart = (): boolean => !props.busy && props.status !== 'idle';

async function restart(): Promise<void> {
  if (!canRestart() || confirmingRestart.value) return;
  confirmingRestart.value = true;
  try {
    const confirmed = await confirmSubmissionRestart(props.recordsLabel);
    if (confirmed && canRestart()) emit('restart');
  } finally {
    confirmingRestart.value = false;
  }
}
</script>

<style scoped>
.submission-recovery {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  margin: 8px 0;
  color: var(--el-text-color-regular);
  font-size: 14px;
  line-height: 1.6;
}
.submission-recovery .el-button {
  margin-left: 0;
}
</style>
