<template>
  <el-dialog
    v-model="visible"
    title="办理采购补单"
    :width="DialogWidth.workbench"
    workbench
    :before-close="beforeClose"
    :close-on-click-modal="false"
    :close-on-press-escape="!command.busy.value && !submittingCheck"
    :show-close="!command.busy.value && !submittingCheck"
  >
    <div
      v-loading="orderLoading"
      class="supplement-dialog"
    >
      <el-alert
        v-if="orderError || contextError"
        :title="
          orderError
            ? '原采购单读取失败，请刷新后办理；当前输入已保留。'
            : '原采购行已变化，请移除失效行并重新核对。'
        "
        type="error"
        :closable="false"
      />
      <el-alert
        v-if="command.status.value !== 'idle'"
        title="创建结果尚未确认，输入已锁定。请重试原操作或先核对采购单记录。"
        type="warning"
        :closable="false"
      />
      <template v-if="order">
        <el-descriptions
          :column="3"
          border
          size="small"
        >
          <el-descriptions-item :label="isExcessSource ? '当前承接补单' : '原采购单'">{{
            order.purchaseNo
          }}</el-descriptions-item>
          <el-descriptions-item label="所属工单">{{
            order.workOrderNo || '独立备料'
          }}</el-descriptions-item>
          <el-descriptions-item label="原单供应商">{{
            supplierSummary(order.suppliers)
          }}</el-descriptions-item>
        </el-descriptions>
        <InlineHint
          v-if="isExcessSource"
          class="flow-hint"
          :tone="originTarget ? 'info' : 'warning'"
        >
          <template v-if="originTarget">
            本单 {{ order.purchaseNo }} 承接原到货；继续办理补单请前往原采购单
            {{ originTarget.purchaseNo }}。
            <el-button
              link
              type="primary"
              :disabled="editingLocked"
              @click="
                emit('source-order', { orderId: originTarget.orderId, reason: requestedReason })
              "
              >前往原采购单办理补单</el-button
            >
          </template>
          <template v-else>
            本单
            {{ order.purchaseNo }} 的冻结原采购来源缺失或不一致，请核对各行来源后前往原采购单办理。
          </template>
        </InlineHint>
        <section
          v-if="!isExcessSource"
          class="supplement-section"
        >
          <h3>1. 选择补单类型</h3>
          <el-radio-group
            :key="reasonRevision"
            :model-value="reason"
            aria-label="补单类型"
            :disabled="editingLocked || choosingReason"
            @update:model-value="changeReason($event as PurchaseOrderSupplementReason)"
          >
            <el-radio-button
              v-for="value in PURCHASE_ORDER_SUPPLEMENT_REASONS"
              :key="value"
              :value="value"
              >{{ PURCHASE_ORDER_SUPPLEMENT_REASON_LABELS[value] }}</el-radio-button
            >
          </el-radio-group>
          <InlineHint
            v-if="reason"
            class="flow-hint"
          >
            <template v-if="reason === 'excess_purchase'">
              补单承接<strong>原到货</strong>，无需重复登记到货或质检；正式下单后由库管在原到货定稿中关联。
            </template>
            <template v-else>
              质量补发须登记<strong>新到货</strong>，重新质检、形成清单并办理入库；原货实际退回另行办理。
            </template>
          </InlineHint>
          <InlineHint
            v-else-if="pendingLineId"
            class="flow-hint"
          >
            已定位原采购第
            <strong>{{ eligibleLines.find((line) => line.id === pendingLineId)?.lineNo }}</strong>
            行；选择补单类型后会自动加入，仍可追加本单其他行。
          </InlineHint>
        </section>
        <section
          v-if="!isExcessSource && reason"
          class="supplement-section"
        >
          <h3>
            2. 选择原采购行
            <span class="section-meta"
              >已选 {{ drafts.length }} 行，同一原单可一次创建多行补单</span
            >
          </h3>
          <div class="line-tools">
            <el-input
              v-model="lineSearch"
              clearable
              :disabled="editingLocked"
              placeholder="检索行号、物料、版本或供应商"
              aria-label="检索原采购行"
              @update:model-value="linePage = 1"
            />
            <span>仅列出原单已下单、可引用的到货履约行</span>
          </div>
          <el-table
            :data="pagedLines"
            row-key="id"
            empty-text="暂无可选原采购行"
          >
            <el-table-column
              label="选择"
              width="72"
            >
              <template #default="{ row }">
                <el-checkbox
                  :model-value="Boolean(findDraft(row.id))"
                  :disabled="command.locked.value || submittingCheck"
                  :aria-label="`选择原采购第 ${row.lineNo} 行`"
                  @change="toggleLine(row, $event as boolean)"
                />
              </template>
            </el-table-column>
            <el-table-column
              prop="lineNo"
              label="行"
              width="65"
            />
            <el-table-column
              prop="supplierName"
              label="固定供应商"
              min-width="160"
            />
            <el-table-column
              label="物料 / 精确版本"
              min-width="290"
            >
              <template #default="{ row }"
                >{{ row.itemCode }} · {{ row.itemName }} · {{ row.materialVariantCode }}</template
              >
            </el-table-column>
            <el-table-column
              label="原计划量"
              width="130"
            >
              <template #default="{ row }">{{ row.plannedQuantity }} {{ row.unit }}</template>
            </el-table-column>
          </el-table>
          <PaginationFooter
            :class="{ 'pagination-locked': editingLocked }"
            :total="filteredLines.length"
            :current-page="linePage"
            :page-size="linePageSize"
            @page-change="linePage = $event"
            @update:page-size="changeLinePageSize"
          />
          <InlineHint class="flow-hint"
            >每行供应商、物料精确版本、工单和需求来源沿原采购行继承，创建补单时固定。</InlineHint
          >
        </section>
        <section
          v-if="!isExcessSource && reason && drafts.length"
          class="supplement-section"
        >
          <h3>3. 逐行选择具体依据并填写补购量</h3>
          <div
            v-for="draft in drafts"
            :key="draft.line.id"
            class="draft-line"
          >
            <div class="draft-heading">
              <strong
                >原第 {{ draft.line.lineNo }} 行 · {{ draft.line.itemCode }} ·
                {{ draft.line.itemName }} · {{ draft.line.materialVariantCode }}</strong
              >
              <span
                >供应商 {{ draft.line.supplierName }} · 原计划 {{ draft.line.plannedQuantity }}
                {{ draft.line.unit }}</span
              >
              <el-button
                link
                type="danger"
                :disabled="editingLocked"
                @click="removeLine(draft.line.id)"
                >移除此行</el-button
              >
            </div>
            <div class="basis-tools">
              <el-input
                v-model="draft.keyword"
                clearable
                maxlength="100"
                :placeholder="
                  reason === 'quality_replacement'
                    ? '检索到货单号、供应商批号或退回单号'
                    : '检索到货单号或供应商批号'
                "
                aria-label="检索补单依据"
                :disabled="editingLocked"
                @clear="searchBasis(draft)"
                @keyup.enter="searchBasis(draft)"
              />
              <el-button
                :disabled="editingLocked"
                :loading="draft.loading"
                @click="searchBasis(draft)"
                >查询依据</el-button
              >
            </div>
            <el-alert
              v-if="draft.error || draft.basisError"
              :title="
                draft.basisError
                  ? '所选依据已失效，请重新选择具体到货或分配。'
                  : '候选读取失败，输入已保留；请重试。'
              "
              type="error"
              :closable="false"
            />
            <el-table
              v-if="reason === 'excess_purchase'"
              v-loading="draft.loading"
              :data="draft.excessRows"
              row-key="id"
              empty-text="本页无匹配的实际到货"
              size="small"
            >
              <el-table-column
                label="到货单 / 行"
                min-width="180"
              >
                <template #default="{ row }">{{ row.receiptNo }} · 第 {{ row.lineNo }} 行</template>
              </el-table-column>
              <el-table-column
                label="实际到货"
                min-width="165"
              >
                <template #default="{ row }">{{
                  formatDateTimeForDisplay(row.receivedAt)
                }}</template>
              </el-table-column>
              <el-table-column
                prop="supplierBatchCode"
                label="供应商批号"
                min-width="130"
              />
              <el-table-column
                label="核实量 / 未处置"
                min-width="150"
              >
                <template #default="{ row }"
                  >{{ row.receivedQuantity }} / {{ row.unprocessedQuantity }}
                  {{ draft.line.unit }}</template
                >
              </el-table-column>
              <el-table-column
                label="操作"
                width="90"
                fixed="right"
              >
                <template #default="{ row }"
                  ><el-button
                    link
                    type="primary"
                    :disabled="draft.loading || draft.error || editingLocked"
                    @click="selectExcess(draft, row)"
                    >{{ draft.selectedExcess?.id === row.id ? '已选择' : '选择' }}</el-button
                  ></template
                >
              </el-table-column>
            </el-table>
            <el-table
              v-else
              v-loading="draft.loading"
              :data="draft.qualityRows"
              row-key="allocationId"
              empty-text="本页无有效待退或真实已退的质量分配"
              size="small"
            >
              <el-table-column
                label="到货单 / 行"
                min-width="180"
              >
                <template #default="{ row }"
                  >{{ row.receiptNo }} · 第 {{ row.receiptLineNo }} 行</template
                >
              </el-table-column>
              <el-table-column
                label="批号 / 到货来源 / 分配归属"
                min-width="205"
              >
                <template #default="{ row }">
                  <div>{{ row.supplierBatchCode || '未提供批号' }}</div>
                  <div>到货来源 {{ row.sourcePurchaseNo }}</div>
                  <div>分配归属 {{ row.allocationPurchaseNo || '无采购归属' }}</div>
                </template>
              </el-table-column>
              <el-table-column
                label="质量分配数量"
                min-width="190"
              >
                <template #default="{ row }">
                  <div>分配 {{ row.allocationQuantity }} {{ draft.line.unit }}</div>
                  <div>有效待退 {{ row.pendingReturnQuantity }} {{ draft.line.unit }}</div>
                  <div>实际已退 {{ row.returnedQuantity }} {{ draft.line.unit }}</div>
                </template>
              </el-table-column>
              <el-table-column
                label="退回与补发"
                min-width="230"
              >
                <template #default="{ row }">
                  <div>{{ row.returnNo ? `退回单 ${row.returnNo}` : '尚无实际退回单' }}</div>
                  <el-tag
                    size="small"
                    :type="row.isCurrent ? 'primary' : 'info'"
                    effect="plain"
                    >{{ row.isCurrent ? '当前有效分配' : '历史分配' }}</el-tag
                  >
                  <div v-if="row.linkedSupplements.length">关联补单 {{ linkedSummary(row) }}</div>
                  <el-button
                    v-if="row.linkedSupplements.length"
                    link
                    type="primary"
                    :disabled="editingLocked"
                    @click="showRelated(draft.line.id, row.allocationId)"
                    >查看关联补单号</el-button
                  >
                </template>
              </el-table-column>
              <el-table-column
                label="操作"
                width="90"
                fixed="right"
              >
                <template #default="{ row }"
                  ><el-button
                    link
                    type="primary"
                    :disabled="draft.loading || draft.error || editingLocked"
                    @click="selectQuality(draft, row)"
                    >{{
                      draft.selectedQuality?.allocationId === row.allocationId ? '已选择' : '选择'
                    }}</el-button
                  ></template
                >
              </el-table-column>
            </el-table>
            <PaginationFooter
              :class="{ 'pagination-locked': editingLocked }"
              :total="draft.total"
              :current-page="draft.page"
              :page-size="draft.pageSize"
              @page-change="changeBasisPage(draft, $event)"
              @update:page-size="changeBasisPageSize(draft, $event)"
            />
            <div
              v-if="reason === 'excess_purchase' && draft.selectedExcess"
              class="selected-basis"
            >
              已选 {{ draft.selectedExcess.receiptNo }} · 第 {{ draft.selectedExcess.lineNo }} 行 ·
              到货明细 ID {{ draft.selectedExcess.id }}
            </div>
            <div
              v-if="reason === 'quality_replacement' && draft.selectedQuality"
              class="selected-basis"
            >
              已选 {{ draft.selectedQuality.receiptNo }} · 第
              {{ draft.selectedQuality.receiptLineNo }} 行 · 分配 ID
              {{ draft.selectedQuality.allocationId }}
            </div>
            <el-form
              :disabled="editingLocked"
              label-width="120px"
              class="line-form"
            >
              <el-form-item
                :label="reason === 'excess_purchase' ? '承接采购量' : '约定补发量'"
                required
              >
                <el-input-number
                  v-model="draft.quantity"
                  :min="1"
                  :max="PURCHASE_ORDER_MAX_QUANTITY"
                  :precision="0"
                  controls-position="right"
                />
              </el-form-item>
              <el-form-item
                :label="reason === 'excess_purchase' ? '额外购买依据' : '供应商补发约定'"
                required
              >
                <el-input
                  v-model="draft.evidence"
                  type="textarea"
                  :rows="2"
                  maxlength="2000"
                  show-word-limit
                  :placeholder="
                    reason === 'excess_purchase'
                      ? '填写额外购买的具体依据'
                      : '填写供应商确认数量、沟通时间及可追溯凭据'
                  "
                />
              </el-form-item>
            </el-form>
          </div>
          <el-form
            label-width="120px"
            class="remark-form"
          >
            <el-form-item label="整单备注"
              ><el-input
                v-model="remark"
                :disabled="editingLocked"
                maxlength="2000"
            /></el-form-item>
          </el-form>
        </section>
      </template>
    </div>
    <template #footer>
      <el-button
        :disabled="editingLocked"
        @click="refreshOrder"
        >{{ isExcessSource ? '刷新本单' : '刷新原采购' }}</el-button
      >
      <el-button
        :disabled="command.busy.value || submittingCheck"
        @click="close"
        >关闭</el-button
      >
      <el-button
        v-if="command.status.value === 'pending'"
        type="primary"
        :loading="command.busy.value"
        @click="command.retry"
        >重试原操作</el-button
      >
      <el-button
        v-else-if="!isExcessSource"
        type="primary"
        :disabled="!canSave"
        :loading="command.busy.value || submittingCheck"
        @click="save"
        >创建 {{ drafts.length }} 行补单草稿</el-button
      >
    </template>
  </el-dialog>
  <RelatedSupplementsDialog
    ref="related"
    @navigate="emit('navigate', $event)"
  />
</template>

<script setup lang="ts">
import { computed, onScopeDispose, ref } from 'vue';
import type {
  PurchaseOrderLine,
  PurchaseOrderSupplementReason,
  PurchaseQualityReplacementCandidate,
} from '@company/contracts';
import {
  PURCHASE_ORDER_MAX_QUANTITY,
  PURCHASE_ORDER_SUPPLEMENT_REASONS,
  PURCHASE_ORDER_SUPPLEMENT_REASON_LABELS,
  PURCHASE_ORDER_STATUS_LABELS,
} from '@company/constants';
import { useTabsStore } from '../../../stores/tabs';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateTimeForDisplay } from '../../../utils/date';
import InlineHint from '../../../components/InlineHint.vue';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import { supplierSummary } from '../supplier-summary';
import { excessSupplementOrigin } from '../supplement-origin';
import RelatedSupplementsDialog from './RelatedSupplementsDialog.vue';
import {
  usePurchaseOrderSupplement,
  type SupplementDraftLine,
} from '../composables/usePurchaseOrderSupplement';

const emit = defineEmits<{
  saved: [string];
  navigate: [string];
  'source-order': [{ orderId: string; reason?: PurchaseOrderSupplementReason }];
}>();
const {
  visible,
  order,
  reason,
  drafts,
  remark,
  orderLoading,
  orderError,
  contextError,
  lineSearch,
  linePage,
  linePageSize,
  pendingLineId,
  requestedReason,
  eligibleLines,
  filteredLines,
  pagedLines,
  command,
  canSave,
  editingLocked,
  submittingCheck,
  open,
  close: closeSupplement,
  chooseReason,
  addLine,
  removeLine,
  findDraft,
  loadCandidates,
  refreshOrder,
  selectExcess,
  selectQuality,
  save,
} = usePurchaseOrderSupplement((id) => emit('saved', id));
const isExcessSource = computed(() => order.value?.supplementReason === 'excess_purchase');
const originTarget = computed(() => excessSupplementOrigin(order.value));
const related = ref<InstanceType<typeof RelatedSupplementsDialog>>();
const reasonRevision = ref(0);
const choosingReason = ref(false);
const changeReason = async (next: PurchaseOrderSupplementReason): Promise<void> => {
  if (choosingReason.value) return;
  choosingReason.value = true;
  try {
    await chooseReason(next);
  } finally {
    // Element Plus has already handled the click. Recreate its input from the confirmed model.
    reasonRevision.value += 1;
    choosingReason.value = false;
  }
};
const close = async (): Promise<boolean> => {
  if (!(await closeSupplement())) return false;
  if (related.value?.visible) related.value.close();
  return true;
};
const toggleLine = (line: PurchaseOrderLine, selected: boolean): void => {
  if (editingLocked.value) return;
  if (selected) void addLine(line);
  else removeLine(line.id);
};
const changeLinePageSize = (value: number): void => {
  if (editingLocked.value) return;
  linePageSize.value = value;
  linePage.value = 1;
};
const searchBasis = (draft: SupplementDraftLine): void => {
  if (editingLocked.value) return;
  draft.page = 1;
  void loadCandidates(draft);
};
const changeBasisPage = (draft: SupplementDraftLine, value: number): void => {
  if (editingLocked.value) return;
  draft.page = value;
  void loadCandidates(draft);
};
const changeBasisPageSize = (draft: SupplementDraftLine, value: number): void => {
  if (editingLocked.value) return;
  draft.pageSize = value;
  searchBasis(draft);
};
const linkedSummary = (row: PurchaseQualityReplacementCandidate): string =>
  row.linkedSupplements
    .map(
      (item) =>
        `${PURCHASE_ORDER_STATUS_LABELS[item.status]} ${item.count} 张 / ${item.plannedQuantity}`,
    )
    .join('；');
const showRelated = async (lineId: string, allocationId: string): Promise<void> => {
  if (editingLocked.value) return;
  await related.value?.open(lineId, allocationId);
};
const beforeClose = (): void => {
  void close();
};
onScopeDispose(useTabsStore().registerCloseGuard('procurement-orders', close));
defineExpose({ open, close, visible, locked: editingLocked });
</script>

<style scoped>
.supplement-dialog {
  display: grid;
  gap: 14px;
  min-width: 0;
  max-width: 100%;
}
.supplement-section {
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 10px;
  min-width: 0;
  max-width: 100%;
}
.supplement-section h3 {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 12px;
  margin: 0 0 10px;
  font-size: 16px;
}
.section-meta,
.line-tools span {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-weight: 400;
}
.flow-hint {
  margin-top: 10px;
}
.line-tools,
.basis-tools {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.line-tools .el-input {
  width: min(420px, 45%);
}
.basis-tools .el-input {
  width: min(310px, 38%);
}
.draft-line {
  padding: 12px;
  margin-bottom: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  min-width: 0;
  max-width: 100%;
}
.supplement-section :deep(.el-table) {
  width: 100%;
  max-width: 100%;
}
.draft-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 16px;
}
.draft-heading strong {
  color: var(--el-text-color-primary);
}
.draft-heading span {
  color: var(--el-text-color-regular);
}
.draft-heading .el-button {
  margin-left: auto;
}
.selected-basis {
  margin: 8px 0;
  padding: 6px 9px;
  border-left: 3px solid var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  overflow-wrap: anywhere;
}
.pagination-locked {
  pointer-events: none;
  opacity: 0.6;
}
.line-form,
.remark-form {
  margin-top: 10px;
}
.line-form :deep(.el-form-item:last-child),
.remark-form :deep(.el-form-item) {
  margin-bottom: 0;
}
</style>
