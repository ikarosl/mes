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
        <el-form-item label="当前阶段">
          <el-select
            v-model="stage"
            clearable
            placeholder="全部"
            style="width: 170px"
          >
            <el-option
              v-for="value in inspectionStages"
              :key="value"
              :value="value"
              :label="RECEIPT_LINE_STAGE_LABELS[value]"
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
    <div class="table-panel">
      <ReceiptWorklist
        ref="worklist"
        :rows="rows"
        :row-id="(row) => row.receiptLineId"
        :loading="loading"
        :highlighted-line-id="highlightedLineId"
        empty-text="当前筛选下暂无来料检验明细"
        @refresh="load"
      >
        <template #hint><strong>放行后仍需库管定稿。</strong></template>
        <template #purchase-summary="{ lines }"
          ><span class="document-counts">{{ inspectionSummary(lines) }}</span></template
        >
        <template #column-widths
          ><col style="width: 110px" />
          <col style="width: 175px" />
          <col style="width: 200px" />
          <col style="width: 145px"
        /></template>
        <template #column-headings
          ><th scope="col">剩余实物</th>
          <th scope="col">当前阶段</th>
          <th scope="col">检验记录 / 结论</th>
          <th scope="col">下一步</th></template
        >
        <template #row="{ row: line }">
          <td>{{ Number(line.quantities.unprocessedQuantity) }} {{ line.unit }}</td>
          <td>
            <el-tag
              size="small"
              :type="receiptLineStageType(line)"
              :effect="receiptLineStageEffect(line)"
              >{{ receiptLineStageLabel(line) }}</el-tag
            >
            <span class="round-reference">当前处理第 {{ line.currentRound.roundNo }} 轮</span>
          </td>
          <td>
            <div class="inspection-result">
              <template v-if="line.currentCase?.inspection">
                <el-button
                  class="inspection-id-link"
                  link
                  type="primary"
                  @click="openLine(line.receiptLineId, line.currentCase.id)"
                  >检验记录 ID {{ line.currentCase.inspection.id }}</el-button
                >
                <span>{{
                  QUALITY_RELEASE_DECISION_LABELS[line.currentCase.inspection.releaseDecision]
                }}</span>
                <span class="reference-note"
                  >{{ line.isInherited ? '当前采用 · 沿用此前检验' : '当前采用'
                  }}<template v-if="line.isInherited && line.currentCaseRoundNo !== null">
                    · 来源第 {{ line.currentCaseRoundNo }} 轮</template
                  ></span
                >
              </template>
              <span
                v-else
                class="muted"
                >{{
                  line.currentCase?.status === 'reviewing'
                    ? '本轮正在检查，尚无检验记录'
                    : '本轮尚无检验记录'
                }}</span
              >
            </div>
          </td>
          <td>
            <el-button
              link
              type="primary"
              @click="openLine(line.receiptLineId)"
              >{{ lineAction(line) }}</el-button
            >
          </td>
        </template>
      </ReceiptWorklist>
      <PaginationFooter
        :total="total"
        :current-page="page"
        :page-size="pageSize"
        total-suffix="条到货明细"
        @page-change="changePage"
        @update:page-size="changePageSize"
      />
    </div>
    <InboundInspectionDetailDialog
      ref="detail"
      @changed="load"
      @record-focus-cleared="clearRecordLocation"
    />
  </section>
</template>
<script setup lang="ts">
import { nextTick, onActivated, onScopeDispose, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ProcurementInboundInspectionLineItem } from '@company/contracts';
import {
  QUALITY_RELEASE_DECISION_LABELS,
  RECEIPT_LINE_STAGE_LABELS,
  RECEIPT_LINE_STAGES,
} from '@company/constants';
import PaginationFooter from '../../components/PaginationFooter.vue';
import ReceiptWorklist from '../procurement/components/ReceiptWorklist.vue';
import type { ReceiptWorklistHandle } from '../procurement/receipt-worklist';
import { EMessage } from '../../utils/message';
import { useTabsStore } from '../../stores/tabs';
import { useInboundInspectionsList } from '../procurement/composables/useInboundInspectionsList';
import {
  receiptLineStageLabel,
  receiptLineStageType,
  receiptLineStageEffect,
} from '../procurement/receipt-round-presentation';
import InboundInspectionDetailDialog from '../procurement/components/InboundInspectionDetailDialog.vue';

defineOptions({ name: 'InboundInspectionsPage' });
const route = useRoute(),
  router = useRouter();
const inspectionStages = RECEIPT_LINE_STAGES.filter((value) => value !== 'voided');
const {
  keyword,
  stage,
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
const worklist = ref<ReceiptWorklistHandle>();
const highlightedLineId = ref('');
function inspectionSummary(lines: ProcurementInboundInspectionLineItem[]): string {
  let pending = 0,
    reviewing = 0,
    blocked = 0;
  for (const row of lines) {
    if (row.stage === 'uninspected' || row.stage === 'reinspection_required') pending += 1;
    if (row.stage === 'reviewing') reviewing += 1;
    if (row.stage === 'quality_rejected') blocked += 1;
  }
  return `本页待检 / 待复检 ${pending} 条 · 检验中 ${reviewing} 条 · 质量阻断 ${blocked} 条`;
}
const lineAction = (item: ProcurementInboundInspectionLineItem): string => {
  if (item.stage === 'completed' || item.stage === 'manual_rejection') return '查看详情';
  if (item.stage === 'uninspected' || item.stage === 'reinspection_required')
    return '查看 / 核对待检';
  if (item.stage === 'reviewing') return '查看 / 填写结果';
  return '查看详情';
};
async function searchAndExpand() {
  await search();
  worklist.value?.expandPage();
}
async function resetAndExpand() {
  await reset();
  worklist.value?.expandPage();
}
function revealLine(id: string): void {
  if (!rows.value.some((line) => line.receiptLineId === id)) return;
  worklist.value?.revealLine(id);
  highlightedLineId.value = id;
}
onScopeDispose(
  useTabsStore().registerCloseGuard(
    'quality-inbound-inspections',
    async () => !detail.value?.visible || (await detail.value.close()),
  ),
);
let navigating = false;
let pendingLocate = false;
let consumed = '';
let accepted: Record<string, string> = {};
let routeRevision = 0;
async function navigate(id: string, caseId = '', matches = () => true): Promise<boolean> {
  if (navigating) return false;
  if (detail.value?.locked) {
    EMessage.warning('请先确认当前检验操作结果再切换');
    return false;
  }
  navigating = true;
  try {
    if (detail.value?.visible && !(await detail.value.close())) return false;
    if (!matches()) return false;
    revealLine(id);
    return (await detail.value?.open(id, caseId)) ?? false;
  } finally {
    navigating = false;
    if (pendingLocate) {
      pendingLocate = false;
      void locate();
    }
  }
}
async function openLine(id: string, caseId = '') {
  if (!(await navigate(id, caseId))) return;
  accepted = { receiptLineId: id, ...(caseId ? { caseId } : {}) };
  consumed = JSON.stringify([id, caseId]);
  const query = { ...route.query };
  query.receiptLineId = id;
  if (caseId) query.caseId = caseId;
  else delete query.caseId;
  await router.replace({ name: 'quality-inbound-inspections', query });
}
async function clearRecordLocation() {
  const id = detail.value?.openedLineId;
  if (!id) return;
  accepted = { receiptLineId: id };
  consumed = JSON.stringify([id, '']);
  const query = { ...route.query };
  query.receiptLineId = id;
  delete query.caseId;
  await router.replace({ name: 'quality-inbound-inspections', query });
}
async function locate(): Promise<void> {
  const revision = routeRevision;
  if (route.name !== 'quality-inbound-inspections') return;
  await nextTick();
  if (revision !== routeRevision || route.name !== 'quality-inbound-inspections') return;
  const lineId = typeof route.query.receiptLineId === 'string' ? route.query.receiptLineId : '';
  const caseId = typeof route.query.caseId === 'string' ? route.query.caseId : '';
  const token = JSON.stringify([lineId, caseId]);
  const sameDetail =
    detail.value?.visible &&
    (!lineId || detail.value.openedLineId === lineId) &&
    detail.value.openedCaseId === caseId;
  if ((!lineId && !caseId) || (token === consumed && (navigating || sameDetail))) return;
  if (navigating) {
    pendingLocate = true;
    return;
  }
  consumed = token;
  const succeeded = await navigate(
    lineId,
    caseId,
    () => revision === routeRevision && route.name === 'quality-inbound-inspections',
  );
  if (revision !== routeRevision || route.name !== 'quality-inbound-inspections') return;
  if (succeeded)
    accepted = { ...(lineId ? { receiptLineId: lineId } : {}), ...(caseId ? { caseId } : {}) };
  else {
    const query = { ...route.query };
    delete query.receiptLineId;
    delete query.caseId;
    consumed = JSON.stringify([accepted.receiptLineId ?? '', accepted.caseId ?? '']);
    await router.replace({ query: { ...query, ...accepted } });
  }
}
watch(
  () => [route.name, route.query.receiptLineId, route.query.caseId],
  () => {
    routeRevision += 1;
    void locate();
  },
  { immediate: true, flush: 'sync' },
);
onActivated(() => {
  void locate();
});
</script>
<style scoped>
.query-panel {
  padding: 20px 20px 4px;
  margin-bottom: 16px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}
.table-panel {
  overflow: hidden;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.document-counts {
  font-size: 13px;
  color: var(--el-text-color-primary);
}
.round-reference,
.reference-note {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.round-reference {
  display: block;
  margin-top: 5px;
}
.inspection-result {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
}
.inspection-id-link {
  height: auto;
  padding: 0;
  font-weight: 600;
  text-align: left;
  white-space: normal;
  overflow-wrap: anywhere;
}
</style>
