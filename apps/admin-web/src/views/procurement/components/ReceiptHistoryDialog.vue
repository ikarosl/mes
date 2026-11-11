<template>
  <el-dialog
    v-model="visible"
    title="到货办理记录"
    :width="DialogWidth.xl"
    :before-close="beforeClose"
    :show-close="!command.busy.value"
  >
    <el-descriptions
      v-if="source"
      :column="2"
      border
      size="small"
      class="notice"
    >
      <el-descriptions-item label="到货单"
        ><strong>{{ source.receiptNo }}</strong></el-descriptions-item
      ><el-descriptions-item label="采购单">{{ source.purchaseNo }}</el-descriptions-item
      ><el-descriptions-item label="物料 / 精确版本"
        >{{ source.itemName }} · {{ source.materialVariantCode }}</el-descriptions-item
      ><el-descriptions-item label="来料批次号">{{
        source.supplierBatchCode || '未提供'
      }}</el-descriptions-item>
    </el-descriptions>
    <InlineHint class="notice"
      >其他处理按到货物料独立登记说明；退回、报废或暂存等线下处理是否完成不在系统追踪。</InlineHint
    >
    <el-alert
      v-if="command.status.value !== 'idle'"
      :title="submissionRecoveryMessage(command.status.value, '其他处理记录')"
      type="warning"
      :closable="false"
      class="notice"
    />
    <el-tabs
      v-model="tab"
      @tab-change="changeTab"
      ><el-tab-pane
        label="其他处理说明"
        name="handlings" /><el-tab-pane
        label="实际入库"
        name="inbounds"
    /></el-tabs>
    <el-form
      v-if="tab === 'handlings' && recording"
      label-position="top"
      :disabled="command.locked.value"
      @submit.prevent="save"
    >
      <el-form-item
        label="本次其他处理说明"
        required
        ><el-input
          v-model="note"
          type="textarea"
          :rows="3"
          :maxlength="PROCUREMENT_RECEIPT_HANDLING_NOTE_MAX_LENGTH"
          show-word-limit
          placeholder="如退回、报废、暂存的情况；只登记文字说明"
      /></el-form-item>
    </el-form>
    <el-alert
      v-if="readError"
      title="记录读取失败，已显示内容为上次结果。请刷新后核对。"
      type="error"
      :closable="false"
      class="notice"
    />
    <el-table
      v-if="tab === 'handlings'"
      v-loading="loading"
      :data="handlings"
      row-key="id"
    >
      <el-table-column
        label="其他处理说明"
        min-width="300"
        ><template #default="{ row }"
          ><span class="record-text">{{ row.otherHandlingNote }}</span></template
        ></el-table-column
      >
      <el-table-column
        label="记录时间"
        width="190"
        ><template #default="{ row }">{{
          formatDateTimeForDisplay(row.createdAt)
        }}</template></el-table-column
      >
      <el-table-column
        label="历史关联入库"
        min-width="180"
        ><template #default="{ row }"
          ><el-button
            v-if="row.inboundId && canViewInbound"
            link
            type="primary"
            @click="goInbound(row.inboundId)"
            >查看入库单</el-button
          ><span v-else>{{ row.inboundId ? '有历史关联入库' : '—' }}</span></template
        ></el-table-column
      >
    </el-table>
    <el-table
      v-else
      v-loading="loading"
      :data="inbounds"
      row-key="inboundDetailId"
    >
      <el-table-column
        prop="inboundNo"
        label="入库单号"
        min-width="180"
        ><template #default="{ row }"
          ><el-button
            v-if="canViewInbound"
            link
            type="primary"
            @click="goInbound(row.inboundId)"
            >{{ row.inboundNo }}</el-button
          ><span v-else>{{ row.inboundNo }}</span></template
        ></el-table-column
      >
      <el-table-column
        prop="batchCode"
        label="库存批次"
        min-width="180"
      /><el-table-column
        prop="quantity"
        label="入库数量"
        width="120"
        align="right"
      />
      <el-table-column
        label="入库时间"
        width="190"
        ><template #default="{ row }">{{
          formatDateTimeForDisplay(row.confirmedAt)
        }}</template></el-table-column
      >
    </el-table>
    <PaginationFooter
      :total="total"
      :current-page="page"
      :page-size="pageSize"
      :disabled="loading"
      @page-change="changePage"
      @update:page-size="changePageSize"
    />
    <template #footer>
      <el-button
        :disabled="command.busy.value"
        @click="load"
        >刷新记录</el-button
      ><el-button
        :disabled="command.busy.value"
        @click="close"
        >关闭</el-button
      >
      <el-button
        v-if="command.status.value === 'pending'"
        type="primary"
        :loading="command.busy.value"
        @click="command.retry"
        >重试本次提交</el-button
      >
      <template v-else-if="command.status.value === 'idle'"
        ><el-button
          v-if="canRecord && tab === 'handlings' && !recording"
          type="primary"
          @click="recording = true"
          >登记其他处理</el-button
        ><el-button
          v-if="tab === 'handlings' && recording"
          type="primary"
          :disabled="!canSave"
          :loading="command.busy.value"
          @click="save"
          >保存处理说明</el-button
        ></template
      >
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { RequestError } from '@company/request';
import { PROCUREMENT_RECEIPT_HANDLING_NOTE_MAX_LENGTH } from '@company/constants';
import type {
  ReceiptHandlingItem,
  ReceiptInboundHistoryItem,
  ReceiptHistoryKind,
  ProcurementReceiptLineOverview,
  RecordReceiptHandlingPayload,
} from '@company/contracts';
import { procurementApi } from '../../../api/procurement';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import { submissionRecoveryMessage } from '../../../composables/idempotency/useIdempotentIntent';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import { useProcurementCommand } from '../composables/useProcurementCommand';
import InlineHint from '../../../components/InlineHint.vue';
import PaginationFooter from '../../../components/PaginationFooter.vue';
const emit = defineEmits<{ saved: [record: ReceiptHandlingItem] }>();
const visible = ref(false),
  lineId = ref(''),
  tab = ref<ReceiptHistoryKind>('handlings');
const loading = ref(false),
  readError = ref(false),
  page = ref(1),
  pageSize = ref(10),
  total = ref(0);
const handlings = ref<ReceiptHandlingItem[]>([]),
  inbounds = ref<ReceiptInboundHistoryItem[]>([]);
const source = ref<ProcurementReceiptLineOverview | null>(null),
  note = ref(''),
  recording = ref(false);
const router = useRouter(),
  { canAccessRoute } = useRouteAccess();
const canViewInbound = computed(() => canAccessRoute({ name: 'warehouse-inbound' }));
const read = useLatestReadRequest(() => {
  loading.value = false;
});
const command = useProcurementCommand<ReceiptHandlingItem>(async (result) => {
  if (!visible.value || result.receiptLineId !== lineId.value) return;
  note.value = '';
  recording.value = false;
  page.value = 1;
  emit('saved', result);
  if (tab.value === 'handlings') await load();
}, '其他处理说明');
const canRecord = computed(() =>
  Boolean(source.value && source.value.id === lineId.value && !source.value.void),
);
const canSave = computed(
  () =>
    canRecord.value &&
    recording.value &&
    tab.value === 'handlings' &&
    read.isActive() &&
    !command.locked.value &&
    Boolean(note.value.trim()) &&
    note.value.trim().length <= PROCUREMENT_RECEIPT_HANDLING_NOTE_MAX_LENGTH,
);
async function load(): Promise<void> {
  if (!visible.value || !read.isActive()) return;
  const id = lineId.value,
    kind = tab.value,
    requestedPage = page.value,
    requestedSize = pageSize.value;
  const current = read.begin(
    () =>
      visible.value &&
      lineId.value === id &&
      tab.value === kind &&
      page.value === requestedPage &&
      pageSize.value === requestedSize,
  );
  loading.value = true;
  try {
    const params = { page: requestedPage, pageSize: requestedSize };
    if (kind === 'handlings') {
      const result = await procurementApi.receiptHandlings(id, params, current.signal);
      if (current.isCurrent()) {
        handlings.value = result.items;
        total.value = result.total;
      }
    } else {
      const result = await procurementApi.receiptInbounds(id, params, current.signal);
      if (current.isCurrent()) {
        inbounds.value = result.items;
        total.value = result.total;
      }
    }
    if (current.isCurrent()) readError.value = false;
  } catch (error) {
    if (current.isCurrent()) {
      readError.value = true;
      EMessage.error(error, '到货办理记录加载失败');
    }
  } finally {
    if (current.isCurrent()) loading.value = false;
  }
}
async function open(
  id: string,
  initial: ReceiptHistoryKind = 'handlings',
  basis?: ProcurementReceiptLineOverview,
  beginRecording = false,
): Promise<boolean> {
  if (visible.value && !(await close())) return false;
  if (basis && basis.id !== id) {
    EMessage.warning('处理说明来源不匹配，请重新读取到货明细');
    return false;
  }
  lineId.value = id;
  source.value = basis ? { ...basis, quantities: { ...basis.quantities } } : null;
  tab.value = initial;
  page.value = 1;
  total.value = 0;
  handlings.value = [];
  inbounds.value = [];
  readError.value = false;
  note.value = '';
  recording.value = beginRecording && Boolean(basis && !basis.void);
  visible.value = true;
  await load();
  return true;
}
async function save(): Promise<void> {
  if (!canSave.value || !visible.value || !read.isActive()) return;
  const target = lineId.value;
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
async function close(): Promise<boolean> {
  if (!(await command.canClose(Boolean(note.value)))) return false;
  visible.value = false;
  read.invalidate();
  return true;
}
async function changeTab(): Promise<void> {
  page.value = 1;
  handlings.value = [];
  inbounds.value = [];
  total.value = 0;
  await load();
}
async function changePage(value: number): Promise<void> {
  page.value = value;
  await load();
}
async function changePageSize(value: number): Promise<void> {
  pageSize.value = value;
  await changeTab();
}
async function goInbound(id: string): Promise<void> {
  if (await close())
    await router.push({
      name: 'warehouse-inbound',
      query: { sourceType: 'purchased', inboundId: id },
    });
}
const beforeClose = (): void => {
  void close();
};
defineExpose({ open, close, visible, locked: command.locked });
</script>
<style scoped>
.notice {
  margin-bottom: 12px;
}
.record-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
