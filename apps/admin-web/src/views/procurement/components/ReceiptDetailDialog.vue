<template>
  <el-dialog
    v-model="visible"
    :title="`到货详情${detail ? ` · ${detail.receiptNo}` : ''}`"
    :width="DialogWidth.workbench"
    workbench
    :before-close="beforeClose"
  >
    <div v-loading="loading">
      <el-alert
        v-if="readError"
        title="详情读取失败，旧内容只供核对；请刷新后再办理。"
        type="error"
        :closable="false"
        class="notice"
      />
      <template v-if="detail"
        ><ReceiptVoidNotice
          v-if="detail.void"
          :record="detail.void"
          class="notice"
        />
        <el-descriptions
          :column="2"
          border
          size="small"
          ><el-descriptions-item label="采购单"
            ><strong>{{ detail.purchaseNo }}</strong></el-descriptions-item
          ><el-descriptions-item label="供应商">{{ detail.supplierName }}</el-descriptions-item
          ><el-descriptions-item label="实际到货时间">{{
            formatDateTimeForDisplay(detail.receivedAt)
          }}</el-descriptions-item
          ><el-descriptions-item label="交接凭据">{{
            detail.handoverEvidence || '—'
          }}</el-descriptions-item
          ><el-descriptions-item
            v-if="detail.remark"
            label="备注"
            :span="2"
            >{{ detail.remark }}</el-descriptions-item
          ></el-descriptions
        >
        <div class="receipt-workbench">
          <nav
            class="receipt-index"
            aria-label="到货明细"
          >
            <strong>到货明细 · {{ detail.items.length }} 条</strong
            ><el-input
              v-model="lineSearch"
              clearable
              placeholder="物料 / 编码 / 来料批次"
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
              @click="activeLine = line.id"
            >
              <strong>{{ line.itemName }}</strong
              ><span>{{ line.itemCode }} · {{ line.materialVariantCode }}</span
              ><span>到货行 ID {{ line.id }}</span
              ><span>累计已入库 {{ Number(line.quantities.inboundQuantity) }} {{ line.unit }}</span>
            </button>
          </nav>
          <section
            v-if="selectedLine"
            class="receipt-current"
          >
            <ReceiptLineSummary :line="selectedLine" /><InlineHint class="notice"
              >到货、检验报告、实际入库和采购补单分别办理。仓库直接填写实际入库数量，其他处理仅登记文字说明。</InlineHint
            >
            <div class="section-actions">
              <el-button
                v-if="!selectedLine.void && canViewInbound"
                type="primary"
                :disabled="blocked"
                @click="goInbound"
                >入库</el-button
              ><el-button
                v-if="!selectedLine.void"
                :disabled="blocked"
                @click="openHandling"
                >其他处理</el-button
              ><el-button
                v-if="canViewQuality"
                :disabled="blocked"
                @click="goQuality"
                >检验记录 / 报告</el-button
              ><el-button
                :disabled="blocked"
                @click="history?.open(selectedLine.id, 'inbounds', selectedLine)"
                >入库记录</el-button
              ><el-button
                :disabled="blocked"
                @click="history?.open(selectedLine.id, 'handlings', selectedLine)"
                >其他处理记录</el-button
              >
            </div>
            <div
              v-if="!selectedLine.void && canViewPurchases"
              class="supplement-section"
            >
              <strong>采购补单</strong>
              <div class="section-actions">
                <el-button
                  :disabled="blocked"
                  @click="goSupplement('excess_purchase')"
                  >超量补购</el-button
                ><el-button
                  :disabled="blocked"
                  @click="goSupplement('quality_replacement')"
                  >质量补发</el-button
                >
              </div>
            </div>
          </section>
        </div>
      </template>
    </div>
    <template #footer
      ><el-button
        v-if="detail && !detail.void"
        type="danger"
        plain
        :disabled="blocked"
        @click="openVoid"
        >作废整单</el-button
      ><el-button
        :disabled="loading || childOpen"
        @click="load"
        >刷新</el-button
      ><el-button @click="close">关闭</el-button></template
    >
  </el-dialog>
  <ReceiptHistoryDialog
    ref="history"
    @saved="saved"
  /><ReceiptVoidDialog
    ref="voidDialog"
    @saved="saved"
  />
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { ProcurementReceiptDetail, PurchaseOrderSupplementReason } from '@company/contracts';
import { procurementApi } from '../../../api/procurement';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { EMessage } from '../../../utils/message';
import InlineHint from '../../../components/InlineHint.vue';
import type { ReceiptDetailIntent } from '../receipt-presentation';
import ReceiptLineSummary from './ReceiptLineSummary.vue';
import ReceiptVoidNotice from './ReceiptVoidNotice.vue';
import ReceiptVoidDialog from './ReceiptVoidDialog.vue';
import ReceiptHistoryDialog from './ReceiptHistoryDialog.vue';
const emit = defineEmits<{ changed: [] }>();
const router = useRouter(),
  { canAccessRoute } = useRouteAccess();
const visible = ref(false),
  id = ref(''),
  activeLine = ref(''),
  lineSearch = ref(''),
  loading = ref(false),
  readError = ref(false);
const detail = ref<ProcurementReceiptDetail | null>(null);
const history = ref<InstanceType<typeof ReceiptHistoryDialog>>(),
  voidDialog = ref<InstanceType<typeof ReceiptVoidDialog>>();
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
const canViewInbound = computed(() => canAccessRoute({ name: 'warehouse-inbound' }));
const canViewQuality = computed(() => canAccessRoute({ name: 'quality-inbound-inspections' }));
const canViewPurchases = computed(() => canAccessRoute({ name: 'procurement-orders' }));
const childOpen = computed(() => Boolean(history.value?.visible || voidDialog.value?.visible));
const blocked = computed(
  () => loading.value || readError.value || childOpen.value || !read.isActive(),
);
async function load(): Promise<ProcurementReceiptDetail | null> {
  if (!visible.value || !read.isActive()) return null;
  const target = id.value;
  const current = read.begin(() => visible.value && id.value === target);
  loading.value = true;
  try {
    const result = await procurementApi.getReceipt(target, current.signal);
    if (!current.isCurrent()) return null;
    if (result.id !== target || result.items.length !== result.lineCount)
      throw new Error('到货明细不完整，请重新读取');
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
  if (visible.value && !(await close())) return false;
  id.value = target;
  activeLine.value = lineId ?? '';
  lineSearch.value = '';
  detail.value = null;
  readError.value = false;
  visible.value = true;
  const loadedDetail = await load();
  if (!loadedDetail) return false;
  if (lineId && !loadedDetail.items.some((line) => line.id === lineId)) {
    EMessage.warning('指定到货明细不在当前到货单中，请核对来源');
    return false;
  }
  if (intent === 'void') await openVoid();
  else if (intent === 'handling') await openHandling();
  return true;
}
async function close(): Promise<boolean> {
  if (voidDialog.value?.visible && !(await voidDialog.value.close())) return false;
  if (history.value?.visible && !(await history.value.close())) return false;
  visible.value = false;
  read.invalidate();
  return true;
}
async function saved(): Promise<void> {
  emit('changed');
  await load();
}
async function openHandling(): Promise<void> {
  const line = selectedLine.value;
  if (!blocked.value && line && !line.void)
    await history.value?.open(line.id, 'handlings', line, true);
}
async function openVoid(): Promise<void> {
  if (!blocked.value && detail.value && !detail.value.void)
    await voidDialog.value?.open(detail.value.id);
}
async function goInbound(): Promise<void> {
  const line = selectedLine.value;
  if (line && !blocked.value && (await close()))
    await router.push({
      name: 'warehouse-inbound',
      query: { sourceType: 'purchased', receiptLineId: line.id },
    });
}
async function goQuality(): Promise<void> {
  const line = selectedLine.value;
  if (line && !blocked.value && (await close()))
    await router.push({ name: 'quality-inbound-inspections', query: { receiptLineId: line.id } });
}
async function goSupplement(reason: PurchaseOrderSupplementReason): Promise<void> {
  const line = selectedLine.value;
  if (line && !blocked.value && (await close()))
    await router.push({
      name: 'procurement-orders',
      query: {
        purchaseOrderId: line.purchaseOrderId,
        supplementLineId: line.purchaseOrderLineId,
        supplementReason: reason,
        receiptLineId: line.id,
      },
    });
}
const beforeClose = (): void => {
  void close();
};
defineExpose({
  open,
  close,
  visible,
  locked: computed(() => Boolean(voidDialog.value?.locked || history.value?.locked)),
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
.receipt-index-item span,
.secondary {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.receipt-current {
  min-width: 0;
}
.section-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.section-actions :deep(.el-button) {
  margin-left: 0;
}
.supplement-section {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}
</style>
