<template>
  <el-dialog
    v-model="visible"
    :title="`到货详情${detail ? ` · ${detail.receiptNo}` : ''}`"
    :width="DialogWidth.workbench"
    workbench
    :before-close="beforeClose"
    :show-close="!handling?.busy"
  >
    <div v-loading="loading">
      <el-alert
        v-if="readError"
        title="详情读取失败，旧内容只供核对；请刷新后再登记说明。"
        type="error"
        :closable="false"
        class="notice"
      />
      <template v-if="detail">
        <ReceiptVoidNotice
          v-if="detail.void"
          :record="detail.void"
          class="notice"
        />
        <el-descriptions
          :column="2"
          border
          size="small"
        >
          <el-descriptions-item label="采购单"
            ><strong>{{ detail.purchaseNo }}</strong></el-descriptions-item
          >
          <el-descriptions-item label="供应商">{{ detail.supplierName }}</el-descriptions-item>
          <el-descriptions-item label="实际到货时间">{{
            formatDateTimeForDisplay(detail.receivedAt)
          }}</el-descriptions-item>
          <el-descriptions-item label="交接凭据">{{
            detail.handoverEvidence || '—'
          }}</el-descriptions-item>
          <el-descriptions-item
            v-if="detail.remark"
            label="备注"
            :span="2"
            >{{ detail.remark }}</el-descriptions-item
          >
        </el-descriptions>
        <div class="receipt-workbench">
          <nav
            class="receipt-index"
            aria-label="到货明细"
          >
            <strong>到货明细 · {{ detail.items.length }} 条</strong>
            <el-input
              v-model="lineSearch"
              clearable
              placeholder="物料 / 编码 / 供应商批号"
            />
            <p
              v-if="lineSearch && !filteredLines.some((line) => line.id === activeLine)"
              class="secondary"
            >
              当前明细不在筛选结果中，右侧仍保留。
            </p>
            <button
              v-for="line in filteredLines"
              :key="line.id"
              type="button"
              class="receipt-index-item"
              :class="{ active: line.id === activeLine }"
              :aria-current="line.id === activeLine ? 'true' : undefined"
              :disabled="transitioning || Boolean(handling?.busy) || childOpen"
              @click="selectLine(line.id)"
            >
              <strong>{{ line.itemName }}</strong>
              <span>{{ line.itemCode }} · {{ line.materialVariantCode }}</span>
              <span>到货行 ID {{ line.id }}</span>
              <span
                >累计已入库 {{ formatQuantity(line.quantities.inboundQuantity) }}
                {{ line.unit }}</span
              >
            </button>
          </nav>
          <section
            v-if="selectedLine"
            class="receipt-current"
          >
            <div class="material-heading">
              <h3>{{ selectedLine.itemName }}</h3>
              <span>{{ selectedLine.itemCode }} · {{ selectedLine.materialVariantCode }}</span>
              <span>供应商批号：{{ selectedLine.supplierBatchCode || '未提供' }}</span>
              <span>采购行 ID：{{ selectedLine.purchaseOrderLineId }}</span>
            </div>
            <el-descriptions
              :column="2"
              border
              size="small"
              class="material-summary"
            >
              <el-descriptions-item label="累计已入库">
                <strong
                  >{{ formatQuantity(selectedLine.quantities.inboundQuantity) }}
                  {{ selectedLine.unit }}</strong
                >
              </el-descriptions-item>
              <el-descriptions-item label="报告记录">
                <span v-if="!canViewQuality || reportSummary.forbidden.value"
                  >无查看检验报告权限</span
                >
                <span v-else-if="reportSummary.loading.value">正在读取…</span>
                <span
                  v-else-if="reportSummary.failed.value"
                  class="read-failed"
                  >读取失败，请刷新重试</span
                >
                <strong v-else-if="reportSummary.total.value !== null"
                  >{{ reportSummary.total.value }} 条（含历史）</strong
                >
                <span v-else>尚未读取成功，请刷新</span>
              </el-descriptions-item>
              <el-descriptions-item
                label="当前报告"
                :span="2"
              >
                <span v-if="!canViewQuality || reportSummary.forbidden.value"
                  >无查看检验报告权限</span
                >
                <span v-else-if="reportSummary.loading.value">正在读取…</span>
                <span
                  v-else-if="reportSummary.failed.value"
                  class="read-failed"
                  >读取失败，请刷新重试</span
                >
                <div
                  v-else-if="reportSummary.latest.value"
                  class="latest-report"
                >
                  <strong>{{ reportSummary.latest.value.reportNo }}</strong>
                  <span>{{
                    QUALITY_INSPECTION_METHOD_LABELS[reportSummary.latest.value.inspectionMethod]
                  }}</span>
                  <span
                    >合格
                    <strong
                      :class="{
                        qualified: Number(reportSummary.latest.value.qualifiedQuantity) > 0,
                      }"
                      >{{ formatQuantity(reportSummary.latest.value.qualifiedQuantity) }}</strong
                    >
                    / 不合格
                    <strong
                      :class="{
                        unqualified: Number(reportSummary.latest.value.unqualifiedQuantity) > 0,
                      }"
                      >{{ formatQuantity(reportSummary.latest.value.unqualifiedQuantity) }}</strong
                    >
                    {{ selectedLine.unit }}</span
                  >
                  <span
                    >登记于
                    {{ formatDateTimeForDisplay(reportSummary.latest.value.createdAt) }}</span
                  >
                </div>
                <span v-else-if="reportSummary.total.value === 0">尚无检验报告</span>
                <span v-else>尚未读取成功，请刷新</span>
              </el-descriptions-item>
              <el-descriptions-item
                label="其他处理说明"
                :span="2"
              >
                <strong>{{ selectedLine.handlingCount }} 条</strong>
                <div
                  v-if="selectedLine.otherHandlingNote"
                  class="record-text"
                >
                  最近说明：{{ selectedLine.otherHandlingNote }}
                </div>
                <span v-else-if="selectedLine.handlingCount === 0"> · 暂无其他处理说明</span>
                <span v-else> · 最近说明未读取完整，请刷新核对</span>
              </el-descriptions-item>
            </el-descriptions>
            <el-tabs
              v-model="selectedTab"
              :before-leave="beforeTabLeave"
              class="record-tabs"
            >
              <el-tab-pane
                label="入库记录"
                name="inbounds"
              />
              <el-tab-pane
                label="检验报告"
                name="reports"
              />
              <el-tab-pane
                label="其他处理说明"
                name="handlings"
              />
            </el-tabs>
            <ReceiptInboundRecords
              v-show="selectedTab === 'inbounds'"
              ref="inbounds"
              :receipt-line-id="selectedLine.id"
              :unit="selectedLine.unit"
              :active="visible && selectedTab === 'inbounds'"
            />
            <ReceiptInspectionRecords
              v-if="canViewQuality"
              v-show="selectedTab === 'reports'"
              ref="reports"
              :receipt-line-id="selectedLine.id"
              :active="visible && selectedTab === 'reports'"
            />
            <el-empty
              v-else-if="selectedTab === 'reports'"
              description="无查看检验报告权限"
              :image-size="64"
            />
            <ReceiptHandlingRecords
              v-show="selectedTab === 'handlings'"
              ref="handling"
              :source="selectedLine"
              :active="visible && selectedTab === 'handlings'"
              :writable="!blocked"
              @saved="handlingSaved"
            />
          </section>
        </div>
      </template>
      <el-empty
        v-else-if="!loading"
        :description="readError ? '到货详情读取失败，请刷新重试' : '到货详情尚未读取成功，请刷新'"
        :image-size="64"
      />
    </div>
    <template #footer>
      <el-button
        :disabled="loading || childOpen || transitioning"
        @click="refresh"
        >刷新</el-button
      >
      <el-button
        :disabled="Boolean(handling?.busy)"
        @click="close"
        >关闭</el-button
      >
    </template>
  </el-dialog>
  <ReceiptVoidDialog
    ref="voidDialog"
    @saved="voidSaved"
  />
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { QUALITY_INSPECTION_METHOD_LABELS } from '@company/constants';
import type { ProcurementReceiptDetail, ReceiptHandlingItem } from '@company/contracts';
import { procurementApi } from '../../../api/procurement';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { EMessage } from '../../../utils/message';
import { formatQuantity } from '../../../utils/quantity';
import { useReceiptInspectionSummary } from '../composables/useReceiptInspectionSummary';
import type { ReceiptDetailIntent } from '../receipt-presentation';
import ReceiptHandlingRecords from './ReceiptHandlingRecords.vue';
import ReceiptInboundRecords from './ReceiptInboundRecords.vue';
import ReceiptInspectionRecords from './ReceiptInspectionRecords.vue';
import ReceiptVoidNotice from './ReceiptVoidNotice.vue';
import ReceiptVoidDialog from './ReceiptVoidDialog.vue';

type ReceiptDetailTab = 'inbounds' | 'reports' | 'handlings';
const emit = defineEmits<{ changed: [] }>();
const { canAccessRoute } = useRouteAccess();
const visible = ref(false);
const id = ref('');
const activeLine = ref('');
const lineSearch = ref('');
const selectedTab = ref<ReceiptDetailTab>('inbounds');
const loading = ref(false);
const readError = ref(false);
const transitioning = ref(false);
const detail = ref<ProcurementReceiptDetail | null>(null);
const inbounds = ref<InstanceType<typeof ReceiptInboundRecords>>();
const reports = ref<InstanceType<typeof ReceiptInspectionRecords>>();
const handling = ref<InstanceType<typeof ReceiptHandlingRecords>>();
const voidDialog = ref<InstanceType<typeof ReceiptVoidDialog>>();
let contextVersion = 0;
const read = useLatestReadRequest(() => {
  loading.value = false;
});
const selectedLine = computed(() =>
  detail.value?.items.find((line) => line.id === activeLine.value),
);
const filteredLines = computed(() => {
  const query = lineSearch.value.trim().toLocaleLowerCase();
  return (detail.value?.items ?? []).filter(
    (line) =>
      !query ||
      [line.itemName, line.itemCode, line.materialVariantCode, line.supplierBatchCode ?? ''].some(
        (value) => value.toLocaleLowerCase().includes(query),
      ),
  );
});
const canViewQuality = computed(() => canAccessRoute({ name: 'quality-inbound-inspections' }));
const childOpen = computed(() => Boolean(voidDialog.value?.visible));
const blocked = computed(
  () =>
    loading.value || readError.value || childOpen.value || transitioning.value || !read.isActive(),
);
const reportSummary = useReceiptInspectionSummary(
  () => selectedLine.value?.id ?? '',
  () => visible.value,
  () => canViewQuality.value,
);

async function load(): Promise<ProcurementReceiptDetail | null> {
  if (!visible.value || !read.isActive()) return null;
  const target = id.value;
  const version = contextVersion;
  const current = read.begin(
    () => visible.value && id.value === target && contextVersion === version,
  );
  loading.value = true;
  try {
    const result = await procurementApi.getReceipt(target, current.signal);
    if (!current.isCurrent()) return null;
    if (
      result.id !== target ||
      result.items.length !== result.lineCount ||
      new Set(result.items.map((line) => line.id)).size !== result.items.length ||
      result.items.some((line) => line.receiptId !== target)
    )
      throw new Error('到货明细不完整，请重新读取');
    if (selectedLine.value && !result.items.some((line) => line.id === activeLine.value))
      throw new Error('当前到货明细已变化，输入已保留；请关闭后重新核对来源');
    detail.value = result;
    if (!result.items.some((line) => line.id === activeLine.value))
      activeLine.value = result.items[0]?.id ?? '';
    readError.value = false;
    return result;
  } catch (error) {
    if (current.isCurrent()) {
      readError.value = true;
      EMessage.error(error, '到货详情读取失败');
    }
    return null;
  } finally {
    if (current.isCurrent()) loading.value = false;
  }
}
async function open(
  target: string,
  lineId?: string,
  intent?: ReceiptDetailIntent,
): Promise<boolean> {
  if (transitioning.value || !read.isActive()) return false;
  if (visible.value && !(await close())) return false;
  const version = ++contextVersion;
  id.value = target;
  activeLine.value = lineId ?? '';
  lineSearch.value = '';
  selectedTab.value = intent === 'handling' ? 'handlings' : 'inbounds';
  detail.value = null;
  readError.value = false;
  visible.value = true;
  const loadedDetail = await load();
  if (!loadedDetail || !visible.value || contextVersion !== version) return false;
  if (lineId && !loadedDetail.items.some((line) => line.id === lineId)) {
    EMessage.warning('指定到货明细不在当前到货单中，请核对来源');
    return false;
  }
  if (intent === 'void') await openVoid();
  else if (intent === 'handling') {
    await nextTick();
    if (visible.value && contextVersion === version) handling.value?.beginRecording();
  }
  return visible.value && contextVersion === version;
}
async function close(): Promise<boolean> {
  if (transitioning.value) return false;
  transitioning.value = true;
  try {
    if (voidDialog.value?.visible && !(await voidDialog.value.close())) return false;
    if (handling.value && !(await handling.value.canLeave())) return false;
    contextVersion += 1;
    visible.value = false;
    read.invalidate();
    reportSummary.invalidate();
    return true;
  } finally {
    transitioning.value = false;
  }
}
async function selectLine(lineId: string): Promise<void> {
  if (
    lineId === activeLine.value ||
    transitioning.value ||
    childOpen.value ||
    !visible.value ||
    !read.isActive()
  )
    return;
  const version = contextVersion;
  transitioning.value = true;
  try {
    if (handling.value && !(await handling.value.canLeave())) return;
    if (visible.value && contextVersion === version) activeLine.value = lineId;
  } finally {
    transitioning.value = false;
  }
}
async function beforeTabLeave(next: string | number): Promise<boolean> {
  if (next === selectedTab.value) return true;
  if (transitioning.value || childOpen.value || !visible.value || !read.isActive()) return false;
  const version = contextVersion;
  const lineId = activeLine.value;
  transitioning.value = true;
  try {
    if (handling.value && !(await handling.value.canLeave())) return false;
    return visible.value && contextVersion === version && activeLine.value === lineId;
  } finally {
    transitioning.value = false;
  }
}
async function refresh(): Promise<void> {
  if (loading.value || childOpen.value || transitioning.value || !visible.value || !read.isActive())
    return;
  let currentRecords: Promise<void> | undefined;
  if (selectedTab.value === 'inbounds') currentRecords = inbounds.value?.refresh();
  else if (selectedTab.value === 'reports') currentRecords = reports.value?.refresh();
  else currentRecords = handling.value?.refresh();
  await Promise.all([load(), reportSummary.refresh(), currentRecords]);
}
async function handlingSaved(record: ReceiptHandlingItem): Promise<void> {
  emit('changed');
  if (!visible.value || record.receiptLineId !== activeLine.value || !read.isActive()) return;
  await load();
}
async function voidSaved(): Promise<void> {
  emit('changed');
  await load();
}
async function openVoid(): Promise<void> {
  if (!blocked.value && detail.value && !detail.value.void)
    await voidDialog.value?.open(detail.value.id);
}
const beforeClose = (): void => {
  void close();
};
defineExpose({
  open,
  close,
  visible,
  locked: computed(() =>
    Boolean(transitioning.value || voidDialog.value?.locked || handling.value?.locked),
  ),
});
</script>

<style scoped>
.notice {
  margin: 12px 0;
}
.receipt-workbench {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 20px;
  margin-top: 16px;
}
.receipt-index {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.receipt-index-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 100%;
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  color: var(--el-text-color-primary);
  background: var(--el-bg-color);
  text-align: left;
  cursor: pointer;
}
.receipt-index-item.active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.receipt-index-item:disabled {
  cursor: default;
}
.receipt-index-item span,
.secondary {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.receipt-current {
  min-width: 0;
}
.material-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 16px;
  margin-bottom: 12px;
  overflow-wrap: anywhere;
}
.material-heading h3 {
  flex-basis: 100%;
  margin: 0;
  color: var(--el-text-color-primary);
  font-size: 16px;
  font-weight: 600;
}
.material-heading span {
  color: var(--el-text-color-regular);
  font-size: 13px;
}
.material-summary {
  overflow-wrap: anywhere;
}
.material-summary :deep(.el-descriptions__label) {
  width: 112px;
}
.latest-report {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}
.material-summary strong {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.qualified {
  color: var(--el-color-success);
}
.unqualified,
.read-failed {
  color: var(--el-color-danger);
}
.record-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.record-tabs {
  margin-top: 16px;
}
@media (max-width: 1100px) {
  .receipt-workbench {
    grid-template-columns: 220px minmax(0, 1fr);
    gap: 16px;
  }
}
</style>
