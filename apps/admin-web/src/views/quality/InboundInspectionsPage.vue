<template>
  <section>
    <div class="query-panel">
      <el-form
        inline
        @submit.prevent="searchAndExpand"
      >
        <el-form-item label="到货 / 采购 / 物料">
          <el-input
            v-model="keyword"
            clearable
            maxlength="100"
            placeholder="输入单号、名称或版本"
          />
        </el-form-item>
        <el-form-item label="办理状态">
          <el-select
            v-model="status"
            clearable
            placeholder="全部记录"
            style="width: 180px"
          >
            <el-option
              value="uninspected"
              :label="RECEIPT_ROUND_STATUS_LABELS.uninspected"
            />
            <el-option
              v-for="value in QUALITY_INBOUND_CASE_STATUSES"
              :key="value"
              :value="value"
              :label="QUALITY_INBOUND_CASE_STATUS_LABELS[value]"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="整批阶段">
          <el-select
            v-model="roundStatus"
            clearable
            placeholder="全部"
            style="width: 170px"
          >
            <el-option
              v-for="value in RECEIPT_ROUND_STATUSES"
              :key="value"
              :value="value"
              :label="RECEIPT_ROUND_STATUS_LABELS[value]"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            native-type="submit"
            :loading="loading"
            >查询</el-button
          >
          <el-button @click="resetAndExpand">重置</el-button>
        </el-form-item>
      </el-form>
    </div>
    <div
      v-loading="loading"
      class="table-panel"
    >
      <TableToolbar>
        <template #actions
          ><span class="help">按采购单浏览本页检验对象；放行后仍由库管核对定稿。</span></template
        >
        <template #tools>
          <el-button
            text
            @click="expandPage"
            >展开当前页</el-button
          >
          <el-button
            text
            @click="collapsePage"
            >收起当前页</el-button
          >
          <el-button
            :icon="Refresh"
            text
            circle
            :loading="loading"
            aria-label="刷新来料检验"
            @click="load"
          />
        </template>
      </TableToolbar>
      <div class="page-scope">
        当前页 {{ rows.length }} 条记录，按原采购单分组；同一采购单的其他到货明细可能在别页。
      </div>
      <el-empty
        v-if="!groups.length && !loading"
        description="当前筛选下暂无来料检验记录"
        :image-size="72"
      />
      <div
        v-for="group in groups"
        :key="group.purchaseOrderId"
        class="document-block"
      >
        <div class="document-heading">
          <button
            class="fold-button"
            type="button"
            :aria-expanded="!collapsedPurchases.has(group.purchaseOrderId)"
            @click="togglePurchase(group.purchaseOrderId)"
          >
            <span class="fold-icon">{{
              collapsedPurchases.has(group.purchaseOrderId) ? '▶' : '▼'
            }}</span>
            <strong>采购单 {{ group.purchaseNo }}</strong>
          </button>
          <span class="document-meta"
            >本页含本单 {{ group.records }} 条记录 · {{ group.lines.length }} 条到货明细</span
          >
          <span class="document-meta">本页供应商：{{ group.suppliers.join('、') }}</span>
          <span class="document-counts"
            >本页待检 {{ group.pending }} 条 · 检验中 {{ group.reviewing }} 条 · 质量阻断
            {{ group.blocked }} 条</span
          >
        </div>
        <div
          v-if="!collapsedPurchases.has(group.purchaseOrderId)"
          class="document-body"
        >
          <div
            v-for="receipt in group.receipts"
            :key="receipt.receiptId"
            class="receipt-group"
          >
            <div class="receipt-heading">
              到货单 {{ receipt.receiptNo }} <span>本页 {{ receipt.records }} 条记录</span>
            </div>
            <div
              class="line-grid column-heading"
              aria-hidden="true"
            >
              <span>物料 / 精确版本</span><span>实际供应商</span><span>申报参考量</span
              ><span>当前轮 / 状态</span><span>检验结论</span><span>下一步</span>
            </div>
            <div
              v-for="line in receipt.lines"
              :key="line.receiptLineId"
              class="line-item"
              :class="{ highlighted: highlightedLineId === line.receiptLineId }"
            >
              <div class="line-grid">
                <div class="identity">
                  <strong>{{ line.base.itemName }}</strong
                  ><span>{{ line.base.itemCode }} · {{ line.base.materialVariantCode }}</span>
                </div>
                <div>{{ line.base.supplierName }}</div>
                <div>
                  <template v-if="line.current"
                    >{{ Number(line.current.coveredQuantity) }} {{ line.current.unit }}</template
                  >
                  <span
                    v-else
                    class="muted"
                    >当前轮未列于本页</span
                  >
                </div>
                <div>
                  <template v-if="line.current">
                    <span class="round-reference">本轮 #{{ line.current.roundId }}</span>
                    <el-tag
                      size="small"
                      :type="roundTagType(line.current.roundStatus)"
                      >{{ RECEIPT_ROUND_STATUS_LABELS[line.current.roundStatus] }}</el-tag
                    >
                  </template>
                  <span
                    v-else
                    class="muted"
                    >仅有本页历史记录</span
                  >
                </div>
                <div>
                  <template v-if="line.current?.case?.inspection"
                    ><span class="basis-label">本轮结果</span
                    >{{
                      QUALITY_RELEASE_DECISION_LABELS[line.current.case.inspection.releaseDecision]
                    }}</template
                  >
                  <template v-else-if="line.latestHistoricalDecision">
                    <span class="basis-label">最近历史结论 · 非本轮</span>
                    {{ QUALITY_RELEASE_DECISION_LABELS[line.latestHistoricalDecision] }}
                  </template>
                  <span
                    v-else-if="line.current"
                    class="muted"
                    >本轮尚无检验结果</span
                  >
                  <span
                    v-else
                    class="muted"
                    >请在详情核对当前依据</span
                  >
                </div>
                <div>
                  <el-button
                    link
                    type="primary"
                    @click="navigate(line.receiptLineId, line.current ?? line.base)"
                    >{{ lineAction(line.current) }}</el-button
                  >
                </div>
              </div>
              <div
                v-if="line.history.length"
                class="history-area"
              >
                <button
                  class="history-toggle"
                  type="button"
                  :aria-expanded="expandedHistory.has(line.receiptLineId)"
                  @click="toggleHistory(line.receiptLineId)"
                >
                  {{ expandedHistory.has(line.receiptLineId) ? '收起' : '查看' }}本页历史
                  {{ line.history.length }} 条
                </button>
                <div
                  v-if="expandedHistory.has(line.receiptLineId)"
                  class="history-list"
                >
                  <div
                    v-for="record in line.history"
                    :key="record.taskKey"
                    class="history-row"
                  >
                    <span
                      >历史轮 #{{ record.roundId }} ·
                      {{
                        record.case
                          ? QUALITY_INBOUND_CASE_TYPE_LABELS[record.case.caseType]
                          : RECEIPT_ROUND_STATUS_LABELS[record.roundStatus]
                      }}</span
                    >
                    <span>{{
                      record.case
                        ? QUALITY_INBOUND_CASE_STATUS_LABELS[record.case.status]
                        : RECEIPT_ROUND_STATUS_LABELS[record.roundStatus]
                    }}</span>
                    <span>{{
                      record.case?.inspection
                        ? QUALITY_RELEASE_DECISION_LABELS[record.case.inspection.releaseDecision]
                        : '无检验结果'
                    }}</span>
                    <span>{{
                      formatDateTimeForDisplay(record.case?.inspection?.inspectedAt)
                    }}</span>
                    <el-button
                      link
                      type="primary"
                      @click="navigate(record.receiptLineId, record)"
                      >查看该记录</el-button
                    >
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <PaginationFooter
        :total="total"
        :current-page="page"
        :page-size="pageSize"
        @page-change="changePage"
        @update:page-size="changePageSize"
      />
    </div>
    <InboundInspectionDetailDialog
      ref="detail"
      @changed="load"
    />
  </section>
</template>
<script setup lang="ts">
import { computed, nextTick, onActivated, onScopeDispose, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Refresh } from '@element-plus/icons-vue';
import type {
  ProcurementInboundInspectionItem,
  QualityReleaseDecision,
  ReceiptRoundStatus,
} from '@company/contracts';
import {
  QUALITY_INBOUND_CASE_STATUSES,
  QUALITY_INBOUND_CASE_STATUS_LABELS,
  QUALITY_INBOUND_CASE_TYPE_LABELS,
  QUALITY_RELEASE_DECISION_LABELS,
  RECEIPT_ROUND_STATUS_LABELS,
  RECEIPT_ROUND_STATUSES,
} from '@company/constants';
import { procurementApi } from '../../api/procurement';
import TableToolbar from '../../components/TableToolbar.vue';
import PaginationFooter from '../../components/PaginationFooter.vue';
import { EMessage } from '../../utils/message';
import { formatDateTimeForDisplay } from '../../utils/date';
import { useTabsStore } from '../../stores/tabs';
import { useLatestReadRequest } from '../../composables/requests/useLatestReadRequest';
import { useInboundInspectionsList } from '../procurement/composables/useInboundInspectionsList';
import InboundInspectionDetailDialog from '../procurement/components/InboundInspectionDetailDialog.vue';

defineOptions({ name: 'InboundInspectionsPage' });
type InspectionLine = {
  receiptLineId: string;
  base: ProcurementInboundInspectionItem;
  current: ProcurementInboundInspectionItem | null;
  history: ProcurementInboundInspectionItem[];
  latestHistoricalDecision: QualityReleaseDecision | null;
};
type ReceiptGroup = {
  receiptId: string;
  receiptNo: string;
  records: number;
  lines: InspectionLine[];
};
type PurchaseGroup = {
  purchaseOrderId: string;
  purchaseNo: string;
  records: number;
  lines: InspectionLine[];
  receipts: ReceiptGroup[];
  suppliers: string[];
  pending: number;
  reviewing: number;
  blocked: number;
};
const route = useRoute(),
  router = useRouter();
const {
  keyword,
  status,
  roundStatus,
  rows,
  page,
  pageSize,
  total,
  loading,
  load,
  search,
  reset,
  changePage,
  changePageSize,
} = useInboundInspectionsList();
const detail = ref<InstanceType<typeof InboundInspectionDetailDialog>>();
const collapsedPurchases = ref(new Set<string>());
const expandedHistory = ref(new Set<string>());
const highlightedLineId = ref('');
const groups = computed<PurchaseGroup[]>(() => {
  const purchases = new Map<string, PurchaseGroup>();
  const receipts = new Map<string, ReceiptGroup>();
  const lines = new Map<string, InspectionLine>();
  for (const row of rows.value) {
    let purchase = purchases.get(row.purchaseOrderId);
    if (!purchase) {
      purchase = {
        purchaseOrderId: row.purchaseOrderId,
        purchaseNo: row.purchaseNo,
        records: 0,
        lines: [],
        receipts: [],
        suppliers: [],
        pending: 0,
        reviewing: 0,
        blocked: 0,
      };
      purchases.set(row.purchaseOrderId, purchase);
    }
    purchase.records += 1;
    if (!purchase.suppliers.includes(row.supplierName)) purchase.suppliers.push(row.supplierName);
    let receipt = receipts.get(row.receiptId);
    if (!receipt) {
      receipt = { receiptId: row.receiptId, receiptNo: row.receiptNo, records: 0, lines: [] };
      receipts.set(row.receiptId, receipt);
      purchase.receipts.push(receipt);
    }
    receipt.records += 1;
    let line = lines.get(row.receiptLineId);
    if (!line) {
      line = {
        receiptLineId: row.receiptLineId,
        base: row,
        current: null,
        history: [],
        latestHistoricalDecision: null,
      };
      lines.set(row.receiptLineId, line);
      purchase.lines.push(line);
      receipt.lines.push(line);
    }
    if (row.roundStatus !== 'superseded' && row.case?.status !== 'superseded' && !line.current)
      line.current = row;
    else {
      line.history.push(row);
      if (!line.latestHistoricalDecision && row.case?.inspection) {
        line.latestHistoricalDecision = row.case.inspection.releaseDecision;
      }
    }
  }
  for (const purchase of purchases.values()) {
    for (const line of purchase.lines) {
      const stage = line.current?.roundStatus;
      if (stage === 'uninspected' || stage === 'reinspection_required') purchase.pending += 1;
      if (stage === 'reviewing') purchase.reviewing += 1;
      if (stage === 'quality_rejected') purchase.blocked += 1;
    }
    for (const receipt of purchase.receipts) {
      receipt.lines.sort((a, b) => Number(Boolean(b.current)) - Number(Boolean(a.current)));
    }
  }
  return [...purchases.values()].sort(
    (a, b) => b.pending + b.reviewing + b.blocked - (a.pending + a.reviewing + a.blocked),
  );
});
const roundTagType = (value: ReceiptRoundStatus) =>
  value === 'quality_rejected' || value === 'reinspection_required'
    ? 'warning'
    : value === 'reviewing'
      ? 'primary'
      : 'info';
const lineAction = (item: ProcurementInboundInspectionItem | null) =>
  item?.roundStatus === 'uninspected' || item?.roundStatus === 'reinspection_required'
    ? '查看 / 核对待检'
    : item?.roundStatus === 'reviewing'
      ? '查看 / 填写结果'
      : '查看详情';
function togglePurchase(id: string) {
  const next = new Set(collapsedPurchases.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  collapsedPurchases.value = next;
}
function toggleHistory(id: string) {
  const next = new Set(expandedHistory.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  expandedHistory.value = next;
}
function expandPage() {
  collapsedPurchases.value = new Set(
    [...collapsedPurchases.value].filter(
      (id) => !groups.value.some((group) => group.purchaseOrderId === id),
    ),
  );
}
function collapsePage() {
  collapsedPurchases.value = new Set([
    ...collapsedPurchases.value,
    ...groups.value.map((group) => group.purchaseOrderId),
  ]);
}
async function searchAndExpand() {
  await search();
  expandPage();
}
async function resetAndExpand() {
  await reset();
  expandPage();
}
function revealLine(id: string) {
  const group = groups.value.find((purchase) =>
    purchase.lines.some((line) => line.receiptLineId === id),
  );
  if (group) {
    const next = new Set(collapsedPurchases.value);
    next.delete(group.purchaseOrderId);
    collapsedPurchases.value = next;
    highlightedLineId.value = id;
  }
}
onScopeDispose(
  useTabsStore().registerCloseGuard(
    'quality-inbound-inspections',
    async () => !detail.value?.visible || (await detail.value.close()),
  ),
);
const locator = useLatestReadRequest(() => {});
let navigating = false;
const navigate = async (
  id: string,
  context?: ProcurementInboundInspectionItem,
): Promise<boolean> => {
  if (navigating) return false;
  if (detail.value?.locked) {
    EMessage.warning('请先确认当前检验操作结果再切换');
    return false;
  }
  navigating = true;
  try {
    if (detail.value?.visible && !(await detail.value.close())) return false;
    revealLine(id);
    if (context && context.roundStatus === 'superseded') {
      const next = new Set(expandedHistory.value);
      next.add(id);
      expandedHistory.value = next;
    }
    await detail.value?.open(id, context);
    return true;
  } finally {
    navigating = false;
  }
};
let consumed = '',
  accepted: Record<string, string> = {};
const locate = async (): Promise<void> => {
  if (route.name !== 'quality-inbound-inspections') return;
  await nextTick();
  const lineId = typeof route.query.receiptLineId === 'string' ? route.query.receiptLineId : '',
    caseId = typeof route.query.caseId === 'string' ? route.query.caseId : '';
  const token = JSON.stringify([lineId, caseId]);
  if (token === consumed || (!lineId && !caseId)) return;
  consumed = token;
  const current = locator.begin(
    () =>
      route.name === 'quality-inbound-inspections' &&
      JSON.stringify([
        typeof route.query.receiptLineId === 'string' ? route.query.receiptLineId : '',
        typeof route.query.caseId === 'string' ? route.query.caseId : '',
      ]) === token,
  );
  let succeeded = false;
  try {
    if (caseId) {
      const task = await procurementApi.getInspection(caseId, current.signal);
      if (!current.isCurrent()) return;
      succeeded = await navigate(task.receiptLineId, task);
    } else succeeded = await navigate(lineId);
  } catch (error) {
    if (current.isCurrent()) EMessage.error(error, '检验记录定位失败');
  }
  if (!current.isCurrent()) return;
  if (succeeded)
    accepted = { ...(lineId ? { receiptLineId: lineId } : {}), ...(caseId ? { caseId } : {}) };
  else {
    const query = { ...route.query };
    delete query.receiptLineId;
    delete query.caseId;
    consumed = JSON.stringify([accepted.receiptLineId ?? '', accepted.caseId ?? '']);
    await router.replace({ query: { ...query, ...accepted } });
  }
};
watch(
  () => [route.name, route.query.receiptLineId, route.query.caseId],
  () => {
    void locate();
  },
  { immediate: true },
);
onActivated(() => {
  void locate();
});
</script>
<style scoped>
.query-panel {
  padding: 20px 20px 4px;
  margin-bottom: 16px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.table-panel {
  overflow: hidden;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.help,
.page-scope,
.document-meta,
.muted {
  color: #6b7280;
  font-size: 13px;
}
.page-scope {
  padding: 0 20px 12px;
}
.document-block {
  margin: 0 16px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.document-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  padding: 12px 16px;
  background: #f8fafc;
}
.fold-button,
.history-toggle {
  border: 0;
  background: none;
  color: #306188;
  cursor: pointer;
  font: inherit;
  padding: 0;
}
.fold-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #1f2937;
}
.fold-icon {
  font-size: 11px;
  color: #306188;
}
.document-counts {
  font-size: 13px;
  color: #283a50;
}
.receipt-group + .receipt-group {
  border-top: 1px solid #e5e7eb;
}
.receipt-heading {
  padding: 9px 16px;
  background: #fbfcfe;
  color: #283a50;
  font-weight: 600;
}
.receipt-heading span {
  margin-left: 12px;
  color: #6b7280;
  font-size: 12px;
  font-weight: 400;
}
.document-body {
  overflow-x: auto;
}
.line-grid {
  display: grid;
  grid-template-columns:
    minmax(190px, 2fr) minmax(120px, 1.2fr) minmax(105px, 1fr) minmax(140px, 1.3fr)
    minmax(150px, 1.4fr) minmax(130px, 1fr);
  align-items: center;
  gap: 12px;
  min-width: 850px;
  padding: 10px 16px;
  font-size: 13px;
}
.column-heading {
  color: #6b7280;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  font-size: 12px;
}
.line-item + .line-item {
  border-top: 1px solid #eef0f2;
}
.line-item.highlighted {
  box-shadow: inset 3px 0 #306188;
}
.identity {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.identity span,
.round-reference,
.basis-label {
  color: #6b7280;
  font-size: 12px;
}
.round-reference {
  display: block;
  margin-bottom: 3px;
}
.basis-label {
  display: block;
}
.history-area {
  padding: 0 16px 10px;
}
.history-toggle {
  font-size: 12px;
}
.history-list {
  margin-top: 8px;
  padding: 4px 12px;
  border-left: 2px solid #e5e7eb;
  background: #fbfcfe;
}
.history-row {
  display: grid;
  grid-template-columns:
    minmax(170px, 1.5fr) minmax(80px, 0.7fr) minmax(130px, 1fr) minmax(150px, 1fr)
    100px;
  gap: 12px;
  align-items: center;
  min-width: 680px;
  min-height: 34px;
  color: #6b7280;
  font-size: 12px;
}
.history-row + .history-row {
  border-top: 1px solid #e5e7eb;
}
</style>
