<template>
  <section>
    <InlineHint class="records-notice">
      其他处理只登记文字说明；退回、报废或暂存等线下处理是否完成不在系统追踪。
    </InlineHint>
    <el-alert
      v-if="command.status.value !== 'idle'"
      :title="submissionRecoveryMessage(command.status.value, '其他处理说明')"
      type="warning"
      :closable="false"
      class="records-notice"
    />
    <el-form
      v-if="recording"
      label-position="top"
      :disabled="command.locked.value || !canRecord"
      class="handling-form"
      @submit.prevent="save"
    >
      <el-form-item
        label="本次其他处理说明"
        required
      >
        <el-input
          v-model="note"
          type="textarea"
          :rows="3"
          :maxlength="PROCUREMENT_RECEIPT_HANDLING_NOTE_MAX_LENGTH"
          show-word-limit
          placeholder="如退回、报废、暂存的情况；只登记文字说明"
        />
      </el-form-item>
    </el-form>
    <div class="handling-actions">
      <el-button
        v-if="command.status.value === 'pending'"
        type="primary"
        :loading="command.busy.value"
        :disabled="!active || !read.isActive()"
        @click="command.retry"
        >重试本次提交</el-button
      >
      <template v-else-if="command.status.value === 'idle'">
        <el-button
          v-if="!recording"
          type="primary"
          :disabled="!canRecord"
          @click="beginRecording"
          >登记说明</el-button
        >
        <el-button
          v-else
          type="primary"
          :disabled="!canSave"
          :loading="command.busy.value"
          @click="save"
          >保存说明</el-button
        >
      </template>
      <el-button
        v-if="recording"
        :disabled="command.busy.value"
        @click="canLeave"
        >取消</el-button
      >
      <span
        v-if="isReceiptVoided(source)"
        class="secondary"
        >到货已作废，仍可查看历史说明。</span
      >
    </div>
    <el-alert
      v-if="readError"
      title="其他处理说明读取失败，已显示内容为上次结果。请刷新后核对。"
      type="error"
      :closable="false"
      class="records-notice"
    />
    <el-table
      v-loading="loading"
      :data="rows"
      row-key="id"
    >
      <template #empty>{{ emptyText }}</template>
      <el-table-column
        label="其他处理说明"
        min-width="300"
      >
        <template #default="{ row }">
          <span class="record-text">{{ row.otherHandlingNote }}</span>
          <div
            v-if="row.inboundId"
            class="secondary"
          >
            此历史说明有关联入库记录。
          </div>
        </template>
      </el-table-column>
      <el-table-column
        label="记录时间"
        width="180"
      >
        <template #default="{ row }">{{ formatDateTimeForDisplay(row.createdAt) }}</template>
      </el-table-column>
    </el-table>
    <PaginationFooter
      :total="total"
      :current-page="page"
      :page-size="pageSize"
      :disabled="loading"
      total-suffix="条说明"
      @page-change="changePage"
      @update:page-size="changePageSize"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RequestError } from '@company/request';
import { PROCUREMENT_RECEIPT_HANDLING_NOTE_MAX_LENGTH } from '@company/constants';
import type {
  ProcurementReceiptLineOverview,
  ReceiptHandlingItem,
  RecordReceiptHandlingPayload,
} from '@company/contracts';
import { procurementApi } from '../../../api/procurement';
import InlineHint from '../../../components/InlineHint.vue';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import { submissionRecoveryMessage } from '../../../composables/idempotency/useIdempotentIntent';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { EMessage } from '../../../utils/message';
import { useProcurementCommand } from '../composables/useProcurementCommand';
import { isReceiptVoided } from '../receipt-presentation';

const props = defineProps<{
  source: ProcurementReceiptLineOverview;
  active: boolean;
  writable: boolean;
}>();
const emit = defineEmits<{ saved: [record: ReceiptHandlingItem] }>();
const rows = ref<ReceiptHandlingItem[]>([]);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const loading = ref(false);
const readError = ref(false);
const note = ref('');
const recording = ref(false);
let attempted = false;
const loaded = ref(false);
const read = useLatestReadRequest(() => {
  loading.value = false;
});
const command = useProcurementCommand<ReceiptHandlingItem>(async (result) => {
  if (result.receiptLineId !== props.source.id) return;
  note.value = '';
  recording.value = false;
  if (page.value !== 1) {
    rows.value = [];
    loaded.value = false;
  }
  page.value = 1;
  emit('saved', result);
  await refresh();
}, '其他处理说明');
const canRecord = computed(
  () => props.active && props.writable && !isReceiptVoided(props.source) && read.isActive(),
);
const canSave = computed(
  () =>
    canRecord.value &&
    recording.value &&
    !command.locked.value &&
    Boolean(note.value.trim()) &&
    note.value.trim().length <= PROCUREMENT_RECEIPT_HANDLING_NOTE_MAX_LENGTH,
);
const emptyText = computed(() => {
  if (loading.value) return '正在读取其他处理说明';
  if (readError.value) return '其他处理说明读取失败';
  if (!loaded.value) return '尚未读取其他处理说明，请刷新';
  return '暂无其他处理说明';
});

async function refresh(): Promise<void> {
  if (!props.active || !read.isActive()) return;
  const target = props.source.id;
  const requestedPage = page.value;
  const requestedSize = pageSize.value;
  const current = read.begin(
    () =>
      props.active &&
      props.source.id === target &&
      page.value === requestedPage &&
      pageSize.value === requestedSize,
  );
  attempted = true;
  loading.value = true;
  try {
    const result = await procurementApi.receiptHandlings(
      target,
      { page: requestedPage, pageSize: requestedSize },
      current.signal,
    );
    if (!current.isCurrent()) return;
    if (result.items.some((record) => record.receiptLineId !== target))
      throw new Error('其他处理说明与当前到货明细不匹配，请刷新重试');
    rows.value = result.items;
    total.value = result.total;
    loaded.value = true;
    readError.value = false;
  } catch (error) {
    if (current.isCurrent()) {
      readError.value = true;
      EMessage.error(error, '其他处理说明读取失败');
    }
  } finally {
    if (current.isCurrent()) loading.value = false;
  }
}
function beginRecording(): void {
  if (canRecord.value && read.isActive() && !command.locked.value) recording.value = true;
}
async function canLeave(): Promise<boolean> {
  if (!(await command.canClose(Boolean(note.value)))) return false;
  note.value = '';
  recording.value = false;
  return true;
}
async function save(): Promise<void> {
  if (!canSave.value || !props.active || !read.isActive()) return;
  const target = props.source.id;
  const body: RecordReceiptHandlingPayload = { otherHandlingNote: note.value.trim() };
  await command.run(
    {
      intentType: 'procurement.receipt-handling.record',
      params: { receiptLineId: target },
      query: {},
      body,
    },
    async (key) => {
      const result = await procurementApi.recordReceiptHandling(target, body, key);
      if (
        !result ||
        result.receiptLineId !== target ||
        !result.id ||
        result.otherHandlingNote !== body.otherHandlingNote ||
        result.inboundId !== null
      )
        throw new RequestError('处理说明保存结果不完整，请核对记录后重试本次提交', 502);
      return result;
    },
    '其他处理说明已登记',
  );
}
async function changePage(value: number): Promise<void> {
  if (value === page.value) return;
  rows.value = [];
  loaded.value = false;
  readError.value = false;
  page.value = value;
  await refresh();
}
async function changePageSize(value: number): Promise<void> {
  if (value === pageSize.value) return;
  rows.value = [];
  loaded.value = false;
  readError.value = false;
  pageSize.value = value;
  page.value = 1;
  await refresh();
}
watch(
  () => ({ id: props.source.id, active: props.active }),
  (current, previous) => {
    if (current.id !== previous?.id) {
      read.invalidate();
      page.value = 1;
      total.value = 0;
      rows.value = [];
      readError.value = false;
      loaded.value = false;
      attempted = false;
      note.value = '';
      recording.value = false;
    }
    if (!current.active) read.invalidate();
    else if (current.id && !attempted) void refresh();
  },
  { immediate: true },
);
defineExpose({ refresh, beginRecording, canLeave, locked: command.locked, busy: command.busy });
</script>

<style scoped>
.records-notice {
  margin-bottom: 12px;
}
.handling-form {
  margin-top: 16px;
}
.handling-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}
.handling-actions :deep(.el-button) {
  margin-left: 0;
}
.record-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.secondary {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
