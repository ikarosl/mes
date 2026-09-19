<template>
  <div class="purchase-inbounds">
    <el-radio-group
      v-model="view"
      @change="refresh"
    >
      <el-radio-button value="releases">待入库放行清单</el-radio-button>
      <el-radio-button value="history">已确认入库</el-radio-button>
    </el-radio-group>
    <template v-if="view === 'releases'">
      <el-alert
        title="仅显示质检明确放行的剩余范围。可分次入库；首次实际确认生成内部批号，同一到货后续沿用。"
        type="info"
        :closable="false"
        show-icon
      />
      <section class="query-panel">
        <el-form
          inline
          :model="releases.query"
          @submit.prevent="releases.search"
        >
          <el-form-item label="关键词"
            ><el-input
              v-model="releases.query.keyword"
              clearable
              placeholder="采购单、到货单、供应商或物料"
          /></el-form-item>
          <el-form-item
            ><el-button
              type="primary"
              :loading="releases.loading.value"
              @click="releases.search"
              >查询</el-button
            ><el-button @click="releases.reset">重置</el-button></el-form-item
          >
          <el-form-item v-if="releases.query.receiptLineId"
            ><el-tag
              closable
              @close="releases.reset"
              >已定位到货明细</el-tag
            ></el-form-item
          >
        </el-form>
      </section>
      <section class="table-panel">
        <TableToolbar>
          <template #actions>
            <el-button
              type="primary"
              :disabled="!releases.selected.value.length"
              @click="releases.open"
              >核对入库（{{ releases.selected.value.length }}）</el-button
            >
            <el-button
              :disabled="!releases.selected.value.length || releases.locked.value"
              @click="releases.clear"
              >清空已选</el-button
            >
            <span class="muted">跨页保留已选范围，同一入库单须为同一供应商</span>
          </template>
          <template #tools
            ><el-button
              :icon="Refresh"
              :loading="releases.loading.value"
              text
              circle
              aria-label="刷新放行清单"
              @click="releases.load"
          /></template>
        </TableToolbar>
        <el-table
          v-loading="releases.loading.value"
          :data="releases.rows.value"
          row-key="scopeId"
          empty-text="暂无可入库放行范围"
        >
          <el-table-column width="48"
            ><template #default="{ row }"
              ><el-checkbox
                :model-value="releases.isSelected(row.scopeId)"
                :disabled="
                  releases.locked.value ||
                  (!!releases.supplierId.value && releases.supplierId.value !== row.supplierId)
                "
                :aria-label="`选择 ${row.receiptNo} ${row.itemCode}`"
                @change="releases.toggle(row)" /></template
          ></el-table-column>
          <el-table-column
            prop="supplierName"
            label="供应商"
            min-width="130"
          />
          <el-table-column
            label="来源"
            min-width="190"
            ><template #default="{ row }"
              ><div>{{ row.receiptNo }}</div>
              <div class="muted">{{ row.purchaseNo }}</div></template
            ></el-table-column
          >
          <el-table-column
            label="物料 / 精确版本"
            min-width="200"
            ><template #default="{ row }"
              ><div>{{ row.itemCode }} · {{ row.itemName }}</div>
              <div class="muted">{{ row.materialVariantCode }}</div></template
            ></el-table-column
          >
          <el-table-column
            prop="supplierBatchCode"
            label="供应商批号"
            min-width="150"
            ><template #default="{ row }">{{
              row.supplierBatchCode || '未提供'
            }}</template></el-table-column
          >
          <el-table-column
            label="内部批号"
            min-width="180"
            ><template #default="{ row }">{{
              row.batchCode || '首次入库时生成'
            }}</template></el-table-column
          >
          <el-table-column
            label="批准剩余"
            min-width="110"
            align="right"
            ><template #default="{ row }"
              >{{ formatQuantity(row.approvedRemainingQuantity) }} {{ row.unit }}</template
            ></el-table-column
          >
          <el-table-column
            label="来源核对"
            min-width="155"
            fixed="right"
          >
            <template #default="{ row }">
              <el-button
                v-if="auth.can(PERMISSIONS.procurement.receipts.view)"
                type="primary"
                link
                @click="goSource('procurement-receipts', row.receiptLineId)"
                >到货</el-button
              >
              <el-button
                v-if="auth.can(PERMISSIONS.quality.inboundInspections.view)"
                type="primary"
                link
                @click="goSource('quality-inbound-inspections', row.receiptLineId)"
                >检验</el-button
              >
            </template>
          </el-table-column>
        </el-table>
        <PaginationFooter
          :total="releases.total.value"
          :current-page="releases.page.value"
          :page-size="releases.pageSize.value"
          total-suffix="个范围"
          @page-change="releasePage"
          @update:page-size="releaseSize"
        />
      </section>
    </template>
    <template v-else>
      <section class="query-panel">
        <el-form
          inline
          @submit.prevent="searchHistory"
          ><el-form-item label="关键词"
            ><el-input
              v-model="historyKeyword"
              clearable
              placeholder="入库单号或供应商" /></el-form-item
          ><el-form-item
            ><el-button
              type="primary"
              :loading="history.loading.value"
              @click="searchHistory"
              >查询</el-button
            ><el-button @click="resetHistory">重置</el-button></el-form-item
          ></el-form
        >
      </section>
      <section class="table-panel">
        <TableToolbar
          ><template #tools
            ><el-button
              :icon="Refresh"
              text
              circle
              aria-label="刷新入库历史"
              :loading="history.loading.value"
              @click="loadHistory" /></template
        ></TableToolbar>
        <el-table
          v-loading="history.loading.value"
          :data="history.rows.value"
          empty-text="暂无已确认外购入库单"
        >
          <el-table-column
            prop="inboundNo"
            label="入库单号"
            min-width="210"
          />
          <el-table-column
            prop="provider"
            label="供应商"
            min-width="150"
          />
          <el-table-column
            prop="detailCount"
            label="范围数"
            width="90"
          />
          <el-table-column
            label="入库数量"
            min-width="130"
            ><template #default="{ row }">{{ summary(row) }}</template></el-table-column
          >
          <el-table-column
            label="确认时间"
            width="180"
            ><template #default="{ row }">{{
              row.inboundAt ? formatDateTimeForDisplay(row.inboundAt) : '-'
            }}</template></el-table-column
          >
          <el-table-column
            prop="operatorName"
            label="确认人"
            min-width="100"
          />
          <el-table-column
            prop="remark"
            label="备注"
            min-width="140"
            show-overflow-tooltip
          />
          <el-table-column
            label="操作"
            fixed="right"
            width="90"
            ><template #default="{ row }"
              ><el-button
                type="primary"
                link
                @click="openHistory(row.inboundId)"
                >详情</el-button
              ></template
            ></el-table-column
          >
        </el-table>
        <PaginationFooter
          :total="history.total.value"
          :current-page="historyPage"
          :page-size="historySize"
          @page-change="changeHistoryPage"
          @update:page-size="changeHistorySize"
        />
      </section>
    </template>
    <el-dialog
      :model-value="active && releases.visible.value"
      title="核对外购物料入库"
      :width="DialogWidth.workbench"
      workbench
      :close-on-click-modal="false"
      :before-close="closeConfirmation"
      @update:model-value="closeConfirmation"
    >
      <el-alert
        title="按本次实际入库填写正整数，可调小为分次入库。同一到货的多个放行范围共用内部批号，确认前请核对实物。"
        type="info"
        show-icon
        :closable="false"
      />
      <div class="dialog-toolbar">
        <strong>{{ releases.selected.value[0]?.source.supplierName }}</strong
        ><el-button
          :loading="releases.checking.value"
          :disabled="releases.command.locked.value"
          @click="releases.recheck(true)"
          >重新核对已选</el-button
        >
      </div>
      <el-alert
        v-if="releases.checkError.value"
        :title="releases.checkError.value"
        type="error"
        :closable="false"
      />
      <el-table
        :data="releases.selected.value"
        row-key="source.scopeId"
        max-height="430"
      >
        <el-table-column
          label="到货 / 采购"
          min-width="180"
          ><template #default="{ row }"
            ><div>{{ row.source.receiptNo }}</div>
            <div class="muted">{{ row.source.purchaseNo }}</div></template
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
          label="供应商批号 / 内部批号"
          min-width="190"
          ><template #default="{ row }"
            ><div>{{ row.source.supplierBatchCode || '未提供供应商批号' }}</div>
            <div class="muted">{{ row.source.batchCode || '首次入库时生成' }}</div></template
          ></el-table-column
        >
        <el-table-column
          label="批准剩余"
          width="110"
          align="right"
          ><template #default="{ row }"
            >{{ formatQuantity(row.source.approvedRemainingQuantity) }}
            {{ row.source.unit }}</template
          ></el-table-column
        >
        <el-table-column
          label="本次入库"
          min-width="190"
          ><template #default="{ row }"
            ><el-input-number
              v-model="row.quantity"
              :precision="0"
              :min="1"
              :disabled="releases.locked.value"
              controls-position="right"
            />
            <div
              v-if="row.error"
              class="error"
            >
              {{ row.error }}
            </div></template
          ></el-table-column
        >
        <el-table-column width="75"
          ><template #default="{ row }"
            ><el-button
              type="danger"
              link
              :disabled="releases.locked.value"
              @click="releases.remove(row.source.scopeId)"
              >移除</el-button
            ></template
          ></el-table-column
        >
      </el-table>
      <el-form
        label-width="80px"
        class="remark-form"
        ><el-form-item label="入库备注"
          ><el-input
            v-model="releases.remark.value"
            type="textarea"
            :rows="2"
            maxlength="500"
            show-word-limit
            :disabled="releases.locked.value" /></el-form-item
      ></el-form>
      <el-alert
        v-if="releases.command.status.value !== 'idle'"
        title="上次确认结果尚未确定，已保留原数量和依据。请核对入库历史后按原操作重试，勿重复发起新入库。"
        type="warning"
        show-icon
        :closable="false"
      />
      <template #footer>
        <el-button
          :disabled="releases.command.busy.value || releases.checking.value"
          @click="releases.close"
          >{{ releases.command.status.value === 'idle' ? '收起并保留' : '核对后关闭' }}</el-button
        >
        <el-button
          v-if="releases.command.status.value === 'pending'"
          type="primary"
          :loading="releases.command.busy.value"
          @click="releases.command.retry"
          >按原操作重试</el-button
        >
        <el-button
          v-else
          type="primary"
          :loading="releases.command.busy.value"
          :disabled="releases.locked.value || !releases.selected.value.length"
          @click="releases.submit"
          >确认实际入库</el-button
        >
      </template>
    </el-dialog>
    <PurchaseInboundHistoryDialog
      :visible="active && historyVisible"
      :history="history"
      @close="closeHistory"
    />
  </div>
</template>

<script setup lang="ts">
import { onActivated, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Refresh } from '@element-plus/icons-vue';
import { PERMISSIONS } from '@company/constants';
import { useAuthStore } from '../../../stores/auth';
import type { PurchaseInboundOrderItem } from '@company/contracts';
import { formatDateTimeForDisplay } from '../../../utils/date';
import TableToolbar from '../../../components/TableToolbar.vue';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import { formatQuantity } from '../../production/production-status';
import { usePurchaseInbounds } from '../../production/composables/usePurchaseInbounds';
import { usePurchaseInboundReleases } from '../composables/usePurchaseInboundReleases';
import PurchaseInboundHistoryDialog from './PurchaseInboundHistoryDialog.vue';

defineOptions({ name: 'PurchaseInboundPanel' });
const props = withDefaults(
  defineProps<{
    active?: boolean;
    requestedInboundId?: string | null;
    requestedReceiptLineId?: string | null;
  }>(),
  { active: true, requestedInboundId: null, requestedReceiptLineId: null },
);
const route = useRoute(),
  router = useRouter();
const auth = useAuthStore();
const goSource = async (name: string, receiptLineId: string): Promise<void> => {
  if (releases.command.locked.value || releases.checking.value) {
    EMessage.warning('请先完成当前入库操作的核对或原操作重试');
    return;
  }
  await router.push({ name, query: { receiptLineId } });
};
const view = ref('releases'),
  history = usePurchaseInbounds();
const historyKeyword = ref(''),
  historyPage = ref(1),
  historySize = ref(10),
  historyVisible = ref(false);
const currentInboundId = ref<string | null>(null);
const releases = usePurchaseInboundReleases(async (result) => {
  await loadHistory();
  await openHistory(result.inboundId);
});
const summary = (row: PurchaseInboundOrderItem) =>
  row.quantitySummary.map((item) => `${formatQuantity(item.quantity)} ${item.unit}`).join(' / ');
const loadHistory = () =>
  history.load({
    page: historyPage.value,
    pageSize: historySize.value,
    keyword: historyKeyword.value.trim() || undefined,
    status: 'completed',
  });
const searchHistory = () => {
  historyPage.value = 1;
  return loadHistory();
};
const resetHistory = () => {
  historyKeyword.value = '';
  return searchHistory();
};
const changeHistoryPage = (page: number) => {
  historyPage.value = page;
  return loadHistory();
};
const changeHistorySize = (size: number) => {
  historySize.value = size;
  return searchHistory();
};
const releasePage = (page: number) => {
  releases.page.value = page;
  return releases.load();
};
const releaseSize = (size: number) => {
  releases.pageSize.value = size;
  return releases.search();
};
const refresh = () => (view.value === 'releases' ? releases.load() : loadHistory());
const refreshActive = async (): Promise<void> => {
  await refresh();
  if (historyVisible.value && currentInboundId.value)
    await history.loadDetail(currentInboundId.value);
  if (releases.visible.value && !releases.command.locked.value) await releases.recheck(false);
};
const closeConfirmation = () => {
  void releases.close();
};
async function openHistory(id: string): Promise<void> {
  currentInboundId.value = id;
  historyVisible.value = true;
  await history.loadDetail(id);
}
function closeHistory(): void {
  historyVisible.value = false;
  currentInboundId.value = null;
  history.closeDetail();
}
let navigating = false;
async function locate(
  inboundId: string | null | undefined,
  receiptLineId: string | null | undefined,
): Promise<void> {
  if (!inboundId && !receiptLineId) return;
  if (
    inboundId === currentInboundId.value ||
    (!inboundId && receiptLineId === releases.query.receiptLineId)
  )
    return;
  const restore = async () => {
    if (route.name !== 'warehouse-inbound') return;
    if (route.query.inboundId !== inboundId && route.query.receiptLineId !== receiptLineId) return;
    await router.replace({
      query: {
        ...route.query,
        sourceType: 'purchased',
        inboundId: currentInboundId.value || undefined,
        receiptLineId: releases.query.receiptLineId || undefined,
      },
    });
  };
  if (navigating) {
    await restore();
    return;
  }
  navigating = true;
  try {
    if (releases.command.locked.value || releases.checking.value) {
      EMessage.warning('请先完成当前入库操作的核对或原操作重试');
      await restore();
      return;
    }
    if (releases.selected.value.length && !(await releases.clear())) {
      await restore();
      return;
    }
    if (inboundId !== props.requestedInboundId || receiptLineId !== props.requestedReceiptLineId)
      return;
    if (inboundId) {
      view.value = 'history';
      await Promise.all([loadHistory(), openHistory(inboundId)]);
    } else if (receiptLineId) {
      closeHistory();
      view.value = 'releases';
      releases.query.receiptLineId = receiptLineId;
      await releases.search();
    }
  } finally {
    navigating = false;
  }
}
watch(
  () => [props.requestedInboundId, props.requestedReceiptLineId] as const,
  ([id, receiptLineId]) => {
    void locate(id, receiptLineId);
  },
  { immediate: true },
);
onMounted(() => {
  if (props.active) void refreshActive();
});
watch(
  () => props.active,
  (active) => {
    if (active) void refreshActive();
  },
);
let activated = false;
onActivated(() => {
  if (activated && props.active) void refreshActive();
  activated = true;
});
</script>

<style scoped>
.purchase-inbounds {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.query-panel,
.table-panel {
  border: 1px solid var(--el-border-color);
  background: #fff;
  border-radius: 6px;
}
.query-panel {
  padding: 16px 16px 0;
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
  justify-content: space-between;
  margin: 16px 0;
}
.remark-form {
  margin-top: 16px;
}
</style>
