<template>
  <div>
    <el-dialog
      v-model="selectorVisible"
      title="选择采购入库来源"
      :width="DialogWidth.workbench"
      workbench
      :before-close="closeSelector"
    >
      <section class="query-panel">
        <el-form
          inline
          :model="sources.query"
          @submit.prevent="sources.search"
        >
          <el-form-item label="关键词"
            ><el-input
              v-model="sources.query.keyword"
              clearable
              placeholder="采购单、到货单、供应商或物料"
          /></el-form-item>
          <el-form-item
            ><el-button
              type="primary"
              :loading="sources.loading.value"
              @click="sources.search"
              >查询</el-button
            ><el-button @click="sources.reset">重置</el-button></el-form-item
          >
          <el-form-item v-if="sources.query.receiptLineId"
            ><el-tag
              closable
              @close="sources.reset"
              >已定位到货明细</el-tag
            ></el-form-item
          >
        </el-form>
      </section>
      <el-alert
        v-if="sources.loadError.value"
        :title="sources.loadError.value"
        type="error"
        :closable="false"
      />
      <section class="table-panel">
        <TableToolbar>
          <template #actions>
            <el-button
              type="primary"
              :disabled="!sources.selected.value.length"
              @click="sources.open"
              >核对入库（{{ sources.selected.value.length }}）</el-button
            >
            <el-button
              :disabled="!sources.selected.value.length || sources.locked.value"
              @click="sources.clear"
              >清空已选</el-button
            >
            <span class="muted">跨页保留已选范围</span>
          </template>
          <template #tools
            ><el-button
              :icon="Refresh"
              :loading="sources.loading.value"
              text
              circle
              aria-label="刷新到货明细"
              @click="sources.load"
          /></template>
        </TableToolbar>
        <PurchaseInboundSourceGroups
          :sources="sources"
          :go-source="goSource"
        />
        <PaginationFooter
          :total="sources.total.value"
          :current-page="sources.page.value"
          :page-size="sources.pageSize.value"
          total-suffix="条到货明细"
          @page-change="sourcePage"
          @update:page-size="sourceSize"
        />
      </section>

      <template #footer><el-button @click="closeSelector()">关闭</el-button></template>
    </el-dialog>
    <el-dialog
      :model-value="pageActive && sources.visible.value"
      title="核对外购物料入库"
      :width="DialogWidth.workbench"
      workbench
      :close-on-click-modal="false"
      :before-close="closeConfirmation"
      @update:model-value="closeConfirmation"
    >
      <el-alert
        title="请核对本次实际入库数量和目标批次，确认后将增加库存。"
        type="info"
        show-icon
        :closable="false"
      />
      <div class="dialog-toolbar">
        <el-button
          :loading="sources.checking.value"
          :disabled="sources.command.locked.value"
          @click="sources.recheck(true)"
          >刷新数据</el-button
        >
      </div>
      <el-alert
        v-if="sources.checkError.value"
        :title="sources.checkError.value"
        type="error"
        :closable="false"
      />
      <InlineHint
        v-if="selectedReceiptGroups.length > 1 || selectedSupplierCount > 1"
        class="multi-receipt-hint"
        >本次涉及 <strong>{{ selectedReceiptGroups.length }}</strong> 张到货单、<strong>{{
          selectedSupplierCount
        }}</strong>
        家供应商，确认后生成一张外购入库单。</InlineHint
      >
      <div class="review-groups">
        <section
          v-for="group in selectedReceiptGroups"
          :key="group.receiptId"
          class="review-group"
        >
          <div class="review-heading">
            <span class="review-title"
              >到货单 <span class="identity-value">{{ group.receiptNo }}</span></span
            >
            <span
              >登记采购 <span class="identity-value">{{ group.receiptPurchaseNo }}</span></span
            >
          </div>
          <el-table
            :data="group.items"
            row-key="rowKey"
            scrollbar-always-on
          >
            <el-table-column
              label="到货行 ID / 来源采购"
              min-width="180"
              ><template #default="{ row }"
                ><div class="muted">本次第 {{ targetRowNumbers.get(row.rowKey) }} 行</div>
                <div class="identity-value">{{ row.source.receiptLineId }}</div>
                <div class="muted">
                  <span class="identity-value">{{ row.source.purchaseNo }}</span>
                </div></template
              ></el-table-column
            >
            <el-table-column
              label="物料 / 精确版本"
              min-width="200"
              ><template #default="{ row }"
                ><div>{{ row.source.itemCode }} · {{ row.source.itemName }}</div>
                <div class="muted">{{ row.source.materialVariantCode }}</div></template
              ></el-table-column
            >
            <el-table-column
              label="供应商"
              min-width="140"
              ><template #default="{ row }">{{
                row.source.supplierName
              }}</template></el-table-column
            >
            <el-table-column
              label="计划采购量"
              min-width="150"
              align="right"
              ><template #default="{ row }"
                ><template v-if="row.source.plannedQuantity"
                  >{{ formatQuantity(row.source.plannedQuantity) }} {{ row.source.unit }}</template
                ><span v-else>—</span></template
              ></el-table-column
            >
            <el-table-column
              label="目标库存批次"
              min-width="270"
            >
              <template #default="{ row }">
                <InboundBatchTargetPicker
                  v-model="row.target"
                  item-kind="material"
                  :material-variant-id="row.source.materialVariantId"
                  :unit="row.source.unit"
                  :identity="`${row.source.itemCode} / ${row.source.materialVariantCode} / ${row.source.unit}`"
                  :new-batch-groups="sources.newBatchChoices(row.source)"
                  :disabled="sources.locked.value"
                />
              </template>
            </el-table-column>
            <el-table-column
              label="累计已入库"
              min-width="130"
              align="right"
              ><template #default="{ row }"
                >{{ formatQuantity(row.source.inboundQuantity) }} {{ row.source.unit }}</template
              ></el-table-column
            >
            <el-table-column
              label="本次入库"
              min-width="270"
              ><template #default="{ row }"
                ><el-input
                  v-model="row.quantity"
                  inputmode="numeric"
                  :disabled="sources.locked.value"
                  :aria-label="`本次入库数量 ${row.source.itemCode}`"
                />
                <div
                  v-if="quantitySummaries[row.rowKey]"
                  class="quantity-summary"
                  :class="{ 'is-invalid': !quantitySummaries[row.rowKey].valid }"
                >
                  <span
                    >{{ quantitySummaries[row.rowKey].count }} 条目标合计
                    <strong>{{
                      quantitySummaries[row.rowKey].valid
                        ? `${formatQuantity(quantitySummaries[row.rowKey].total)} ${row.source.unit}`
                        : '待修正'
                    }}</strong></span
                  >
                </div>
                <div
                  v-if="row.error || sources.quantityErrors.value.get(row.rowKey)"
                  class="error"
                >
                  {{ row.error || sources.quantityErrors.value.get(row.rowKey) }}
                </div></template
              ></el-table-column
            >
            <el-table-column
              label="操作"
              min-width="132"
              fixed="right"
            >
              <template #default="{ row }">
                <div class="review-actions">
                  <InboundSplitControl
                    :quantity="row.quantity"
                    :disabled="sources.locked.value || sources.selected.value.length >= 100"
                    @split="(quantity) => sources.split(row.rowKey, quantity)"
                  />
                  <el-button
                    type="danger"
                    link
                    :disabled="sources.locked.value"
                    @click="sources.remove(row.rowKey)"
                    >移除此目标</el-button
                  >
                </div>
              </template>
            </el-table-column>
          </el-table>
        </section>
      </div>
      <el-form
        label-width="80px"
        class="remark-form"
        ><el-form-item label="入库备注"
          ><el-input
            v-model="sources.remark.value"
            type="textarea"
            :rows="2"
            maxlength="500"
            show-word-limit
            :disabled="sources.locked.value" /></el-form-item
      ></el-form>
      <SubmissionRecoveryNotice
        :status="sources.command.status.value"
        :busy="sources.command.busy.value"
        records-label="入库历史"
        allow-restart
        @retry="sources.command.retry"
        @restart="sources.command.discard"
      />
      <template #footer>
        <el-button
          :disabled="sources.command.busy.value || sources.checking.value"
          @click="sources.close"
          >{{ sources.command.status.value === 'idle' ? '收起并保留' : '核对后关闭' }}</el-button
        >

        <el-button
          v-if="sources.command.status.value === 'idle'"
          type="primary"
          :loading="sources.command.busy.value"
          :disabled="sources.locked.value || !sources.canSubmit.value"
          @click="sources.submit"
          >确认办理</el-button
        >
      </template>
    </el-dialog>
  </div>
</template>
<script setup lang="ts">
import SubmissionRecoveryNotice from '../../../components/SubmissionRecoveryNotice.vue';
import { computed, onActivated, onDeactivated, onScopeDispose, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import { Refresh } from '@element-plus/icons-vue';
import { useTabsStore } from '../../../stores/tabs';
import TableToolbar from '../../../components/TableToolbar.vue';
import InlineHint from '../../../components/InlineHint.vue';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import { DialogWidth } from '../../../utils/dialog';
import { formatQuantity } from '../../../utils/quantity';
import { usePurchaseInboundSources } from '../composables/usePurchaseInboundSources';
import PurchaseInboundSourceGroups from './PurchaseInboundSourceGroups.vue';
import InboundBatchTargetPicker from './InboundBatchTargetPicker.vue';
import InboundSplitControl from './InboundSplitControl.vue';

defineOptions({ name: 'PurchaseInboundCreateDialog' });
const props = defineProps<{ tabName: string }>();
const emit = defineEmits<{ changed: [] }>();
const selectorVisible = ref(false);
const pageActive = ref(true);
const router = useRouter();
const { canAccessRoute } = useRouteAccess();
const sources = usePurchaseInboundSources(async () => {
  selectorVisible.value = false;
  emit('changed');
});
async function goSource(name: string, query: Record<string, string>): Promise<void> {
  if (!canAccessRoute({ name, query }) || sources.locked.value) return;
  await router.push({ name, query });
}
const selectedReceiptGroups = computed(() => {
  const byReceipt = new Map<
    string,
    {
      receiptId: string;
      receiptNo: string;
      receiptPurchaseNo: string;
      items: typeof sources.selected.value;
    }
  >();
  for (const row of sources.selected.value) {
    const source = row.source;
    let group = byReceipt.get(source.receiptId);
    if (!group) {
      group = {
        receiptId: source.receiptId,
        receiptNo: source.receiptNo,
        receiptPurchaseNo: source.receiptPurchaseNo,
        items: [],
      };
      byReceipt.set(source.receiptId, group);
    }
    group.items.push(row);
  }
  return [...byReceipt.values()];
});
const selectedSupplierCount = computed(
  () => new Set(sources.selected.value.map((row) => row.source.supplierId)).size,
);
const quantitySummaries = computed(() => {
  const firstDetails = new Map<string, string>();
  for (const row of sources.selected.value) {
    if (!firstDetails.has(row.source.receiptLineId))
      firstDetails.set(row.source.receiptLineId, row.rowKey);
  }
  return Object.fromEntries(
    sources.groupSummaries.value.map((group) => [
      firstDetails.get(group.source.receiptLineId)!,
      group,
    ]),
  );
});
const targetRowNumbers = computed(
  () => new Map(sources.selected.value.map((row, index) => [row.rowKey, index + 1])),
);

async function open(receiptLineId?: string): Promise<void> {
  selectorVisible.value = true;
  if (receiptLineId) sources.query.receiptLineId = receiptLineId;
  await sources.load();
}
async function closeSelector(done?: () => void): Promise<void> {
  if (!(await sources.clear())) return;
  selectorVisible.value = false;
  done?.();
}
const sourcePage = (value: number) => {
  sources.page.value = value;
  return sources.load();
};
const sourceSize = (value: number) => {
  sources.pageSize.value = value;
  return sources.search();
};
const closeConfirmation = () => {
  void sources.close();
};
onActivated(() => {
  pageActive.value = true;
});
onDeactivated(() => {
  pageActive.value = false;
});
onScopeDispose(useTabsStore().registerCloseGuard(props.tabName, sources.clear));
defineExpose({ open });
</script>
<style scoped>
.query-panel,
.table-panel {
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
  border-radius: 6px;
}
.query-panel {
  padding: 16px 16px 0;
  margin-bottom: 16px;
}
.query-panel :deep(.el-input) {
  width: 280px;
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.7;
}
.error {
  color: var(--el-color-danger);
  font-size: 12px;
  margin-top: 4px;
}
.dialog-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin: 16px 0;
}
.multi-receipt-hint {
  margin-bottom: 12px;
}
.review-groups {
  max-height: 430px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color-lighter);
}
.review-group + .review-group {
  margin-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.review-heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 20px;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 22px;
}
.review-title {
  color: var(--el-text-color-primary);
  font-size: 14px;
  font-weight: 400;
}
.identity-value {
  color: var(--el-text-color-primary);
  font-weight: 600;
}
.review-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}
.review-actions :deep(.el-button) {
  margin-left: 0;
}
.remark-form {
  margin-top: 16px;
}
.quantity-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0 6px;
  margin-top: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.7;
}
.quantity-summary strong {
  color: var(--el-text-color-primary);
}
.quantity-summary.is-invalid strong {
  color: var(--el-color-danger);
}
</style>
