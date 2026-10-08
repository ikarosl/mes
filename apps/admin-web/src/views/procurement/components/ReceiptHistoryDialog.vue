<template>
  <el-dialog
    v-model="visible"
    title="到货明细历史"
    width="min(1680px, calc(100% - 32px))"
    workbench
    :before-close="beforeClose"
  >
    <el-alert
      v-if="readError"
      type="error"
      title="本次历史读取失败，请重试；当前显示仅供参考。"
      :closable="false"
    />
    <div
      v-if="sourceLine"
      class="history-context"
    >
      <span
        ><strong>{{ sourceLine.receiptNo }}</strong> · 第 {{ sourceLine.lineNo }} 行</span
      >
      <span>{{ sourceLine.itemName }}（{{ sourceLine.itemCode }}）</span>
      <span>物料版本：{{ sourceLine.materialVariantCode }}</span>
      <span class="history-id">到货明细 ID：{{ sourceLine.id }}</span>
    </div>
    <el-tabs
      v-model="tab"
      @tab-change="changeTab"
    >
      <el-tab-pane
        label="处理轮次"
        name="rounds"
      />
      <el-tab-pane
        label="实收修订"
        name="revisions"
      />
      <el-tab-pane
        label="检验与复核"
        name="cases"
      />
      <el-tab-pane
        label="正式清单"
        name="acceptances"
      />
      <el-tab-pane
        label="供应商退回"
        name="returns"
      />
      <el-tab-pane
        label="实际入库"
        name="inbounds"
      />
      <el-tab-pane
        label="处置分配"
        name="allocations"
      />
    </el-tabs>

    <section
      v-if="tab === 'acceptances'"
      v-loading="loading"
      class="acceptance-history"
    >
      <el-empty
        v-if="!loading && !acceptanceRows.length"
        description="暂无记录"
      />
      <article
        v-for="row in acceptanceRows"
        :key="row.id"
        class="acceptance-card"
      >
        <div class="acceptance-heading">
          <strong
            >正式清单 ID：<span class="history-id">{{ row.id }}</span></strong
          >
          <span class="acceptance-quantity"
            >库管核实量：<strong>{{ displayValue(row.confirmedScopeQuantity) }}</strong></span
          >
          <span>确认时间：{{ formatDateTimeForDisplay(row.createdAt) }}</span>
        </div>
        <div class="acceptance-fields">
          <div class="history-field">
            <span class="history-label">引用检验记录 ID</span>
            <span class="history-value history-id">{{ displayValue(row.inspectionId) }}</span>
          </div>
          <div class="history-field">
            <span class="history-label">处理轮 ID</span>
            <span class="history-value history-id">{{ displayValue(row.roundId) }}</span>
          </div>
          <div class="history-field">
            <span class="history-label">确认前实收修订 ID</span>
            <span class="history-value history-id">{{
              displayValue(row.beforeReceiptRevisionId)
            }}</span>
          </div>
          <div class="history-field">
            <span class="history-label">确认后实收修订 ID</span>
            <span class="history-value history-id">{{
              displayValue(row.afterReceiptRevisionId)
            }}</span>
          </div>
          <div class="history-field">
            <span class="history-label">前一清单 ID</span>
            <span class="history-value history-id">{{
              displayValue(row.previousAcceptanceId)
            }}</span>
          </div>
          <div
            class="history-field history-field--wide"
            :class="{ 'history-field--exception': row.overrideReason?.trim() }"
          >
            <span class="history-label">异常 / 超建议依据</span>
            <span class="history-value">{{ displayValue(row.overrideReason) }}</span>
          </div>
          <div class="history-field history-field--wide">
            <span class="history-label">确认 / 更正说明</span>
            <span class="history-value">{{ displayValue(row.remark) }}</span>
          </div>
          <div class="history-field">
            <span class="history-label">确认人</span>
            <span class="history-value">{{ displayValue(row.createdBy) }}</span>
          </div>
        </div>
        <div class="allocation-heading">正式分配明细（{{ row.details.length }}）</div>
        <div
          v-if="!row.details.length"
          class="allocation-empty"
        >
          —
        </div>
        <div
          v-for="detail in row.details"
          :key="detail.id"
          class="acceptance-allocation"
        >
          <div class="history-field">
            <span class="history-label">分配明细 ID</span>
            <span class="history-value history-id">{{ displayValue(detail.id) }}</span>
          </div>
          <div class="history-field">
            <span class="history-label">采购单</span>
            <span class="history-value">{{ displayValue(detail.purchaseNo) }}</span>
          </div>
          <div class="history-field">
            <span class="history-label">授权去向</span>
            <span class="history-value">
              <el-tag
                size="small"
                v-bind="receiptAllocationAuthorizationTag(detail.disposition)"
                >{{ RECEIPT_ALLOCATION_AUTHORIZATION_LABELS[detail.disposition] }}</el-tag
              >
            </span>
          </div>
          <div class="history-field">
            <span class="history-label">数量</span>
            <strong class="history-value history-quantity">{{
              displayValue(detail.quantity)
            }}</strong>
          </div>
          <div class="history-field">
            <span class="history-label">退回原因</span>
            <span
              class="history-value"
              :class="{ 'history-value--warning': detail.returnReason }"
              >{{
                detail.returnReason ? SUPPLIER_RETURN_REASON_LABELS[detail.returnReason] : '—'
              }}</span
            >
          </div>
        </div>
      </article>
    </section>
    <el-table
      v-else
      v-loading="loading"
      :data="rows"
      :row-key="tab === 'cases' ? 'id' : undefined"
      :expand-row-keys="tab === 'cases' ? expandedCaseKeys : undefined"
      class="business-expandable-table history-table"
      empty-text="暂无记录"
      @expand-change="onCaseExpandChange"
    >
      <template v-if="tab === 'rounds'">
        <el-table-column
          prop="roundNo"
          label="轮次"
          width="78"
        />
        <el-table-column
          label="发起原因"
          width="130"
        >
          <template #default="{ row }">{{
            RECEIPT_ROUND_TRIGGER_LABELS[row.triggerType as ReceiptRoundItem['triggerType']]
          }}</template>
        </el-table-column>
        <el-table-column
          label="阶段"
          width="145"
        >
          <template #default="{ row }">
            <el-tag
              size="small"
              :type="receiptRoundTagType(row.status)"
              :effect="receiptRoundTagEffect(row.status)"
              >{{ RECEIPT_ROUND_STATUS_LABELS[row.status as ReceiptRoundItem['status']] }}</el-tag
            >
          </template>
        </el-table-column>
        <el-table-column
          prop="startingQuantity"
          label="开始时未处置量"
          width="145"
        />
        <el-table-column
          label="关联 ID"
          min-width="330"
        >
          <template #default="{ row }">
            <div class="id-stack">
              <div class="id-pair">
                <span>处理轮 ID</span><span class="history-id">{{ displayValue(row.id) }}</span>
              </div>
              <div class="id-pair">
                <span>前一处理轮 ID</span
                ><span class="history-id">{{ displayValue(row.previousRoundId) }}</span>
              </div>
              <div class="id-pair">
                <span>引用检验记录 ID</span
                ><span class="history-id">{{ displayValue(row.inspectionId) }}</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="原因"
          min-width="250"
        >
          <template #default="{ row }">{{ displayValue(row.reason) }}</template>
        </el-table-column>
        <el-table-column
          label="发起时间"
          width="180"
        >
          <template #default="{ row }">{{ formatDateTimeForDisplay(row.createdAt) }}</template>
        </el-table-column>
      </template>
      <template v-else-if="tab === 'revisions'">
        <el-table-column
          prop="revisionNo"
          label="修订"
          width="78"
        />
        <el-table-column
          label="实收量"
          width="110"
        >
          <template #default="{ row }">{{ Number(row.receivedQuantity) }}</template>
        </el-table-column>
        <el-table-column
          label="修订 ID"
          min-width="260"
        >
          <template #default="{ row }">
            <div class="id-stack">
              <div class="id-pair">
                <span>实收修订 ID</span><span class="history-id">{{ displayValue(row.id) }}</span>
              </div>
              <div class="id-pair">
                <span>前一修订 ID</span
                ><span class="history-id">{{ displayValue(row.previousRevisionId) }}</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="更正依据"
          min-width="300"
        >
          <template #default="{ row }">{{ displayValue(row.reason) }}</template>
        </el-table-column>
        <el-table-column
          label="记录时间"
          width="185"
        >
          <template #default="{ row }">{{ formatDateTimeForDisplay(row.createdAt) }}</template>
        </el-table-column>
      </template>
      <template v-else-if="tab === 'cases'">
        <el-table-column
          type="expand"
          width="48"
        >
          <template #default="{ row }">
            <InboundInspectionRecord
              v-if="row.inspection"
              :inspection="row.inspection"
            />
            <el-empty
              v-else
              description="尚无检验结论"
            />
          </template>
        </el-table-column>
        <el-table-column
          label="关联 ID"
          min-width="260"
        >
          <template #default="{ row }">
            <div class="id-stack">
              <div class="id-pair">
                <span>处理轮 ID</span
                ><span class="history-id">{{ displayValue(row.roundId) }}</span>
              </div>
              <div class="id-pair">
                <span>检验办理 ID</span><span class="history-id">{{ displayValue(row.id) }}</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="发起类型"
          width="145"
        >
          <template #default="{ row }">{{
            QUALITY_INBOUND_CASE_TYPE_LABELS[row.caseType as QualityInboundCaseType]
          }}</template>
        </el-table-column>
        <el-table-column
          label="状态"
          width="160"
        >
          <template #default="{ row }">{{
            QUALITY_INBOUND_CASE_STATUS_LABELS[row.status as QualityInboundCaseStatus]
          }}</template>
        </el-table-column>
        <el-table-column
          label="原申报量"
          width="110"
        >
          <template #default="{ row }">{{ Number(row.coveredQuantity) }}</template>
        </el-table-column>
        <el-table-column
          label="发起原因"
          min-width="280"
        >
          <template #default="{ row }">{{ displayValue(row.reason) }}</template>
        </el-table-column>
        <el-table-column
          label="发起时间"
          width="185"
        >
          <template #default="{ row }">{{ formatDateTimeForDisplay(row.createdAt) }}</template>
        </el-table-column>
      </template>
      <template v-else-if="tab === 'returns'">
        <el-table-column
          prop="returnNo"
          label="退回记录"
          min-width="165"
        />
        <el-table-column
          label="原因"
          width="135"
        >
          <template #default="{ row }">{{
            SUPPLIER_RETURN_REASON_LABELS[row.reasonType as SupplierReturnItem['reasonType']]
          }}</template>
        </el-table-column>
        <el-table-column
          label="已退量"
          width="100"
        >
          <template #default="{ row }">{{ Number(row.returnedQuantity) }}</template>
        </el-table-column>
        <el-table-column
          label="交接凭据"
          min-width="250"
        >
          <template #default="{ row }">{{ displayValue(row.handoverEvidence) }}</template>
        </el-table-column>
        <el-table-column
          label="关联 ID"
          min-width="270"
        >
          <template #default="{ row }">
            <div class="id-stack">
              <div class="id-pair">
                <span>退回记录 ID</span><span class="history-id">{{ displayValue(row.id) }}</span>
              </div>
              <div class="id-pair">
                <span>分配明细 ID</span
                ><span class="history-id">{{ displayValue(row.allocationId) }}</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="交接时间"
          width="185"
        >
          <template #default="{ row }">{{ formatDateTimeForDisplay(row.returnedAt) }}</template>
        </el-table-column>
        <el-table-column
          v-if="sourceLine"
          label="来源采购单"
          min-width="255"
          fixed="right"
        >
          <template #default>
            <div class="id-stack">
              <el-button
                v-if="auth.can(PERMISSIONS.procurement.orders.view)"
                link
                type="primary"
                class="source-purchase-link"
                @click="goSourcePurchase"
                >{{ sourceLine.purchaseNo }} · 采购第
                {{ sourceLine.purchaseOrderLineNo }} 行</el-button
              >
              <span v-else>
                {{ sourceLine.purchaseNo }} · 采购第 {{ sourceLine.purchaseOrderLineNo }} 行
              </span>
              <div class="id-pair">
                <span>采购行 ID：</span>
                <span class="history-id">{{ sourceLine.purchaseOrderLineId }}</span>
              </div>
            </div>
          </template>
        </el-table-column>
      </template>
      <template v-else-if="tab === 'inbounds'">
        <el-table-column
          label="入库单"
          min-width="180"
        >
          <template #default="{ row }">
            <el-button
              v-if="auth.can(PERMISSIONS.warehouse.inbound.view)"
              link
              type="primary"
              @click="goInbound(row.inboundId)"
              >{{ row.inboundNo }}</el-button
            >
            <span v-else>{{ row.inboundNo }}</span>
          </template>
        </el-table-column>
        <el-table-column
          label="入库量"
          width="100"
        >
          <template #default="{ row }">{{ Number(row.quantity) }}</template>
        </el-table-column>
        <el-table-column
          label="目标库存批次"
          min-width="170"
        >
          <template #default="{ row }">{{ displayValue(row.batchCode) }}</template>
        </el-table-column>
        <el-table-column
          label="执行 ID"
          min-width="270"
        >
          <template #default="{ row }">
            <div class="id-stack">
              <div class="id-pair">
                <span>入库单 ID</span
                ><span class="history-id">{{ displayValue(row.inboundId) }}</span>
              </div>
              <div class="id-pair">
                <span>库存事实 ID</span
                ><span class="history-id">{{ displayValue(row.transactionId) }}</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="来源 ID"
          min-width="310"
        >
          <template #default="{ row }">
            <div class="id-stack">
              <div class="id-pair">
                <span>正式分配明细 ID</span
                ><span class="history-id">{{ displayValue(row.allocationId) }}</span>
              </div>
              <div class="id-pair">
                <span>引用检验记录 ID</span
                ><span class="history-id">{{ displayValue(row.inspectionId) }}</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="确认时间"
          width="185"
        >
          <template #default="{ row }">{{ formatDateTimeForDisplay(row.confirmedAt) }}</template>
        </el-table-column>
      </template>
      <template v-else>
        <el-table-column
          label="效力"
          width="110"
        >
          <template #default="{ row }">
            <el-tag
              size="small"
              :type="row.isCurrent ? 'primary' : 'info'"
              effect="plain"
              >{{ row.isCurrent ? '当前轮次' : '历史轮次' }}</el-tag
            >
          </template>
        </el-table-column>
        <el-table-column
          label="数量与执行"
          min-width="310"
        >
          <template #default="{ row }">
            <div class="quantity-grid">
              <span
                >数量 <strong>{{ Number(row.quantity) }}</strong></span
              >
              <span
                >已入库 <strong>{{ displayValue(row.inboundQuantity) }}</strong></span
              >
              <span
                >已退回 <strong>{{ displayValue(row.returnedQuantity) }}</strong></span
              >
              <span
                >当前分配余量 <strong>{{ row.isCurrent ? row.remainingQuantity : 0 }}</strong></span
              >
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="关联 ID"
          min-width="290"
        >
          <template #default="{ row }">
            <div class="id-stack">
              <div class="id-pair">
                <span>分配明细 ID</span><span class="history-id">{{ displayValue(row.id) }}</span>
              </div>
              <div class="id-pair">
                <span>所属处理轮 ID</span
                ><span class="history-id">{{ displayValue(row.roundId) }}</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="授权去向"
          width="155"
        >
          <template #default="{ row }">
            <el-tag
              size="small"
              v-bind="receiptAllocationAuthorizationTag(row.disposition)"
              >{{
                RECEIPT_ALLOCATION_AUTHORIZATION_LABELS[
                  row.disposition as ReceiptAllocationDisposition
                ]
              }}</el-tag
            >
          </template>
        </el-table-column>
        <el-table-column
          label="处置说明"
          min-width="250"
        >
          <template #default="{ row }">{{ displayValue(row.remark) }}</template>
        </el-table-column>
        <el-table-column
          label="形成时间"
          width="185"
        >
          <template #default="{ row }">{{ formatDateTimeForDisplay(row.createdAt) }}</template>
        </el-table-column>
      </template>
    </el-table>
    <template #footer>
      <div class="history-footer">
        <PaginationFooter
          class="history-pagination"
          :total="total"
          :current-page="page"
          :page-size="pageSize"
          @page-change="changePage"
          @update:page-size="changePageSize"
        />
        <div class="history-footer-actions">
          <el-button @click="load">刷新</el-button>
          <el-button @click="close">关闭</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onActivated, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type {
  ReceiptRevisionItem,
  ReceiptAllocationItem,
  ReceiptAllocationDisposition,
  SupplierReturnItem,
  ReceiptInboundHistoryItem,
  QualityInboundCaseItem,
  QualityInboundCaseType,
  QualityInboundCaseStatus,
  ProcurementReceiptLine,
  ReceiptAcceptanceItem,
  ReceiptRoundItem,
} from '@company/contracts';
import {
  PERMISSIONS,
  QUALITY_INBOUND_CASE_TYPE_LABELS,
  QUALITY_INBOUND_CASE_STATUS_LABELS,
  RECEIPT_ALLOCATION_AUTHORIZATION_LABELS,
  SUPPLIER_RETURN_REASON_LABELS,
  RECEIPT_ROUND_STATUS_LABELS,
  RECEIPT_ROUND_TRIGGER_LABELS,
} from '@company/constants';
import { procurementApi } from '../../../api/procurement';
import { useAuthStore } from '../../../stores/auth';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { EMessage } from '../../../utils/message';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import InboundInspectionRecord from './InboundInspectionRecord.vue';
import {
  receiptAllocationAuthorizationTag,
  receiptRoundTagType,
  receiptRoundTagEffect,
} from '../receipt-round-presentation';

type HistoryTab =
  'rounds' | 'revisions' | 'cases' | 'returns' | 'inbounds' | 'allocations' | 'acceptances';
const visible = ref(false),
  lineId = ref(''),
  tab = ref<HistoryTab>('revisions'),
  loading = ref(false),
  readError = ref(false),
  total = ref(0),
  page = ref(1),
  pageSize = ref(10);
const rows = ref<
  Array<
    | ReceiptRoundItem
    | ReceiptAcceptanceItem
    | ReceiptRevisionItem
    | ReceiptAllocationItem
    | SupplierReturnItem
    | ReceiptInboundHistoryItem
    | QualityInboundCaseItem
  >
>([]);
const acceptanceRows = computed(() => rows.value as ReceiptAcceptanceItem[]);
const expandedCaseKeys = ref<string[]>([]);
const displayValue = (value: string | number | null | undefined): string =>
  value === null || value === undefined || String(value).trim() === '' ? '—' : String(value);
const onCaseExpandChange = (
  _row: QualityInboundCaseItem,
  expandedRows: QualityInboundCaseItem[],
): void => {
  expandedCaseKeys.value = expandedRows.map((row) => row.id);
};
const auth = useAuthStore(),
  router = useRouter();
const sourceLine = ref<ProcurementReceiptLine | null>(null);
const read = useLatestReadRequest(() => {
  loading.value = false;
});
const load = async (): Promise<void> => {
  if (!visible.value || !read.isActive()) return;
  const target = lineId.value,
    kind = tab.value;
  const current = read.begin(() => visible.value && lineId.value === target && tab.value === kind);
  loading.value = true;
  try {
    const loaders = {
      rounds: procurementApi.receiptRounds,
      acceptances: procurementApi.receiptAcceptances,
      revisions: procurementApi.receiptRevisions,
      cases: procurementApi.receiptCases,
      returns: procurementApi.receiptReturns,
      inbounds: procurementApi.receiptInbounds,
      allocations: procurementApi.receiptAllocations,
    };
    const result = await loaders[kind](
      target,
      { page: page.value, pageSize: pageSize.value },
      current.signal,
    );
    if (current.isCurrent()) {
      rows.value = result.items;
      total.value = result.total;
      if (kind === 'cases') {
        const firstCase = (result.items as QualityInboundCaseItem[])[0];
        expandedCaseKeys.value = firstCase ? [firstCase.id] : [];
      } else {
        expandedCaseKeys.value = [];
      }
      readError.value = false;
    }
  } catch (error) {
    if (current.isCurrent()) {
      readError.value = true;
      EMessage.error(error, '到货历史加载失败');
    }
  } finally {
    if (current.isCurrent()) loading.value = false;
  }
};
const open = async (
  id: string,
  initial: HistoryTab = 'revisions',
  source?: ProcurementReceiptLine,
): Promise<void> => {
  if (visible.value && !(await close())) return;
  lineId.value = id;
  sourceLine.value = source ?? null;
  tab.value = initial;
  page.value = 1;
  rows.value = [];
  expandedCaseKeys.value = [];
  total.value = 0;
  readError.value = false;
  visible.value = true;
  await load();
};
const changeTab = async (): Promise<void> => {
  rows.value = [];
  expandedCaseKeys.value = [];
  total.value = 0;
  readError.value = false;
  page.value = 1;
  await load();
};
const changePage = async (value: number): Promise<void> => {
  page.value = value;
  rows.value = [];
  expandedCaseKeys.value = [];
  readError.value = false;
  await load();
};
const changePageSize = async (value: number): Promise<void> => {
  pageSize.value = value;
  await changeTab();
};
const close = async (): Promise<boolean> => {
  visible.value = false;
  return true;
};
const beforeClose = (): void => {
  void close();
};
const goSourcePurchase = async (): Promise<void> => {
  const line = sourceLine.value;
  if (!line) return;
  if (await close())
    await router.push({
      name: 'procurement-orders',
      query: {
        purchaseOrderId: line.purchaseOrderId,
        purchaseOrderLineId: line.purchaseOrderLineId,
      },
    });
};
const goInbound = async (id: string): Promise<void> => {
  if (await close())
    await router.push({
      name: 'warehouse-inbound',
      query: { inboundId: id, sourceType: 'purchased' },
    });
};
watch(visible, (value) => {
  if (!value) read.invalidate();
});
onActivated(() => {
  if (visible.value) void load();
});

defineExpose({ open, close, visible, locked: computed(() => false) });
</script>

<style scoped>
.history-context {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 16px;
  padding: 0 0 8px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.history-context strong,
.acceptance-heading strong,
.quantity-grid strong {
  color: var(--el-text-color-primary);
}

.history-id {
  overflow-wrap: anywhere;
  user-select: text;
  font-variant-numeric: tabular-nums;
}

.source-purchase-link {
  justify-content: flex-start;
  height: auto;
  padding: 0;
  white-space: normal;
  text-align: left;
}

.history-table {
  width: 100%;
  font-size: 13px;
  --el-table-header-bg-color: var(--el-fill-color-light);
}

.history-table :deep(.el-table__cell) {
  padding: 6px 0;
}

.history-table :deep(.cell) {
  overflow: visible;
  overflow-wrap: anywhere;
  white-space: normal;
}

.history-table :deep(.el-table__expanded-cell) {
  padding: 12px;
}

.history-table :deep(.el-descriptions__content) {
  overflow-wrap: anywhere;
}

.id-stack {
  display: grid;
  gap: 2px;
  line-height: 1.4;
}

.id-pair {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.id-pair > span:first-child {
  flex: none;
  color: var(--el-text-color-secondary);
}

.id-pair > .history-id {
  min-width: 0;
}

.quantity-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px 8px;
  line-height: 1.4;
}

.quantity-grid strong {
  margin-left: 4px;
}

.acceptance-history {
  display: grid;
  gap: 8px;
  min-height: 72px;
}

.acceptance-card {
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-bg-color);
  font-size: 13px;
}

.acceptance-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 20px;
  margin: -8px -10px 6px;
  padding: 5px 10px;
  border-bottom: 1px solid var(--el-color-primary-light-8);
  border-radius: 5px 5px 0 0;
  background: var(--el-color-primary-light-9);
  line-height: 1.4;
}

.acceptance-heading > strong {
  margin-right: auto;
  color: var(--el-color-primary-dark-2);
  font-size: 14px;
}

.acceptance-quantity strong {
  margin-left: 3px;
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}

.acceptance-fields,
.acceptance-allocation {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 4px 12px;
}

.acceptance-fields {
  margin-top: 0;
}

.acceptance-fields > .history-field {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: baseline;
  gap: 4px 8px;
  line-height: 1.5;
}

.history-field {
  min-width: 0;
  line-height: 1.35;
}

.history-field--wide {
  grid-column: span 2;
}

.history-field--exception {
  padding: 2px 6px;
  border-left: 2px solid var(--el-color-warning);
  background: var(--el-color-warning-light-9);
}

.history-label,
.history-value {
  display: block;
  overflow-wrap: anywhere;
}

.history-label {
  color: var(--el-text-color-regular);
}

.history-value {
  color: var(--el-text-color-primary);
}

.history-quantity {
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.history-value--warning {
  color: var(--el-color-warning-dark-2);
  font-weight: 500;
}

.allocation-heading {
  margin-top: 6px;
  padding: 3px 6px;
  border-radius: 3px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
  font-weight: 600;
  line-height: 1.35;
}

.acceptance-allocation {
  padding-top: 4px;
}

.acceptance-allocation + .acceptance-allocation {
  margin-top: 4px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.allocation-empty {
  color: var(--el-text-color-secondary);
}

.history-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
}

.history-footer .history-pagination {
  height: auto;
  padding: 0;
}

.history-footer-actions {
  margin-left: auto;
}

@media (max-width: 1250px) {
  .acceptance-fields,
  .acceptance-allocation {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
