<template>
  <el-dialog
    :model-value="visible"
    :title="replacingLineId ? '更换补单依据' : '添加补单明细'"
    :width="DialogWidth.workbench"
    class="supplement-picker-dialog"
    workbench
    :close-on-click-modal="false"
    @update:model-value="close"
  >
    <div class="picker-context">
      <strong class="identity-value">{{ purchaseNo }}</strong>
      <span>{{ reason ? PURCHASE_ORDER_SUPPLEMENT_REASON_LABELS[reason] : '' }}</span>
      <span>{{
        replacingLineId
          ? '确认后保留已填数量与说明，请重新核对。'
          : '每条采购行选择一次到货，可跨行、跨页保留选择。'
      }}</span>
    </div>
    <InlineHint
      v-if="reason"
      class="picker-eligibility"
    >
      {{
        reason === 'excess_purchase'
          ? '可选范围：当前有效定稿仍有可入库数量，或已有实际入库记录的到货；仅完成质检暂不可选。'
          : '可选范围：当前有效定稿仍有质量待退数量，或已有实际质量退回记录的到货；人工拒收不提供质量依据。'
      }}
    </InlineHint>
    <div class="picker-columns">
      <aside
        class="purchase-directory"
        aria-label="原采购行目录"
      >
        <div class="directory-tools">
          <strong>原采购行</strong>
          <el-input
            v-model="lineSearch"
            clearable
            :disabled="disabled"
            placeholder="搜索物料、版本或行 ID"
            aria-label="搜索原采购行"
          />
        </div>
        <div class="directory-body">
          <el-empty
            v-if="!directory.length"
            description="没有匹配的采购行"
            :image-size="70"
          />
          <button
            v-for="line in directory"
            :key="line.id"
            type="button"
            class="directory-line"
            :class="{
              'is-current': focusedLineId === line.id,
              'is-added': isAlreadyAdded(line.id),
            }"
            :disabled="disabled"
            :aria-current="focusedLineId === line.id ? 'true' : undefined"
            @click="focusLine(line.id)"
          >
            <span class="directory-line-heading">
              <strong>{{ line.itemName }}</strong>
              <el-tag
                v-if="isAlreadyAdded(line.id)"
                type="info"
                size="small"
                >已添加</el-tag
              >
              <el-tag
                v-else-if="choices.has(line.id)"
                type="primary"
                size="small"
                >已选依据</el-tag
              >
            </span>
            <span>{{ line.materialVariantCode }}</span>
            <span
              >采购行 ID：<strong class="identity-value">{{ line.id }}</strong></span
            >
          </button>
        </div>
      </aside>
      <section
        class="basis-panel"
        aria-label="当前采购行的补单依据"
      >
        <template v-if="currentLine && currentPage">
          <div class="basis-heading">
            <strong>{{ currentLine.itemName }} · {{ currentLine.materialVariantCode }}</strong>
            <span
              >采购行 ID：<strong class="identity-value">{{ currentLine.id }}</strong> · 原计划
              {{ currentLine.plannedQuantity }} {{ currentLine.unit }}</span
            >
          </div>
          <InlineHint v-if="isAlreadyAdded(currentLine.id)">
            此采购行已添加到主窗，可返回主窗更换依据或移除明细。
          </InlineHint>
          <template v-else>
            <form
              class="basis-search"
              @submit.prevent="search"
            >
              <el-input
                v-model="currentPage.keyword"
                clearable
                maxlength="100"
                :disabled="disabled"
                :placeholder="
                  reason === 'quality_replacement'
                    ? '搜索到货单、供应商批号或退回单'
                    : '搜索到货单或供应商批号'
                "
                aria-label="搜索补单依据"
                @clear="search"
              />
              <el-button
                :disabled="disabled"
                :loading="loading"
                native-type="submit"
                >查询</el-button
              >
              <el-button
                :disabled="disabled || loading"
                @click="load"
                >刷新</el-button
              >
            </form>
            <div
              v-if="currentPage.receiptLineId"
              class="located-basis"
            >
              <span
                >定位到货行 ID：<strong class="identity-value">{{
                  currentPage.receiptLineId
                }}</strong></span
              >
              <el-button
                link
                type="primary"
                :disabled="disabled"
                @click="clearLocation"
                >显示全部依据</el-button
              >
            </div>
            <div
              v-if="currentChoice"
              class="current-choice"
            >
              <span v-if="currentChoice.selectedExcess"
                >已选
                <strong class="identity-value">{{ currentChoice.selectedExcess.receiptNo }}</strong>
                · 到货行 ID：<strong class="identity-value">{{
                  currentChoice.selectedExcess.id
                }}</strong></span
              >
              <span v-else-if="currentChoice.selectedQuality"
                >已选
                <strong class="identity-value">{{
                  currentChoice.selectedQuality.receiptNo
                }}</strong>
                · 到货行 ID：<strong class="identity-value">{{
                  currentChoice.selectedQuality.receiptLineId
                }}</strong></span
              >
              <el-button
                link
                type="primary"
                :disabled="disabled"
                @click="removeChoice(currentLine.id)"
                >撤选本行</el-button
              >
            </div>
            <el-alert
              v-if="currentPage.error"
              title="依据读取失败，已有选择已保留，请刷新重试。"
              type="error"
              :closable="false"
            />
            <div
              v-loading="loading"
              class="candidate-body"
            >
              <template v-if="reason === 'excess_purchase'">
                <el-empty
                  v-if="!loading && !currentPage.error && !currentPage.excessRows.length"
                  :description="candidateEmptyText"
                  :image-size="70"
                />
                <article
                  v-for="candidate in currentPage.excessRows"
                  :key="candidate.id"
                  class="candidate-card"
                  :class="{ 'is-selected': currentChoice?.selectedExcess?.id === candidate.id }"
                >
                  <el-radio
                    :model-value="currentChoice?.selectedExcess?.id"
                    :value="candidate.id"
                    :disabled="disabled || loading || currentPage.error"
                    :aria-label="`选择到货 ${candidate.receiptNo}，到货行 ID：${candidate.id}`"
                    class="basis-radio"
                    @change="selectExcess(candidate)"
                    ><span
                      ><strong class="identity-value">{{ candidate.receiptNo }}</strong> · 到货行
                      ID：<strong class="identity-value">{{ candidate.id }}</strong></span
                    ></el-radio
                  >
                  <div class="candidate-information">
                    <span>批号 {{ candidate.supplierBatchCode || '未提供' }}</span>
                    <span>到货 {{ formatDateTimeForDisplay(candidate.receivedAt) }}</span>
                  </div>
                  <SupplementReceiptQuantities
                    class="candidate-quantities"
                    :quantities="candidate"
                    :unit="currentLine.unit"
                  />
                  <ReceiptLinkedSupplements
                    :summaries="candidate.receiptLinkedSupplements"
                    :unit="currentLine.unit"
                    :disabled="disabled"
                    @view="emit('related', currentLine.id, candidate.id)"
                  />
                </article>
              </template>
              <template v-else>
                <el-empty
                  v-if="!loading && !currentPage.error && !currentPage.qualityRows.length"
                  :description="candidateEmptyText"
                  :image-size="70"
                />
                <article
                  v-for="candidate in currentPage.qualityRows"
                  :key="candidate.receiptLineId"
                  class="candidate-card"
                  :class="{
                    'is-selected':
                      currentChoice?.selectedQuality?.receiptLineId === candidate.receiptLineId,
                  }"
                >
                  <el-radio
                    :model-value="currentChoice?.selectedQuality?.receiptLineId"
                    :value="candidate.receiptLineId"
                    :disabled="disabled || loading || currentPage.error"
                    :aria-label="`选择到货 ${candidate.receiptNo}，到货行 ID：${candidate.receiptLineId}`"
                    class="basis-radio"
                    @change="selectQuality(candidate)"
                    ><span
                      ><strong class="identity-value">{{ candidate.receiptNo }}</strong> · 到货行
                      ID：<strong class="identity-value">{{
                        candidate.receiptLineId
                      }}</strong></span
                    ></el-radio
                  >
                  <div class="candidate-information">
                    <span>批号 {{ candidate.supplierBatchCode || '未提供' }}</span>
                    <span>到货 {{ formatDateTimeForDisplay(candidate.receivedAt) }}</span>
                  </div>
                  <SupplementReceiptQuantities
                    class="candidate-quantities"
                    :quantities="candidate"
                    :unit="currentLine.unit"
                  />
                  <ReceiptLinkedSupplements
                    :summaries="candidate.receiptLinkedSupplements"
                    :unit="currentLine.unit"
                    :disabled="disabled"
                    @view="emit('related', currentLine.id, candidate.receiptLineId)"
                  />
                </article>
              </template>
            </div>
            <PaginationFooter
              class="basis-pagination"
              compact
              layout="prev, pager, next"
              :disabled="disabled || loading"
              :total="currentPage.total"
              :current-page="currentPage.page"
              :page-size="currentPage.pageSize"
              @page-change="changePage"
              @update:page-size="changePageSize"
            />
          </template>
        </template>
        <el-empty
          v-else
          description="从左侧选择一条原采购行，核对其具体依据"
          :image-size="90"
        />
      </section>
    </div>
    <template #footer>
      <div class="picker-footer">
        <span
          >{{ replacingLineId ? '当前行已选' : '本次已选' }}
          <strong>{{ choices.size }}</strong> 条{{ replacingLineId ? '依据' : '明细' }}</span
        >
        <div>
          <el-button @click="close">取消选择</el-button>
          <el-button
            type="primary"
            :disabled="!canConfirm"
            @click="confirmSelection"
            >{{ replacingLineId ? '确认更换依据' : `添加 ${choices.size} 条明细` }}</el-button
          >
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PurchaseOrderLine, PurchaseOrderSupplementReason } from '@company/contracts';
import { PURCHASE_ORDER_SUPPLEMENT_REASON_LABELS } from '@company/constants';
import InlineHint from '../../../components/InlineHint.vue';
import ReceiptLinkedSupplements from './ReceiptLinkedSupplements.vue';
import SupplementReceiptQuantities from './SupplementReceiptQuantities.vue';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { DialogWidth } from '../../../utils/dialog';
import { usePurchaseOrderSupplementSelection } from '../composables/usePurchaseOrderSupplementSelection';
import type { SupplementBasisChoice, SupplementBasisConfirmation } from '../supplement-basis';

defineOptions({ name: 'PurchaseOrderSupplementPickerDialog' });
const props = defineProps<{
  orderId: string;
  purchaseNo: string;
  reason: PurchaseOrderSupplementReason | '';
  lines: PurchaseOrderLine[];
  added: SupplementBasisChoice[];
  disabled: boolean;
}>();
const emit = defineEmits<{
  confirm: [SupplementBasisConfirmation];
  related: [lineId: string, receiptLineId: string];
}>();
const {
  visible,
  replacingLineId,
  focusedLineId,
  lineSearch,
  loading,
  choices,
  directory,
  currentLine,
  currentPage,
  currentChoice,
  canConfirm,
  isAlreadyAdded,
  open,
  close,
  focusLine,
  load,
  selectExcess,
  selectQuality,
  removeChoice,
  search,
  clearLocation,
  changePage,
  changePageSize,
  confirm,
} = usePurchaseOrderSupplementSelection({
  orderId: () => props.orderId,
  reason: () => props.reason,
  lines: () => props.lines,
  added: () => props.added,
  disabled: () => props.disabled,
});
const candidateEmptyText = computed(() => {
  const filtered = Boolean(currentPage.value?.keyword.trim() || currentPage.value?.receiptLineId);
  if (props.reason === 'excess_purchase')
    return filtered ? '未找到匹配条件的补购依据到货' : '未找到有可入库余量或实际入库记录的到货';
  return filtered ? '未找到匹配条件的质量补发依据到货' : '未找到有质量待退或实际质量退回记录的到货';
});
const confirmSelection = (): void => {
  const selection = confirm();
  if (selection) emit('confirm', selection);
};
defineExpose({ open, close, visible });
</script>

<style scoped>
.identity-value {
  color: var(--el-text-color-primary);
  font-weight: 600;
}
:global(.el-dialog.supplement-picker-dialog) {
  height: 90%;
}
:global(.el-dialog.supplement-picker-dialog > .el-dialog__body) {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
  padding-top: 0;
  padding-bottom: 0;
}
.picker-context {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 6px 16px;
  overflow-wrap: anywhere;
}
.picker-context > span:last-child {
  color: var(--el-text-color-regular);
}
.picker-eligibility {
  flex-shrink: 0;
}
.picker-columns {
  display: grid;
  grid-template-columns: minmax(240px, 29%) minmax(0, 1fr);
  flex: 1;
  min-height: 0;
  gap: 16px;
}
.purchase-directory,
.basis-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.purchase-directory {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  overflow: hidden;
}
.directory-tools {
  display: grid;
  flex-shrink: 0;
  gap: 10px;
  padding: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-light);
}
.directory-body,
.candidate-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}
.directory-line {
  display: grid;
  gap: 5px;
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding: 12px;
  text-align: left;
  color: var(--el-text-color-regular);
  background: var(--el-bg-color);
  cursor: pointer;
  font: inherit;
  overflow-wrap: anywhere;
}
.directory-line:hover {
  background: var(--el-fill-color-light);
}
.directory-line.is-current {
  background: var(--el-color-primary-light-9);
  box-shadow: inset 3px 0 var(--el-color-primary);
}
.directory-line:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: -2px;
}
.directory-line:disabled {
  cursor: default;
  opacity: 0.65;
}
.directory-line-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
  color: var(--el-text-color-primary);
}
.basis-panel {
  gap: 10px;
}
.basis-heading {
  display: grid;
  gap: 6px;
  flex-shrink: 0;
  overflow-wrap: anywhere;
}
.basis-heading > span {
  color: var(--el-text-color-regular);
}
.basis-search,
.located-basis,
.current-choice {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.basis-search .el-input {
  flex: 1;
  min-width: 0;
}
.basis-search .el-button + .el-button {
  margin-left: 0;
}
.located-basis,
.current-choice {
  flex-wrap: wrap;
  justify-content: space-between;
  overflow-wrap: anywhere;
}
.current-choice {
  padding: 8px 10px;
  border-left: 3px solid var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.candidate-body {
  position: relative;
  padding-right: 4px;
}
.candidate-card {
  display: grid;
  gap: 8px;
  margin-bottom: 10px;
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  overflow-wrap: anywhere;
}
.candidate-card.is-selected {
  border-color: var(--el-color-primary);
}
.basis-radio {
  height: auto;
  margin-right: 0;
  align-items: flex-start;
  white-space: normal;
}
.basis-radio :deep(.el-radio__input) {
  margin-top: 3px;
}
.basis-radio :deep(.el-radio__label) {
  min-width: 0;
  color: var(--el-text-color-primary);
  white-space: normal;
  line-height: 1.5;
}
.candidate-information {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin-left: 22px;
  color: var(--el-text-color-regular);
}
.candidate-quantities {
  margin-left: 22px;
}
.basis-pagination {
  flex-shrink: 0;
  border-top: 1px solid var(--el-border-color-lighter);
}
.picker-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.picker-footer > span {
  color: var(--el-text-color-regular);
}
</style>
