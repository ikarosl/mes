<template>
  <div class="outbound-orders-page">
    <section class="query-panel">
      <el-form
        class="query-form"
        :inline="true"
        :model="query"
        @submit.prevent="search"
      >
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword"
            class="keyword-input"
            clearable
            placeholder="出库单号、工单号或生产批次号"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="query.status"
            clearable
            placeholder="全部状态"
          >
            <el-option
              v-for="status in OUTBOUND_ORDER_STATUSES"
              :key="status"
              :label="OUTBOUND_ORDER_STATUS_LABELS[status]"
              :value="status"
            />
          </el-select>
        </el-form-item>
        <el-form-item class="query-actions">
          <el-button
            type="primary"
            :loading="orders.loading.value"
            @click="search"
            >查询</el-button
          >
          <el-button @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </section>

    <section class="table-panel">
      <TableToolbar>
        <template #actions>
          <el-button
            type="primary"
            :icon="Plus"
            @click="openCreate"
            >创建生产领料单</el-button
          >
        </template>
        <template #tools>
          <el-tooltip
            content="刷新"
            placement="top"
          >
            <el-button
              :icon="Refresh"
              text
              circle
              :loading="orders.loading.value"
              @click="loadRows"
            />
          </el-tooltip>
        </template>
      </TableToolbar>

      <el-table
        v-loading="orders.loading.value"
        :data="orders.rows.value"
        :row-class-name="outboundRowClass"
        class="data-table"
        empty-text="暂无生产领料出库单"
      >
        <el-table-column
          prop="outboundNo"
          label="出库单号"
          min-width="190"
        >
          <template #default="{ row }"
            ><span class="outbound-no">{{ row.outboundNo }}</span></template
          >
        </el-table-column>
        <el-table-column
          label="工单 / 生产批次"
          min-width="190"
        >
          <template #default="{ row }">
            <div>{{ row.workOrderNo }}</div>
            <div class="secondary-text">{{ row.batchNo }}</div>
          </template>
        </el-table-column>
        <el-table-column
          label="状态"
          width="160"
        >
          <template #default="{ row }">
            <el-tag
              :type="statusTag(row.status)"
              effect="light"
            >
              {{ statusLabel(row.status) }}
            </el-tag>
            <div class="status-note">{{ outboundStatusHint(row.status) }}</div>
          </template>
        </el-table-column>
        <el-table-column
          label="明细"
          width="80"
          align="center"
        >
          <template #default="{ row }">{{ row.details.length }} 条</template>
        </el-table-column>
        <el-table-column
          label="物料版本"
          min-width="190"
        >
          <template #default="{ row }">{{ variantSummary(row) }}</template>
        </el-table-column>
        <el-table-column
          label="本单数量"
          min-width="155"
        >
          <template #default="{ row }"
            ><strong class="quantity-summary">{{ quantitySummary(row) }}</strong></template
          >
        </el-table-column>
        <el-table-column
          label="制单人 / 时间"
          min-width="190"
        >
          <template #default="{ row }">
            <div>{{ row.createdByName || '-' }}</div>
            <div class="secondary-text">{{ formatTime(row.createdAt) }}</div>
          </template>
        </el-table-column>
        <el-table-column
          label="实际出库"
          min-width="190"
        >
          <template #default="{ row }">
            <div>{{ row.operatorName || '-' }}</div>
            <div class="secondary-text">
              {{ outboundTimeText(row) }}
            </div>
          </template>
        </el-table-column>
        <el-table-column
          prop="remark"
          label="备注"
          min-width="140"
          show-overflow-tooltip
        />
        <el-table-column
          label="操作"
          width="280"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              @click="openDetail(row.outboundId)"
              >详情</el-button
            >
            <el-button
              link
              type="primary"
              @click="printOrder(row.outboundId)"
              >打印</el-button
            >
            <el-button
              v-if="row.status === 'pending_picking'"
              link
              type="success"
              :loading="isPending('confirm', row.outboundId)"
              @click="confirmOrder(row)"
              >确认出库</el-button
            >
            <el-button
              v-if="row.status === 'pending_picking'"
              link
              type="danger"
              :loading="isPending('cancel', row.outboundId)"
              @click="cancelOrder(row)"
              >取消</el-button
            >
          </template>
        </el-table-column>
      </el-table>

      <PaginationFooter
        :total="orders.total.value"
        :current-page="query.page ?? 1"
        :page-size="query.pageSize ?? 10"
        @update:page-size="handlePageSizeChange"
        @page-change="handlePageChange"
      />
    </section>

    <MaterialOutboundOrderCreateDialog
      ref="createDialog"
      v-model="createVisible"
      :batch-options="orders.batchOptions.value"
      :candidates="orders.candidates.value"
      :option-loading="orders.optionLoading.value"
      :candidate-loading="orders.candidateLoading.value"
      :submitting="createSubmitting"
      :intent-status="orders.getCreateIntentStatus()"
      @load-candidates="loadCandidates"
      @reset-intent="orders.resetCreateIntent"
      @resolve-batch="resolveBlockedBatch"
      @submit="submitCreate"
    />

    <MaterialOutboundOrderDetailDialog
      v-model="detailVisible"
      :loading="orders.detailLoading.value"
      :detail="orders.detail.value"
      @print="printDetail"
    />
  </div>
</template>

<script setup lang="ts">
import { onActivated, onDeactivated, onMounted, onScopeDispose, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Plus, Refresh } from '@element-plus/icons-vue';
import type {
  CreateMaterialOutboundPayload,
  MaterialOutboundItem,
  MaterialOutboundQuery,
  OutboundOrderStatus,
} from '@company/contracts';
import { OUTBOUND_ORDER_STATUSES, OUTBOUND_ORDER_STATUS_LABELS } from '@company/constants';
import TableToolbar from '../../../components/TableToolbar.vue';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import { useTabsStore } from '../../../stores/tabs';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import { EMessage } from '../../../utils/message';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { RouteMessageBox as ElMessageBox } from '../../../utils/route-message-box';
import MaterialOutboundOrderCreateDialog from '../../production/components/MaterialOutboundOrderCreateDialog.vue';
import MaterialOutboundOrderDetailDialog from '../../production/components/MaterialOutboundOrderDetailDialog.vue';
import { useMaterialOutboundOrders } from '../../production/composables/useMaterialOutboundOrders';
import { materialDemandGroupLabel } from '../../production/material-demand-group-presentation';
import { formatQuantity } from '../../production/production-status';
import { outboundRowClass, outboundStatusHint } from '../warehouse-list-presentation';

defineOptions({ name: 'ProductionOutboundPanel' });

const orders = useMaterialOutboundOrders();
const router = useRouter();
const { canAccessRoute } = useRouteAccess();
const query = reactive<MaterialOutboundQuery>({ page: 1, pageSize: 10 });
const createVisible = ref(false);
const createSubmitting = ref(false);
const detailVisible = ref(false);
const createDialog = ref<InstanceType<typeof MaterialOutboundOrderCreateDialog> | null>(null);
const pageActive = ref(true);

const loadRows = async (): Promise<void> => {
  try {
    await orders.load({ ...query, keyword: query.keyword?.trim() || undefined });
  } catch (error) {
    if (pageActive.value) EMessage.error(error, '生产领料单列表加载失败');
  }
};
const search = () => {
  query.page = 1;
  return loadRows();
};
const resetQuery = () => {
  query.keyword = undefined;
  query.status = undefined;
  query.page = 1;
  return loadRows();
};
const resolveBlockedBatch = async (batchNo: string): Promise<void> => {
  if (!canAccessRoute({ name: 'production-tasks' })) return;
  createVisible.value = false;
  await router.push({ name: 'production-tasks', query: { keyword: batchNo } });
};
const handlePageSizeChange = (value: number) => {
  query.pageSize = value;
  query.page = 1;
  return loadRows();
};
const handlePageChange = (value: number) => {
  query.page = value;
  return loadRows();
};

const openCreate = async (): Promise<void> => {
  createVisible.value = true;
  try {
    await orders.loadBatchOptions();
  } catch (error) {
    EMessage.error(error, '生产批次候选加载失败');
  }
};
const loadCandidates = async (batchId: string): Promise<void> => {
  try {
    await orders.loadCandidates(batchId);
  } catch (error) {
    EMessage.error(error, '待出库分配行加载失败');
  }
};
const submitCreate = async (
  batchId: string,
  payload: CreateMaterialOutboundPayload,
): Promise<void> => {
  if (createSubmitting.value) return;
  createSubmitting.value = true;
  try {
    const outbound = await orders.create(batchId, payload);
    EMessage.success(`待出库单 ${outbound.outboundNo} 已创建，库存尚未扣减`);
    createVisible.value = false;
    if (pageActive.value) {
      await loadRows();
      if (pageActive.value) await openDetail(outbound.outboundId);
    }
  } catch (error) {
    EMessage.error(error, '待出库单创建失败');
  } finally {
    createSubmitting.value = false;
  }
};

const openDetail = async (outboundId: string): Promise<void> => {
  detailVisible.value = true;
  try {
    await orders.loadDetail(outboundId);
  } catch (error) {
    EMessage.error(error, '出库单详情加载失败');
  }
};
const confirmOrder = async (row: MaterialOutboundItem): Promise<void> => {
  try {
    await ElMessageBox.confirm(
      `将确认整张单据 ${row.outboundNo}。确认后每条明细立即生成负库存流水；已确认单当前不能直接取消或修改。若库存不足或分配状态变化，整单失败且不会部分扣减。`,
      '确认生产领料出库',
      { type: 'warning', confirmButtonText: '确认整单出库', cancelButtonText: '返回核对' },
    );
    const result = await orders.confirm(row);
    EMessage.success(`${result.outboundNo} 已确认，库存流水已生成`);
    await loadRows();
    if (
      pageActive.value &&
      detailVisible.value &&
      orders.detail.value?.outboundId === row.outboundId
    )
      await orders.loadDetail(row.outboundId);
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    EMessage.error(error, '整单确认失败，未产生部分库存扣减');
  }
};
const cancelOrder = async (row: MaterialOutboundItem): Promise<void> => {
  try {
    const { value } = await ElMessageBox.prompt(
      `取消 ${row.outboundNo} 后，单据和明细仍作为历史保留，不会生成库存流水；对应分配数量将恢复为可制单状态。请输入取消原因。`,
      '取消待出库单',
      cancellationPromptOptions,
    );
    await orders.cancel(row, value);
    EMessage.success('待出库单已取消，未扣减库存');
    await loadRows();
    if (
      pageActive.value &&
      detailVisible.value &&
      orders.detail.value?.outboundId === row.outboundId
    )
      await orders.loadDetail(row.outboundId);
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    EMessage.error(error, '出库单取消失败');
  }
};

const cancellationPromptOptions = {
  type: 'warning' as const,
  confirmButtonText: '确认取消',
  cancelButtonText: '返回',
  inputType: 'textarea',
  inputPlaceholder: '请填写取消原因',
  inputValidator: (input: string) =>
    input.trim() ? input.trim().length <= 5000 || '取消原因不能超过 5000 个字符' : '请填写取消原因',
};

const printOrder = async (outboundId: string): Promise<void> => {
  try {
    const detail = await orders.loadDetail(outboundId);
    if (detail && pageActive.value) printDetail(detail);
  } catch (error) {
    EMessage.error(error, '打印数据加载失败');
  }
};
const printDetail = (row: MaterialOutboundItem): void => {
  const frame = document.createElement('iframe');
  frame.dataset.printFrame = 'outbound-order';
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
    opacity: '0',
    pointerEvents: 'none',
  });
  document.body.appendChild(frame);

  const printWindow = frame.contentWindow;
  if (!printWindow) {
    frame.remove();
    EMessage.error(new Error('打印 iframe 初始化失败'), '打印初始化失败');
    return;
  }
  let cleanupTimer: number | undefined;
  const cleanup = (): void => {
    if (cleanupTimer !== undefined) window.clearTimeout(cleanupTimer);
    frame.remove();
  };
  printWindow.addEventListener('afterprint', cleanup, { once: true });
  const statusMark =
    row.status === 'cancelled'
      ? '已取消 — 不得作为有效出库凭证'
      : OUTBOUND_ORDER_STATUS_LABELS[row.status];
  printWindow.document
    .write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(row.outboundNo)}</title><style>
    body{font-family:Arial,"Microsoft YaHei",sans-serif;color:#111;padding:24px}h1{text-align:center;font-size:24px;margin:0 0 8px}.mark{text-align:center;font-size:18px;font-weight:700;margin-bottom:20px}.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:8px 20px;margin-bottom:18px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #333;padding:8px;text-align:left}th{background:#f4f4f5}.remark{margin-top:16px}.signatures{display:grid;grid-template-columns:repeat(3,1fr);gap:40px;margin-top:70px}.cancelled{color:#c00}@media print{body{padding:0}}</style></head><body>
    <h1>生产领料出库单</h1><div class="mark ${row.status === 'cancelled' ? 'cancelled' : ''}">${escapeHtml(statusMark)}</div>
    <div class="meta"><div>单号：${escapeHtml(row.outboundNo)}</div><div>工单：${escapeHtml(row.workOrderNo)}</div><div>生产批次：${escapeHtml(row.batchNo)}</div><div>产品：${escapeHtml(`${row.productCode} ${row.productName}`)}</div><div>制单时间：${escapeHtml(formatTime(row.createdAt))}</div><div>实际出库：${escapeHtml(row.outboundAt ? formatTime(row.outboundAt) : '-')}</div></div>
    <table><thead><tr><th>需求来源</th><th>基础物料编码</th><th>物料版本</th><th>物料名称</th><th>库存批次</th><th>本次数量</th><th>单位</th></tr></thead><tbody>${row.details.map((detail) => `<tr><td>${escapeHtml(materialDemandGroupLabel(detail))}</td><td>${escapeHtml(detail.itemCode)}</td><td>${escapeHtml(variantCode(detail))}</td><td>${escapeHtml(detail.itemName)}</td><td>${escapeHtml(detail.batchCode)}</td><td>${escapeHtml(formatQuantity(detail.outboundQuantity))}</td><td>${escapeHtml(detail.unit)}</td></tr>`).join('')}</tbody></table>
    <div class="remark">备注：${escapeHtml(row.remark || '-')}</div><div>制单人：${escapeHtml(row.createdByName || '-')}</div>
    <div class="signatures"><div>发料人：____________</div><div>领料人：____________</div><div>日期：____________</div></div>
    </body></html>`);
  printWindow.document.close();
  printWindow.focus();
  cleanupTimer = window.setTimeout(cleanup, 60_000);
  printWindow.print();
};

const quantitySummary = (row: MaterialOutboundItem): string =>
  row.quantitySummary.map((item) => `${formatQuantity(item.quantity)} ${item.unit}`).join('；');
const variantCode = (row: { materialVariantCode?: string | null }): string =>
  row.materialVariantCode || '未记录版本';
const variantSummary = (row: MaterialOutboundItem): string =>
  [...new Set(row.details.map((detail) => variantCode(detail)))].join('；') || '—';
const statusTag = (status: OutboundOrderStatus) => {
  if (status === 'completed') return 'success';
  if (status === 'cancelled') return 'info';
  return 'warning';
};
const statusLabel = (status: OutboundOrderStatus) => OUTBOUND_ORDER_STATUS_LABELS[status];
const isPending = (action: string, id: string) => orders.pendingKeys.value.has(`${action}:${id}`);
const formatTime = (value: string): string => formatDateTimeForDisplay(value);
const outboundTimeText = (row: MaterialOutboundItem): string => {
  if (row.outboundAt) return formatTime(row.outboundAt);
  if (row.status === 'pending_picking') return '等待确认出库';
  return '未产生出库';
};
const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>'"]/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]!,
  );

onMounted(loadRows);
let activated = false;
onActivated(() => {
  pageActive.value = true;
  if (activated) void loadRows();
  activated = true;
});
onDeactivated(() => (pageActive.value = false));
watch(detailVisible, (visible) => {
  if (!visible) orders.cancelDetailRead();
});
onScopeDispose(
  useTabsStore().registerCloseGuard('warehouse-outbound', async () => {
    if (createSubmitting.value || orders.pendingKeys.value.size) return false;
    if (createVisible.value && !(await createDialog.value?.canDiscard())) return false;
    if (orders.hasUnconfirmedConfirm()) {
      try {
        await ElMessageBox.confirm(
          '上次整单出库结果尚未确认。请先核对出库单列表；关闭标签将放弃原请求的安全重试标识。',
          '放弃未确认出库',
          { type: 'warning', confirmButtonText: '核对后仍要关闭', cancelButtonText: '继续保留' },
        );
        orders.resetConfirmIntents();
      } catch {
        return false;
      }
    }
    return true;
  }),
);
</script>

<style scoped>
.outbound-orders-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.query-panel,
.table-panel {
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  background: var(--el-bg-color);
}
.query-panel {
  padding: 16px 16px 0;
}
.query-form {
  display: flex;
  flex-wrap: wrap;
  gap: 0 20px;
}
.query-form :deep(.el-form-item) {
  margin-right: 0;
  margin-bottom: 16px;
}
.query-form :deep(.el-select) {
  width: 170px;
}
.query-form :deep(.keyword-input) {
  width: 280px;
}
.query-actions {
  margin-left: auto;
}
.table-panel {
  overflow: hidden;
}
.table-panel :deep(.table-toolbar) {
  min-height: 56px;
  align-items: center;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.data-table {
  width: 100%;
  color: var(--el-text-color-primary);
  font-size: 14px;
}
.data-table :deep(th.el-table__cell),
.data-table :deep(.el-table__row) {
  height: 48px;
}
.data-table :deep(th.el-table__cell) {
  background: var(--el-fill-color-light);
}
.data-table :deep(.el-button.is-link) {
  padding: 0;
  font-weight: 500;
}
.outbound-no,
.quantity-summary {
  color: var(--el-text-color-primary);
  font-weight: 600;
}
.status-note {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.35;
}
.data-table :deep(.status-warning-row td:first-child) {
  box-shadow: inset 3px 0 var(--el-color-warning);
}
.data-table :deep(.status-muted-row) {
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
}
.secondary-text {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
