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
          width="105"
        >
          <template #default="{ row }">
            <el-tag
              :type="statusTag(row.status)"
              effect="light"
            >
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          label="明细"
          width="80"
          align="center"
        >
          <template #default="{ row }">{{ row.details.length }}</template>
        </el-table-column>
        <el-table-column
          label="本单数量"
          min-width="155"
        >
          <template #default="{ row }">{{ quantitySummary(row) }}</template>
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
              {{ row.outboundAt ? formatTime(row.outboundAt) : '-' }}
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

      <div class="table-footer">
        <span class="total-text">共 {{ orders.total.value }} 条</span>
        <el-select
          v-model="query.pageSize"
          class="page-size-select"
          @change="handlePageSizeChange"
        >
          <el-option
            label="10条/页"
            :value="10"
          />
          <el-option
            label="20条/页"
            :value="20"
          />
          <el-option
            label="50条/页"
            :value="50"
          />
        </el-select>
        <el-pagination
          v-model:current-page="query.page"
          :total="orders.total.value"
          :page-size="query.pageSize"
          layout="prev, pager, next, jumper"
          @current-change="loadRows"
        />
      </div>
    </section>

    <MaterialOutboundOrderCreateDialog
      v-model="createVisible"
      :batch-options="orders.batchOptions.value"
      :candidates="orders.candidates.value"
      :option-loading="orders.optionLoading.value"
      :candidate-loading="orders.candidateLoading.value"
      :submitting="createSubmitting"
      :intent-status="orders.getCreateIntentStatus()"
      @load-candidates="loadCandidates"
      @reset-intent="orders.resetCreateIntent"
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
import { onActivated, onMounted, reactive, ref } from 'vue';
import { Plus, Refresh } from '@element-plus/icons-vue';
import type {
  CreateMaterialOutboundPayload,
  MaterialOutboundItem,
  MaterialOutboundQuery,
  OutboundOrderStatus,
} from '@company/contracts';
import { OUTBOUND_ORDER_STATUSES, OUTBOUND_ORDER_STATUS_LABELS } from '@company/constants';
import TableToolbar from '../../components/TableToolbar.vue';
import { EMessage } from '../../utils/message';
import { RouteMessageBox as ElMessageBox } from '../../utils/route-message-box';
import MaterialOutboundOrderCreateDialog from '../production/components/MaterialOutboundOrderCreateDialog.vue';
import MaterialOutboundOrderDetailDialog from '../production/components/MaterialOutboundOrderDetailDialog.vue';
import { useMaterialOutboundOrders } from '../production/composables/useMaterialOutboundOrders';
import { formatQuantity } from '../production/production-status';

defineOptions({ name: 'OutboundOrdersPage' });

const orders = useMaterialOutboundOrders();
const query = reactive<MaterialOutboundQuery>({ page: 1, pageSize: 20 });
const createVisible = ref(false);
const createSubmitting = ref(false);
const detailVisible = ref(false);

const loadRows = () => orders.load({ ...query, keyword: query.keyword?.trim() || undefined });
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
const handlePageSizeChange = () => {
  query.page = 1;
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
    await loadRows();
    await openDetail(outbound.outboundId);
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
    if (orders.detail.value?.outboundId === row.outboundId) await orders.loadDetail(row.outboundId);
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    EMessage.error(error, '整单确认失败，未产生部分库存扣减');
  }
};
const cancelOrder = async (row: MaterialOutboundItem): Promise<void> => {
  try {
    await ElMessageBox.confirm(
      `取消 ${row.outboundNo} 后，单据和明细仍作为历史保留，不会生成库存流水；对应分配数量将恢复为可制单状态。`,
      '取消待出库单',
      { type: 'warning', confirmButtonText: '确认取消', cancelButtonText: '返回' },
    );
    await orders.cancel(row);
    EMessage.success('待出库单已取消，未扣减库存');
    await loadRows();
    if (orders.detail.value?.outboundId === row.outboundId) await orders.loadDetail(row.outboundId);
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    EMessage.error(error, '出库单取消失败');
  }
};

const printOrder = async (outboundId: string): Promise<void> => {
  try {
    printDetail(await orders.loadDetail(outboundId));
  } catch (error) {
    EMessage.error(error, '打印数据加载失败');
  }
};
const printDetail = (row: MaterialOutboundItem): void => {
  const popup = window.open('', '_blank', 'noopener,noreferrer');
  if (!popup) {
    EMessage.warning('浏览器阻止了打印窗口，请允许弹窗后重试');
    return;
  }
  const statusMark =
    row.status === 'cancelled'
      ? '已取消 — 不得作为有效出库凭证'
      : OUTBOUND_ORDER_STATUS_LABELS[row.status];
  popup.document
    .write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(row.outboundNo)}</title><style>
    body{font-family:Arial,"Microsoft YaHei",sans-serif;color:#111;padding:24px}h1{text-align:center;font-size:24px;margin:0 0 8px}.mark{text-align:center;font-size:18px;font-weight:700;margin-bottom:20px}.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:8px 20px;margin-bottom:18px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #333;padding:8px;text-align:left}th{background:#f4f4f5}.remark{margin-top:16px}.signatures{display:grid;grid-template-columns:repeat(3,1fr);gap:40px;margin-top:70px}.cancelled{color:#c00}@media print{body{padding:0}}</style></head><body>
    <h1>生产领料出库单</h1><div class="mark ${row.status === 'cancelled' ? 'cancelled' : ''}">${escapeHtml(statusMark)}</div>
    <div class="meta"><div>单号：${escapeHtml(row.outboundNo)}</div><div>工单：${escapeHtml(row.workOrderNo)}</div><div>生产批次：${escapeHtml(row.batchNo)}</div><div>产品：${escapeHtml(`${row.productCode} ${row.productName}`)}</div><div>制单时间：${escapeHtml(formatTime(row.createdAt))}</div><div>实际出库：${escapeHtml(row.outboundAt ? formatTime(row.outboundAt) : '-')}</div></div>
    <table><thead><tr><th>物料编码</th><th>物料名称</th><th>库存批次</th><th>本次数量</th><th>单位</th></tr></thead><tbody>${row.details.map((detail) => `<tr><td>${escapeHtml(detail.itemCode)}</td><td>${escapeHtml(detail.itemName)}</td><td>${escapeHtml(detail.batchCode)}</td><td>${escapeHtml(formatQuantity(detail.outboundQuantity))}</td><td>${escapeHtml(detail.unit)}</td></tr>`).join('')}</tbody></table>
    <div class="remark">备注：${escapeHtml(row.remark || '-')}</div><div>制单人：${escapeHtml(row.createdByName || '-')}</div>
    <div class="signatures"><div>发料人：____________</div><div>领料人：____________</div><div>日期：____________</div></div>
    </body></html>`);
  popup.document.close();
  popup.focus();
  popup.print();
};

const quantitySummary = (row: MaterialOutboundItem): string =>
  row.quantitySummary.map((item) => `${formatQuantity(item.quantity)} ${item.unit}`).join('；');
const statusTag = (status: OutboundOrderStatus) =>
  status === 'completed' ? 'success' : status === 'cancelled' ? 'info' : 'warning';
const statusLabel = (status: OutboundOrderStatus) => OUTBOUND_ORDER_STATUS_LABELS[status];
const isPending = (action: string, id: string) => orders.pendingKeys.value.has(`${action}:${id}`);
const formatTime = (value: string): string =>
  new Date(value).toLocaleString('zh-CN', { hour12: false });
const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>'"]/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]!,
  );

onMounted(loadRows);
onActivated(loadRows);
</script>

<style scoped>
.outbound-orders-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.query-panel,
.table-panel {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
}
.query-panel {
  padding: 20px 20px 4px;
}
.query-form {
  display: flex;
  align-items: flex-start;
  gap: 10px 22px;
}
.query-form :deep(.el-form-item) {
  margin-right: 0;
  margin-bottom: 16px;
}
.query-form :deep(.el-form-item__label) {
  height: 34px;
  padding-right: 8px;
  color: #1f2937;
  font-size: 14px;
  font-weight: 500;
  line-height: 34px;
}
.query-form :deep(.el-input),
.query-form :deep(.el-select) {
  width: 180px;
}
.query-form :deep(.keyword-input) {
  width: 260px;
}
.query-form :deep(.el-input__wrapper),
.query-form :deep(.el-select__wrapper) {
  min-height: 34px;
  border-radius: 6px;
  box-shadow: 0 0 0 1px #e5e7eb inset;
}
.query-actions {
  margin-left: auto;
}
.query-actions :deep(.el-button) {
  min-width: 67px;
  height: 32px;
  border-radius: 6px;
}
.query-actions :deep(.el-button + .el-button) {
  margin-left: 12px;
}
.table-panel {
  overflow: hidden;
}
.table-panel :deep(.table-toolbar) {
  min-height: 56px;
  align-items: center;
  border-bottom: 1px solid #e5e7eb;
}
.table-panel :deep(.table-toolbar .el-button) {
  height: 34px;
  border-radius: 6px;
}
.data-table {
  width: 100%;
  color: #1f2937;
  font-size: 14px;
}
.data-table :deep(.el-table__header th) {
  height: 48px;
  background: #f9fafb;
  color: #1f2937;
  font-weight: 600;
}
.data-table :deep(.el-table__row) {
  height: 48px;
}
.data-table :deep(.el-table__row:hover) {
  background: #f3f4f6;
}
.data-table :deep(.el-table__cell) {
  border-bottom-color: #e5e7eb;
}
.data-table :deep(.el-tag) {
  height: 22px;
  padding: 0 10px;
  border: 0;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  line-height: 22px;
}
.data-table :deep(.el-tag--success) {
  background: #dcfce7;
  color: #22c55e;
}
.data-table :deep(.el-tag--info) {
  background: #f3f4f6;
  color: #6b7280;
}
.data-table :deep(.el-tag--warning) {
  background: #fef3c7;
  color: #f59e0b;
}
.data-table :deep(.el-button.is-link) {
  padding: 0;
  font-weight: 500;
}
.outbound-no {
  color: #1f2937;
  font-weight: 600;
}
.table-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  min-height: 56px;
  padding: 0 16px;
}
.total-text {
  color: #6b7280;
  font-size: 14px;
}
.page-size-select {
  width: 78px;
}
.page-size-select :deep(.el-select__wrapper) {
  min-height: 30px;
  padding: 0 7px;
  border-radius: 6px;
}
.table-footer :deep(.el-pagination) {
  gap: 4px;
}
.table-footer :deep(.el-pager li),
.table-footer :deep(.btn-prev),
.table-footer :deep(.btn-next) {
  min-width: 32px;
  height: 32px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}
.table-footer :deep(.el-pager li.is-active) {
  border-color: #306188;
  background: #306188;
  color: #ffffff;
}
.secondary-text {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
@media (max-width: 1000px) {
  .query-form {
    display: grid;
    grid-template-columns: repeat(2, minmax(240px, 1fr));
  }
  .query-actions {
    margin-left: 0;
  }
}
@media (max-width: 680px) {
  .query-form {
    grid-template-columns: 1fr;
  }
  .query-form :deep(.el-input),
  .query-form :deep(.el-select),
  .query-form :deep(.keyword-input) {
    width: 100%;
  }
  .table-footer {
    flex-wrap: wrap;
    justify-content: flex-start;
    padding: 12px 16px;
  }
}
</style>
