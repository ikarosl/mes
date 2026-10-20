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
      <div class="order-context">
        <template v-if="order">
          <span
            >{{ isExcessSource ? '当前承接补单' : '原采购单' }}
            <strong>{{ order.purchaseNo }}</strong></span
          >
          <span
            >工单 <strong>{{ order.workOrderNo || '独立备料' }}</strong></span
          >
        </template>
        <el-button
          link
          type="primary"
          :disabled="editingLocked || orderLoading"
          @click="refreshContext"
          >{{ isExcessSource ? '刷新本单' : '刷新原采购' }}</el-button
        >
      </div>
      <template v-if="order">
        <InlineHint
          v-if="isExcessSource"
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
          <template v-else
            >本单
            {{ order.purchaseNo }}
            的冻结原采购来源缺失或不一致，请核对各行来源后前往原采购单办理。</template
          >
        </InlineHint>
        <template v-else>
          <div class="reason-row">
            <span>补单类型</span>
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
          </div>
          <InlineHint v-if="reason">
            <template v-if="reason === 'excess_purchase'"
              >承接<strong>原到货</strong>，无需重复到货或质检；正式下单后由库管在原到货定稿中关联。</template
            >
            <template v-else
              >补发须登记<strong>新到货</strong>并重新质检入库；原货实际退回另行办理。</template
            >
          </InlineHint>
          <InlineHint v-else-if="pendingLocation?.lineId"
            >已定位采购行 <strong>id:{{ pendingLocation.lineId }}</strong
            >；先选择补单类型，再选择具体依据。</InlineHint
          >
          <section class="supplement-lines">
            <div class="detail-toolbar">
              <strong>补单明细 · {{ drafts.length }} 行</strong>
              <el-button
                type="primary"
                :disabled="!reason || editingLocked || orderLoading || orderError"
                @click="addDetails"
                >添加明细</el-button
              >
            </div>
            <el-empty
              v-if="!drafts.length"
              :description="
                reason
                  ? '添加明细并选择具体依据后，填写本次补单数量与说明'
                  : '先选择补单类型，再添加明细'
              "
              :image-size="85"
            />
            <article
              v-for="draft in drafts"
              :key="draft.line.id"
              class="draft-line"
            >
              <div class="draft-heading">
                <div class="draft-identity">
                  <strong>{{ draft.line.itemName }} · {{ draft.line.materialVariantCode }}</strong>
                  <span
                    >供应商 {{ draft.line.supplierName }} · 原计划 {{ draft.line.plannedQuantity }}
                    {{ draft.line.unit }}</span
                  >
                </div>
                <el-button
                  link
                  type="danger"
                  :disabled="editingLocked"
                  @click="removeLine(draft.line.id)"
                  >移除</el-button
                >
              </div>
              <div class="selected-basis">
                <div class="basis-identity">
                  <span v-if="draft.selectedExcess"
                    >已选依据 {{ draft.selectedExcess.receiptNo }} · id:{{
                      draft.selectedExcess.id
                    }}</span
                  >
                  <span v-else-if="draft.selectedQuality"
                    >已选依据 {{ draft.selectedQuality.receiptNo }} · id:{{
                      draft.selectedQuality.receiptLineId
                    }}
                    · 到货分配 ID：{{ draft.selectedQuality.allocationId }}</span
                  >
                  <el-button
                    link
                    type="primary"
                    :disabled="editingLocked || orderLoading || orderError"
                    @click="changeBasis(draft)"
                    >更换依据</el-button
                  >
                </div>
                <span
                  v-if="draft.selectedExcess"
                  class="basis-quantities"
                  >到货量 {{ draft.selectedExcess.receivedQuantity }} {{ draft.line.unit }}</span
                >
                <div
                  v-else-if="draft.selectedQuality"
                  class="basis-quantities"
                >
                  <span>
                    待退回
                    <strong
                      :class="
                        receiptReturnQuantityClass(draft.selectedQuality.pendingReturnQuantity)
                      "
                      >{{ draft.selectedQuality.pendingReturnQuantity }}</strong
                    >
                    {{ draft.line.unit }}
                  </span>
                  <span>
                    已退回
                    <strong
                      :class="receiptReturnQuantityClass(draft.selectedQuality.returnedQuantity)"
                      >{{ draft.selectedQuality.returnedQuantity }}</strong
                    >
                    {{ draft.line.unit }}
                  </span>
                  <span
                    >当时安排退回量 {{ draft.selectedQuality.allocationQuantity }}
                    {{ draft.line.unit }}</span
                  >
                </div>
              </div>
              <el-alert
                v-if="draft.basisError"
                title="所选依据当前不可用或核对失败，请更换依据后重新核对。"
                type="error"
                :closable="false"
              />
              <el-form
                :disabled="editingLocked"
                label-position="top"
                class="line-form"
              >
                <el-form-item
                  :label="reason === 'excess_purchase' ? '补购量' : '约定补发量'"
                  required
                >
                  <div class="quantity-field">
                    <el-input-number
                      v-model="draft.quantity"
                      :min="1"
                      :max="PURCHASE_ORDER_MAX_QUANTITY"
                      :precision="0"
                      controls-position="right"
                    />
                    <span>{{ draft.line.unit }}</span>
                  </div>
                </el-form-item>
                <el-form-item
                  :label="reason === 'excess_purchase' ? '额外购买依据' : '供应商补发约定'"
                  required
                >
                  <el-input
                    v-model="draft.evidence"
                    type="textarea"
                    :rows="2"
                    resize="vertical"
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
            </article>
            <el-form
              v-if="remarkExpanded || remark"
              label-position="top"
              class="remark-form"
            >
              <el-form-item label="整单备注">
                <el-input
                  v-model="remark"
                  :disabled="editingLocked"
                  type="textarea"
                  :rows="2"
                  resize="vertical"
                  maxlength="2000"
                  show-word-limit
                />
              </el-form-item>
            </el-form>
            <el-button
              v-else
              link
              type="primary"
              :disabled="editingLocked"
              @click="remarkExpanded = true"
              >添加整单备注</el-button
            >
          </section>
        </template>
      </template>
    </div>
    <template #footer>
      <el-button
        :disabled="command.busy.value || submittingCheck"
        @click="close"
        >取消</el-button
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
        >创建 {{ drafts.length }} 行草稿</el-button
      >
    </template>
  </el-dialog>
  <PurchaseOrderSupplementPickerDialog
    ref="picker"
    :order-id="order?.id || ''"
    :purchase-no="order?.purchaseNo || ''"
    :reason="reason"
    :lines="eligibleLines"
    :added="drafts"
    :disabled="editingLocked || orderLoading || orderError"
    @confirm="confirmChoices"
    @related="showRelated"
  />
  <RelatedSupplementsDialog
    ref="related"
    @navigate="emit('related-navigate', $event)"
  />
</template>

<script setup lang="ts">
import { computed, nextTick, onScopeDispose, ref, watch } from 'vue';
import type { PurchaseOrderSupplementReason } from '@company/contracts';
import {
  PURCHASE_ORDER_MAX_QUANTITY,
  PURCHASE_ORDER_SUPPLEMENT_REASONS,
  PURCHASE_ORDER_SUPPLEMENT_REASON_LABELS,
} from '@company/constants';
import { useTabsStore } from '../../../stores/tabs';
import { DialogWidth } from '../../../utils/dialog';
import InlineHint from '../../../components/InlineHint.vue';
import { excessSupplementOrigin } from '../supplement-origin';
import { receiptReturnQuantityClass } from '../receipt-round-presentation';
import RelatedSupplementsDialog from './RelatedSupplementsDialog.vue';
import PurchaseOrderSupplementPickerDialog from './PurchaseOrderSupplementPickerDialog.vue';
import {
  usePurchaseOrderSupplement,
  type SupplementDraftLine,
  type SupplementLocation,
} from '../composables/usePurchaseOrderSupplement';
import type { SupplementBasisConfirmation } from '../supplement-basis';
import type { RelatedSupplementLocation } from '../purchase-order-location';

defineOptions({ name: 'PurchaseOrderSupplementDialog' });
const emit = defineEmits<{
  saved: [string];
  'related-navigate': [RelatedSupplementLocation];
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
  pendingLocation,
  requestedReason,
  eligibleLines,
  command,
  canSave,
  editingLocked,
  submittingCheck,
  open: openSupplement,
  close: closeSupplement,
  chooseReason,
  adoptChoices,
  removeLine,
  refreshOrder,
  save,
} = usePurchaseOrderSupplement((id) => emit('saved', id));
const isExcessSource = computed(() => order.value?.supplementReason === 'excess_purchase');
const originTarget = computed(() => excessSupplementOrigin(order.value));
const picker = ref<InstanceType<typeof PurchaseOrderSupplementPickerDialog>>();
const related = ref<InstanceType<typeof RelatedSupplementsDialog>>();
const reasonRevision = ref(0),
  choosingReason = ref(false),
  remarkExpanded = ref(false);
let openingPendingSelection = false;
const openPendingSelection = async (): Promise<void> => {
  if (openingPendingSelection) return;
  openingPendingSelection = true;
  try {
    // 子窗的 disabled、原单与类型必须先接收同一份最新 props。
    await nextTick();
    const location = pendingLocation.value;
    if (
      !visible.value ||
      !reason.value ||
      !location ||
      isExcessSource.value ||
      orderError.value ||
      orderLoading.value ||
      !eligibleLines.value.some((line) => line.id === location.lineId)
    )
      return;
    const selection = picker.value;
    if (!selection || selection.visible) return;
    // open 同步确认已进入选择窗；候选请求尚未返回时取消也不会重新定位。
    if (selection.open(location) && pendingLocation.value === location)
      pendingLocation.value = null;
  } finally {
    openingPendingSelection = false;
  }
};
const open = async (id: string, location: SupplementLocation = {}): Promise<boolean> => {
  const opened = await openSupplement(id, location);
  if (!opened) return false;
  remarkExpanded.value = false;
  await openPendingSelection();
  return true;
};
const changeReason = async (next: PurchaseOrderSupplementReason): Promise<void> => {
  if (choosingReason.value) return;
  choosingReason.value = true;
  const previous = reason.value;
  try {
    if (await chooseReason(next)) {
      if (previous !== reason.value) remarkExpanded.value = false;
      await openPendingSelection();
    }
  } finally {
    // 取消确认后将单选恢复到已确认的类型。
    reasonRevision.value += 1;
    choosingReason.value = false;
  }
};
const close = async (): Promise<boolean> => {
  if (!(await closeSupplement())) return false;
  picker.value?.close();
  related.value?.close();
  return true;
};
const addDetails = async (): Promise<void> => {
  if (!reason.value || editingLocked.value || orderLoading.value || orderError.value) return;
  await picker.value?.open();
};
const changeBasis = async (draft: SupplementDraftLine): Promise<void> => {
  if (editingLocked.value || orderLoading.value || orderError.value) return;
  await picker.value?.open({}, draft);
};
const confirmChoices = (confirmation: SupplementBasisConfirmation): void => {
  if (adoptChoices(confirmation)) picker.value?.close();
};
const refreshContext = async (): Promise<void> => {
  if (await refreshOrder()) await openPendingSelection();
};
const showRelated = async (lineId: string, allocationId: string): Promise<void> => {
  if (!editingLocked.value) await related.value?.open(lineId, allocationId);
};
const beforeClose = (): void => {
  void close();
};
watch(visible, (open) => {
  if (!open) {
    picker.value?.close();
    related.value?.close();
  }
});
watch([orderLoading, orderError], () => {
  if (!orderLoading.value && !orderError.value) void openPendingSelection();
});
onScopeDispose(useTabsStore().registerCloseGuard('procurement-orders', close));
defineExpose({ open, close, visible, locked: editingLocked });
</script>

<style scoped>
.supplement-dialog {
  display: grid;
  gap: 14px;
  min-width: 0;
}
.order-context,
.reason-row,
.detail-toolbar,
.draft-heading,
.basis-identity {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 20px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.order-context > .el-button,
.draft-heading > .el-button {
  margin-left: auto;
}
.order-context > span,
.reason-row > span {
  color: var(--el-text-color-regular);
}
.order-context strong,
.draft-identity > strong {
  color: var(--el-text-color-primary);
}
.supplement-lines {
  min-width: 0;
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 12px;
}
.detail-toolbar {
  justify-content: space-between;
  margin-bottom: 12px;
}
.detail-toolbar > strong {
  font-size: 16px;
}
.draft-line {
  display: grid;
  gap: 12px;
  min-width: 0;
  margin-bottom: 12px;
  padding: 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}
.draft-identity {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 6px 20px;
  min-width: 0;
  color: var(--el-text-color-regular);
}
.selected-basis {
  display: grid;
  gap: 5px;
  padding: 8px 10px;
  border-left: 3px solid var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  overflow-wrap: anywhere;
}
.basis-identity {
  justify-content: space-between;
}
.basis-quantities {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  color: var(--el-text-color-regular);
}
.basis-quantities .quantity-return {
  color: var(--el-color-warning-dark-2);
  font-weight: 700;
}
.basis-quantities .quantity-zero {
  color: var(--el-text-color-placeholder);
  font-weight: 400;
}
.line-form {
  display: grid;
  grid-template-columns: 210px minmax(0, 1fr);
  gap: 16px;
}
.line-form :deep(.el-form-item),
.remark-form :deep(.el-form-item) {
  min-width: 0;
  margin-bottom: 0;
}
.quantity-field {
  display: flex;
  align-items: center;
  gap: 8px;
}
.quantity-field .el-input-number {
  width: 170px;
}
</style>
