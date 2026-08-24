<template>
  <div class="return-orders-page">
    <section class="query-panel">
      <el-form
        class="query-form"
        :inline="true"
        :model="query"
      >
        <el-form-item label="关键词">
          <el-input
            v-model="query.keyword"
            class="keyword-input"
            clearable
            placeholder="退料单、生产批次、工单或产品"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="query.status"
            clearable
            placeholder="全部状态"
          >
            <el-option
              v-for="(label, value) in returnOrderStatusLabels"
              :key="value"
              :label="label"
              :value="value"
            />
          </el-select>
        </el-form-item>
        <el-form-item class="query-actions">
          <el-button
            type="primary"
            :loading="loading"
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
            >新增退料单</el-button
          >
        </template>
        <template #tools>
          <el-button
            :icon="Refresh"
            text
            circle
            :loading="loading"
            @click="loadRows"
          />
        </template>
      </TableToolbar>
      <el-table
        v-loading="loading"
        :data="rows"
        class="data-table"
        empty-text="暂无退料单"
      >
        <el-table-column
          prop="returnNo"
          label="退料单号"
          min-width="190"
        />
        <el-table-column
          label="生产来源"
          min-width="230"
        >
          <template #default="{ row }">
            <div class="primary-cell">{{ row.batchNo }}</div>
            <div class="secondary-cell">{{ row.workOrderNo }} · {{ row.productCode }}</div>
          </template>
        </el-table-column>
        <el-table-column
          label="退料明细"
          min-width="180"
        >
          <template #default="{ row }">{{ returnSummary(row) }}</template>
        </el-table-column>
        <el-table-column
          label="退回去向"
          width="145"
        >
          <template #default
            ><el-tag
              type="success"
              effect="plain"
              >可用公共库存</el-tag
            ></template
          >
        </el-table-column>
        <el-table-column
          label="状态"
          width="105"
        >
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)">{{ returnOrderStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column
          label="完成时间"
          width="175"
        >
          <template #default="{ row }">{{ formatDateTimeForDisplay(row.returnAt) }}</template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="265"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              @click="openDetail(row.id)"
              >详情</el-button
            >
            <el-button
              v-if="row.status === 'pending'"
              link
              type="success"
              :loading="pendingAction === `confirm:${row.id}`"
              @click="confirmOrder(row)"
              >确认退料</el-button
            >
            <el-tooltip
              content="本期不支持退料报废"
              placement="top"
            >
              <span
                ><el-button
                  v-if="row.status === 'pending'"
                  link
                  type="danger"
                  disabled
                  >退料报废</el-button
                ></span
              >
            </el-tooltip>
            <el-button
              v-if="row.status === 'pending'"
              link
              :loading="pendingAction === `cancel:${row.id}`"
              @click="cancelOrder(row)"
              >取消</el-button
            >
          </template>
        </el-table-column>
      </el-table>
      <PaginationFooter
        :total="total"
        :current-page="query.page"
        :page-size="query.pageSize"
        @update:page-size="pageSizeChanged"
        @page-change="pageChanged"
      />
    </section>

    <el-dialog
      v-model="createVisible"
      title="创建生产退料单"
      :width="DialogWidth.xl"
      :close-on-click-modal="false"
      :before-close="beforeCreateClose"
    >
      <div class="dialog-body">
        <el-alert
          title="仅可退回已确认领料的剩余物料。确认后统一进入可用公共库存，不再保留给原生产批次。"
          type="info"
          :closable="false"
        />
        <el-form
          class="create-form"
          label-width="100px"
        >
          <el-form-item
            label="生产批次"
            required
          >
            <el-select
              v-model="form.productionBatchId"
              filterable
              placeholder="选择存在已确认领料的生产批次"
              :loading="optionsLoading"
              @change="batchChanged"
              @visible-change="refreshOptions"
            >
              <el-option
                v-for="option in batchOptions"
                :key="option.productionBatchId"
                :label="`${option.batchNo} · ${option.workOrderNo} · ${option.productCode}`"
                :value="option.productionBatchId"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="退回策略">
            <el-radio-group
              model-value="public"
              disabled
            >
              <el-radio value="public">释放到公共库存</el-radio>
              <el-radio value="reserved">保留给原生产批次（暂未开放）</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="备注">
            <el-input
              v-model="form.remark"
              type="textarea"
              :rows="2"
              maxlength="5000"
            />
          </el-form-item>
        </el-form>
        <div class="detail-heading">
          <strong>选择退料明细</strong>
          <span class="secondary-cell">待确认退料单会占用可退数量</span>
        </div>
        <el-table
          v-loading="candidatesLoading"
          :data="candidates"
          class="detail-table"
          empty-text="当前批次暂无可退物料"
        >
          <el-table-column
            label="选择"
            width="64"
            align="center"
          >
            <template #default="{ row }"><el-checkbox v-model="row.selected" /></template>
          </el-table-column>
          <el-table-column
            label="物料"
            min-width="210"
          >
            <template #default="{ row }">
              <div class="primary-cell">{{ row.itemCode }} · {{ row.itemName }}</div>
              <div class="secondary-cell">库存批次 {{ row.batchCode }}</div>
            </template>
          </el-table-column>
          <el-table-column
            label="已确认领料"
            width="120"
            align="right"
          >
            <template #default="{ row }"
              >{{ quantity(row.confirmedOutboundQuantity) }} {{ row.unit }}</template
            >
          </el-table-column>
          <el-table-column
            label="已占用退料"
            width="120"
            align="right"
          >
            <template #default="{ row }"
              >{{ quantity(row.occupiedReturnQuantity) }} {{ row.unit }}</template
            >
          </el-table-column>
          <el-table-column
            label="本次退料"
            width="180"
          >
            <template #default="{ row }">
              <el-input-number
                v-model="row.returnQuantity"
                :disabled="!row.selected"
                :min="1"
                :max="Number(row.returnableQuantity)"
                :step="1"
                :precision="0"
              />
            </template>
          </el-table-column>
          <el-table-column
            label="可退数量"
            width="120"
            align="right"
          >
            <template #default="{ row }"
              >{{ quantity(row.returnableQuantity) }} {{ row.unit }}</template
            >
          </el-table-column>
        </el-table>
      </div>
      <template #footer>
        <el-button @click="closeCreate">取消</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          @click="submitCreate"
          >保存退料单</el-button
        >
      </template>
    </el-dialog>

    <el-dialog
      v-model="detailVisible"
      title="退料单详情"
      :width="DialogWidth.xl"
    >
      <div
        v-loading="detailLoading"
        class="dialog-body"
      >
        <el-descriptions
          v-if="detail"
          :column="3"
          border
        >
          <el-descriptions-item label="退料单号">{{ detail.returnNo }}</el-descriptions-item>
          <el-descriptions-item label="生产批次">{{ detail.batchNo }}</el-descriptions-item>
          <el-descriptions-item label="工单">{{ detail.workOrderNo }}</el-descriptions-item>
          <el-descriptions-item label="产品"
            >{{ detail.productCode }} · {{ detail.productName }}</el-descriptions-item
          >
          <el-descriptions-item label="状态">{{
            returnOrderStatusLabel(detail.status)
          }}</el-descriptions-item>
          <el-descriptions-item label="操作人">{{
            detail.operatorName || '-'
          }}</el-descriptions-item>
          <el-descriptions-item
            label="备注"
            :span="3"
            >{{ detail.remark || '-' }}</el-descriptions-item
          >
          <template v-if="detail.status === 'cancelled'">
            <el-descriptions-item label="取消人">{{
              detail.cancelledByName || '-'
            }}</el-descriptions-item>
            <el-descriptions-item label="取消时间">{{
              formatDateTimeForDisplay(detail.cancelledAt)
            }}</el-descriptions-item>
            <el-descriptions-item label="取消原因">{{
              detail.cancelReason || '-'
            }}</el-descriptions-item>
          </template>
        </el-descriptions>
        <el-table
          v-if="detail"
          :data="detail.details"
          class="detail-table"
        >
          <el-table-column
            prop="itemCode"
            label="物料编码"
            width="150"
          />
          <el-table-column
            prop="itemName"
            label="物料名称"
            min-width="180"
          />
          <el-table-column
            prop="batchCode"
            label="库存批次"
            min-width="150"
          />
          <el-table-column
            label="退料数量"
            width="140"
            align="right"
          >
            <template #default="{ row }"
              >{{ quantity(row.returnQuantity) }} {{ row.unit }}</template
            >
          </el-table-column>
          <el-table-column
            label="去向"
            width="140"
            ><template #default>可用公共库存</template></el-table-column
          >
          <el-table-column
            label="库存流水"
            width="120"
          >
            <template #default="{ row }">{{ row.inventoryTransactionId || '-' }}</template>
          </el-table-column>
        </el-table>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onActivated, onMounted, reactive, ref } from 'vue';
import { Plus, Refresh } from '@element-plus/icons-vue';
import type {
  ReturnOrderBatchOption,
  ReturnOrderCandidateItem,
  ReturnOrderItem,
  ReturnOrderStatus,
} from '@company/contracts';
import PaginationFooter from '../../components/PaginationFooter.vue';
import TableToolbar from '../../components/TableToolbar.vue';
import { warehouseApi } from '../../api/warehouse';
import { returnOrderStatusLabel, returnOrderStatusLabels } from '../../constants/business-status';
import { DialogWidth } from '../../utils/dialog';
import { formatDateTimeForDisplay } from '../../utils/date';
import { EMessage } from '../../utils/message';
import { RouteMessageBox } from '../../utils/route-message-box';

defineOptions({ name: 'ReturnOrdersPage' });

type CandidateRow = ReturnOrderCandidateItem & { selected: boolean; returnQuantity: number };
const query = reactive<{
  page: number;
  pageSize: number;
  keyword: string;
  status?: ReturnOrderStatus;
}>({
  page: 1,
  pageSize: 20,
  keyword: '',
});
const rows = ref<ReturnOrderItem[]>([]);
const total = ref(0);
const loading = ref(false);
const pendingAction = ref('');
const createVisible = ref(false);
const submitting = ref(false);
const optionsLoading = ref(false);
const candidatesLoading = ref(false);
const batchOptions = ref<ReturnOrderBatchOption[]>([]);
const candidates = ref<CandidateRow[]>([]);
const form = reactive({ productionBatchId: '', remark: '' });
const detailVisible = ref(false);
const detailLoading = ref(false);
const detail = ref<ReturnOrderItem | null>(null);

async function loadRows() {
  loading.value = true;
  try {
    const result = await warehouseApi.listReturnOrders({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword.trim() || undefined,
      status: query.status,
    });
    rows.value = result.items;
    total.value = result.total;
  } catch (error) {
    EMessage.error(error, '退料单加载失败');
  } finally {
    loading.value = false;
  }
}
async function refreshOptions(visible = true) {
  if (!visible) return;
  optionsLoading.value = true;
  try {
    batchOptions.value = await warehouseApi.listReturnBatchOptions();
  } catch (error) {
    EMessage.error(error, '生产批次候选加载失败');
  } finally {
    optionsLoading.value = false;
  }
}
async function batchChanged(batchId: string) {
  candidates.value = [];
  if (!batchId) return;
  candidatesLoading.value = true;
  try {
    candidates.value = (await warehouseApi.listReturnCandidates(batchId)).map((item) => ({
      ...item,
      selected: false,
      returnQuantity: Number(item.returnableQuantity),
    }));
  } catch (error) {
    EMessage.error(error, '可退物料加载失败');
  } finally {
    candidatesLoading.value = false;
  }
}
async function openCreate() {
  form.productionBatchId = '';
  form.remark = '';
  candidates.value = [];
  createVisible.value = true;
  await refreshOptions();
}
async function submitCreate() {
  const selected = candidates.value.filter((item) => item.selected);
  if (!form.productionBatchId) return EMessage.warning('请选择生产批次');
  if (!selected.length) return EMessage.warning('请至少选择一条退料明细');
  if (
    selected.some(
      (item) =>
        !Number.isInteger(item.returnQuantity) ||
        item.returnQuantity <= 0 ||
        item.returnQuantity > Number(item.returnableQuantity),
    )
  )
    return EMessage.warning('本次退料数量必须大于零且不能超过可退数量');
  submitting.value = true;
  try {
    await warehouseApi.createReturnOrder({
      productionBatchId: form.productionBatchId,
      remark: form.remark.trim() || null,
      details: selected.map((item) => ({
        allocationId: item.allocationId,
        returnQuantity: item.returnQuantity,
      })),
    });
    createVisible.value = false;
    EMessage.success('退料单已创建');
    query.page = 1;
    await loadRows();
  } catch (error) {
    EMessage.error(error, '退料单创建失败');
  } finally {
    submitting.value = false;
  }
}
async function confirmOrder(row: ReturnOrderItem) {
  try {
    await RouteMessageBox.confirm(
      `确认退回 ${returnSummary(row)}？确认后库存立即增加并释放为公共可用库存。`,
      '确认生产退料',
      { type: 'warning', confirmButtonText: '确认退料入库' },
    );
    pendingAction.value = `confirm:${row.id}`;
    await warehouseApi.confirmReturnOrder(row.id, row.version);
    EMessage.success('退料已确认，库存流水已生成');
    await loadRows();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') EMessage.error(error, '确认退料失败');
  } finally {
    pendingAction.value = '';
  }
}
async function cancelOrder(row: ReturnOrderItem) {
  try {
    const { value } = await RouteMessageBox.prompt(
      `确认取消退料单 ${row.returnNo}？请输入取消原因。`,
      '取消退料单',
      {
        type: 'warning',
        confirmButtonText: '确认取消',
        cancelButtonText: '返回',
        inputType: 'textarea',
        inputPlaceholder: '请填写取消原因',
        inputValidator: cancellationReasonValidator,
      },
    );
    pendingAction.value = `cancel:${row.id}`;
    await warehouseApi.cancelReturnOrder(row.id, { version: row.version, reason: value.trim() });
    EMessage.success('退料单已取消');
    await loadRows();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') EMessage.error(error, '取消退料单失败');
  } finally {
    pendingAction.value = '';
  }
}

const cancellationReasonValidator = (input: string) =>
  input.trim() ? input.trim().length <= 5000 || '取消原因不能超过 5000 个字符' : '请填写取消原因';
async function openDetail(id: string) {
  detail.value = null;
  detailVisible.value = true;
  detailLoading.value = true;
  try {
    detail.value = await warehouseApi.getReturnOrder(id);
  } catch (error) {
    EMessage.error(error, '退料单详情加载失败');
  } finally {
    detailLoading.value = false;
  }
}
function search() {
  query.page = 1;
  void loadRows();
}
function resetQuery() {
  query.keyword = '';
  query.status = undefined;
  search();
}
function pageSizeChanged(value: number) {
  query.pageSize = value;
  query.page = 1;
  void loadRows();
}
function pageChanged(value: number) {
  query.page = value;
  void loadRows();
}
function returnSummary(row: ReturnOrderItem) {
  const byUnit = new Map<string, number>();
  for (const line of row.details)
    byUnit.set(line.unit, (byUnit.get(line.unit) ?? 0) + Number(line.returnQuantity));
  return [...byUnit].map(([unit, value]) => `${quantity(value)} ${unit}`).join('；') || '0';
}
const quantity = (value: string | number) => Number(value).toFixed(0);
const statusTag = (status: ReturnOrderStatus) =>
  status === 'returned'
    ? 'success'
    : status === 'cancelled'
      ? 'info'
      : status === 'scrapped'
        ? 'danger'
        : 'warning';
function hasDraft() {
  return Boolean(
    form.productionBatchId || form.remark.trim() || candidates.value.some((item) => item.selected),
  );
}
async function beforeCreateClose(done: () => void) {
  if (!hasDraft()) return done();
  try {
    await RouteMessageBox.confirm('当前退料单尚未保存，确认放弃？', '放弃修改', {
      type: 'warning',
      confirmButtonText: '放弃修改',
    });
    done();
  } catch {
    // Keep editing.
  }
}
function closeCreate() {
  void beforeCreateClose(() => (createVisible.value = false));
}

onMounted(loadRows);
onActivated(() => {
  void loadRows();
  if (createVisible.value) void refreshOptions();
});
</script>

<style scoped>
.return-orders-page {
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
.query-form :deep(.el-input),
.query-form :deep(.el-select) {
  width: 220px;
}
.query-form :deep(.keyword-input) {
  width: 300px;
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
  border-bottom: 1px solid #e5e7eb;
}
.data-table {
  width: 100%;
  font-size: 14px;
}
.data-table :deep(th.el-table__cell) {
  height: 48px;
  background: #f9fafb;
  color: #1f2937;
}
.data-table :deep(.el-tag) {
  border: 0;
}
.primary-cell {
  font-weight: 500;
  color: #1f2937;
}
.secondary-cell {
  margin-top: 3px;
  color: #6b7280;
  font-size: 12px;
}
.dialog-body {
  max-height: 70vh;
  overflow-y: auto;
}
.create-form {
  margin-top: 18px;
}
.detail-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 18px 0 10px;
}
.detail-table {
  margin-top: 12px;
}
@media (max-width: 900px) {
  .query-form {
    display: grid;
    grid-template-columns: 1fr;
  }
  .query-actions {
    margin-left: 0;
  }
  .query-form :deep(.keyword-input) {
    width: 220px;
  }
}
</style>
