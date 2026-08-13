<template>
  <div class="stock-checks-page">
    <section class="query-panel">
      <el-form
        class="query-form"
        :inline="true"
        :model="query"
      >
        <el-form-item label="关键词">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="盘点单号"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="query.status"
            clearable
            placeholder="全部状态"
          >
            <el-option
              v-for="(label, value) in stockCheckStatusLabels"
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
            >创建盘点单</el-button
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
        empty-text="暂无盘点单"
      >
        <el-table-column
          prop="checkNo"
          label="盘点单号"
          min-width="190"
        />
        <el-table-column
          label="盘点进度"
          min-width="190"
        >
          <template #default="{ row }">
            <div>{{ row.detailCount - row.pendingCount }} / {{ row.detailCount }} 项已录入</div>
            <el-progress
              :percentage="
                row.detailCount
                  ? Math.round(((row.detailCount - row.pendingCount) / row.detailCount) * 100)
                  : 0
              "
              :stroke-width="6"
              :show-text="false"
            />
          </template>
        </el-table-column>
        <el-table-column
          label="差异"
          width="105"
          align="center"
        >
          <template #default="{ row }">
            <span :class="{ 'difference-text': row.differenceCount > 0 }"
              >{{ row.differenceCount }} 项</span
            >
          </template>
        </el-table-column>
        <el-table-column
          label="状态"
          width="105"
        >
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)">{{ stockCheckStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column
          label="盘点人"
          min-width="120"
        >
          <template #default="{ row }">{{ row.operatorName || '-' }}</template>
        </el-table-column>
        <el-table-column
          label="完成时间"
          width="175"
        >
          <template #default="{ row }">{{ formatDateTimeForDisplay(row.checkAt) }}</template>
        </el-table-column>
        <el-table-column
          prop="remark"
          label="备注"
          min-width="140"
          show-overflow-tooltip
        />
        <el-table-column
          label="操作"
          width="220"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              @click="openDetail(row.id)"
            >
              {{ row.status === 'pending' || row.status === 'counting' ? '盘点录入' : '详情' }}
            </el-button>
            <el-button
              v-if="row.status === 'pending' || row.status === 'counting'"
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
      title="创建库存盘点单"
      :width="DialogWidth.xl"
      :close-on-click-modal="false"
      :before-close="beforeCreateClose"
    >
      <div class="dialog-body">
        <el-alert
          title="创建时冻结所选库存批次与库存状态的账面数量。完成盘点前若库存流水发生变化，本单将被拒绝完成，需要重新盘点。"
          type="info"
          :closable="false"
        />
        <el-form
          class="create-form"
          label-width="90px"
        >
          <el-row :gutter="16">
            <el-col :span="12"
              ><el-form-item label="盘点单号"
                ><el-input
                  v-model="createForm.checkNo"
                  placeholder="留空由系统生成"
                  maxlength="100" /></el-form-item
            ></el-col>
            <el-col :span="12"
              ><el-form-item label="备注"
                ><el-input
                  v-model="createForm.remark"
                  maxlength="5000" /></el-form-item
            ></el-col>
          </el-row>
        </el-form>
        <div class="candidate-filter">
          <el-input
            v-model="candidateQuery.keyword"
            clearable
            placeholder="物料编码、名称或库存批次"
            @keyup.enter="searchCandidates"
          />
          <el-select
            v-model="candidateQuery.stockStatus"
            clearable
            placeholder="全部库存状态"
          >
            <el-option
              v-for="(label, value) in stockStatusLabels"
              :key="value"
              :label="label"
              :value="value"
            />
          </el-select>
          <el-button
            type="primary"
            :loading="candidatesLoading"
            @click="searchCandidates"
            >筛选</el-button
          >
          <span class="selected-count">已选 {{ selectedTargets.size }} 项</span>
        </div>
        <el-table
          v-loading="candidatesLoading"
          :data="candidateRows"
          class="detail-table"
          empty-text="暂无正库存批次"
        >
          <el-table-column
            label="选择"
            width="64"
            align="center"
          >
            <template #default="{ row }">
              <el-checkbox
                :model-value="selectedTargets.has(targetKey(row))"
                @change="toggleTarget(row, $event)"
              />
            </template>
          </el-table-column>
          <el-table-column
            label="物料"
            min-width="220"
          >
            <template #default="{ row }"
              ><div class="primary-cell">{{ row.itemCode }} · {{ row.itemName }}</div>
              <div class="secondary-cell">{{ row.batchCode }}</div></template
            >
          </el-table-column>
          <el-table-column
            label="库存状态"
            width="120"
            ><template #default="{ row }">{{
              stockStatusLabel(row.stockStatus)
            }}</template></el-table-column
          >
          <el-table-column
            label="账面数量"
            width="150"
            align="right"
            ><template #default="{ row }"
              >{{ quantity(row.systemQuantity) }} {{ row.unit }}</template
            ></el-table-column
          >
        </el-table>
        <PaginationFooter
          class="candidate-footer"
          :total="candidateTotal"
          :current-page="candidateQuery.page"
          :page-size="candidateQuery.pageSize"
          layout="prev, pager, next"
          total-suffix="项正库存"
          @update:page-size="candidatePageSizeChanged"
          @page-change="candidatePageChanged"
        />
      </div>
      <template #footer>
        <el-button @click="closeCreate">取消</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          @click="submitCreate"
          >创建并冻结账面数</el-button
        >
      </template>
    </el-dialog>

    <el-dialog
      v-model="detailVisible"
      :title="detailEditable ? '盘点录入' : '盘点单详情'"
      :width="DialogWidth.xl"
      :close-on-click-modal="false"
      :before-close="beforeDetailClose"
    >
      <div
        v-loading="detailLoading"
        class="dialog-body"
      >
        <el-alert
          v-if="detailEditable"
          title="可以分次保存实盘数量；全部录入后才能完成盘点。完成时系统会重新核对账面快照，并在同一事务内生成差异调整流水。"
          type="warning"
          :closable="false"
        />
        <el-descriptions
          v-if="detail"
          :column="3"
          border
          class="detail-descriptions"
        >
          <el-descriptions-item label="盘点单号">{{ detail.checkNo }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{
            stockCheckStatusLabel(detail.status)
          }}</el-descriptions-item>
          <el-descriptions-item label="盘点人">{{
            detail.operatorName || '-'
          }}</el-descriptions-item>
          <el-descriptions-item
            label="备注"
            :span="3"
            >{{ detail.remark || '-' }}</el-descriptions-item
          >
        </el-descriptions>
        <el-table
          v-if="detail"
          :data="countRows"
          class="detail-table"
        >
          <el-table-column
            label="物料"
            min-width="210"
            ><template #default="{ row }"
              ><div class="primary-cell">{{ row.itemCode }} · {{ row.itemName }}</div>
              <div class="secondary-cell">{{ row.batchCode }}</div></template
            ></el-table-column
          >
          <el-table-column
            label="库存状态"
            width="105"
            ><template #default="{ row }">{{
              stockStatusLabel(row.stockStatus)
            }}</template></el-table-column
          >
          <el-table-column
            label="账面数量"
            width="125"
            align="right"
            ><template #default="{ row }"
              >{{ quantity(row.systemQuantity) }} {{ row.unit }}</template
            ></el-table-column
          >
          <el-table-column
            label="实盘数量"
            width="175"
          >
            <template #default="{ row }">
              <el-input-number
                v-if="detailEditable"
                v-model="row.actualQuantity"
                :min="0"
                :precision="4"
                @change="detailDirty = true"
              />
              <span v-else>{{
                row.actualQuantity === null ? '-' : `${quantity(row.actualQuantity)} ${row.unit}`
              }}</span>
            </template>
          </el-table-column>
          <el-table-column
            label="差异"
            width="115"
            align="right"
          >
            <template #default="{ row }"
              ><span :class="differenceClass(row)">{{ differenceText(row) }}</span></template
            >
          </el-table-column>
          <el-table-column
            label="结果"
            width="90"
          >
            <template #default="{ row }"
              ><el-tag
                v-if="localResult(row)"
                :type="localResult(row) === 'matched' ? 'success' : 'danger'"
                effect="plain"
                >{{ stockCheckResultLabel(localResult(row)!) }}</el-tag
              ><span v-else>-</span></template
            >
          </el-table-column>
          <el-table-column
            label="备注"
            min-width="150"
          >
            <template #default="{ row }"
              ><el-input
                v-if="detailEditable"
                v-model="row.remark"
                maxlength="5000"
                @input="detailDirty = true"
              /><span v-else>{{ row.remark || '-' }}</span></template
            >
          </el-table-column>
        </el-table>
      </div>
      <template #footer>
        <el-button @click="closeDetail">关闭</el-button>
        <el-button
          v-if="detailEditable"
          :loading="saving"
          @click="saveCounts"
          >保存实盘数</el-button
        >
        <el-button
          v-if="detailEditable"
          type="primary"
          :disabled="detailDirty || !allCounted"
          :loading="completing"
          @click="completeOrder"
          >完成盘点并调整库存</el-button
        >
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, reactive, ref } from 'vue';
import { Plus, Refresh } from '@element-plus/icons-vue';
import type {
  StockCheckCandidateItem,
  StockCheckDetailItem,
  StockCheckOrderItem,
  StockCheckResult,
  StockCheckStatus,
  StockStatus,
} from '@company/contracts';
import PaginationFooter from '../../components/PaginationFooter.vue';
import TableToolbar from '../../components/TableToolbar.vue';
import { warehouseApi } from '../../api/warehouse';
import {
  stockCheckResultLabel,
  stockCheckStatusLabel,
  stockCheckStatusLabels,
  stockStatusLabel,
  stockStatusLabels,
} from '../../constants/business-status';
import { DialogWidth } from '../../utils/dialog';
import { formatDateTimeForDisplay } from '../../utils/date';
import { EMessage } from '../../utils/message';
import { RouteMessageBox } from '../../utils/route-message-box';

defineOptions({ name: 'StockChecksPage' });

type CountRow = Omit<StockCheckDetailItem, 'actualQuantity'> & { actualQuantity: number | null };
const query = reactive<{
  page: number;
  pageSize: number;
  keyword: string;
  status?: StockCheckStatus;
}>({ page: 1, pageSize: 20, keyword: '' });
const rows = ref<StockCheckOrderItem[]>([]);
const total = ref(0);
const loading = ref(false);
const pendingAction = ref('');
const createVisible = ref(false);
const submitting = ref(false);
const createForm = reactive({ checkNo: '', remark: '' });
const candidateQuery = reactive<{
  page: number;
  pageSize: number;
  keyword: string;
  stockStatus?: StockStatus;
}>({ page: 1, pageSize: 10, keyword: '' });
const candidateRows = ref<StockCheckCandidateItem[]>([]);
const candidateTotal = ref(0);
const candidatesLoading = ref(false);
const selectedTargets = ref(new Map<string, StockCheckCandidateItem>());
const detailVisible = ref(false);
const detailLoading = ref(false);
const detail = ref<StockCheckOrderItem | null>(null);
const countRows = ref<CountRow[]>([]);
const detailDirty = ref(false);
const saving = ref(false);
const completing = ref(false);
const detailEditable = computed(
  () => detail.value?.status === 'pending' || detail.value?.status === 'counting',
);
const allCounted = computed(
  () => countRows.value.length > 0 && countRows.value.every((row) => row.actualQuantity !== null),
);

async function loadRows() {
  loading.value = true;
  try {
    const result = await warehouseApi.listStockChecks({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword.trim() || undefined,
      status: query.status,
    });
    rows.value = result.items;
    total.value = result.total;
  } catch (error) {
    EMessage.error(error, '盘点单加载失败');
  } finally {
    loading.value = false;
  }
}
async function loadCandidates() {
  candidatesLoading.value = true;
  try {
    const result = await warehouseApi.listStockCheckCandidates({
      page: candidateQuery.page,
      pageSize: candidateQuery.pageSize,
      keyword: candidateQuery.keyword.trim() || undefined,
      stockStatus: candidateQuery.stockStatus,
    });
    candidateRows.value = result.items;
    candidateTotal.value = result.total;
  } catch (error) {
    EMessage.error(error, '库存批次候选加载失败');
  } finally {
    candidatesLoading.value = false;
  }
}
function openCreate() {
  createForm.checkNo = '';
  createForm.remark = '';
  candidateQuery.page = 1;
  candidateQuery.keyword = '';
  candidateQuery.stockStatus = undefined;
  selectedTargets.value = new Map();
  createVisible.value = true;
  void loadCandidates();
}
function targetKey(row: StockCheckCandidateItem) {
  return `${row.itemBatchId}:${row.stockStatus}`;
}
function toggleTarget(row: StockCheckCandidateItem, checked: string | number | boolean) {
  const next = new Map(selectedTargets.value);
  if (checked) next.set(targetKey(row), row);
  else next.delete(targetKey(row));
  selectedTargets.value = next;
}
function searchCandidates() {
  candidateQuery.page = 1;
  void loadCandidates();
}
function candidatePageSizeChanged(value: number) {
  candidateQuery.pageSize = value;
  candidateQuery.page = 1;
  void loadCandidates();
}
function candidatePageChanged(value: number) {
  candidateQuery.page = value;
  void loadCandidates();
}
async function submitCreate() {
  if (!selectedTargets.value.size) return EMessage.warning('请至少选择一个库存批次与库存状态');
  submitting.value = true;
  try {
    await warehouseApi.createStockCheck({
      checkNo: createForm.checkNo.trim() || null,
      remark: createForm.remark.trim() || null,
      details: [...selectedTargets.value.values()].map((row) => ({
        itemBatchId: row.itemBatchId,
        stockStatus: row.stockStatus,
      })),
    });
    createVisible.value = false;
    EMessage.success('盘点单已创建，账面数量已冻结');
    query.page = 1;
    await loadRows();
  } catch (error) {
    EMessage.error(error, '盘点单创建失败');
  } finally {
    submitting.value = false;
  }
}
async function openDetail(id: string) {
  detail.value = null;
  countRows.value = [];
  detailDirty.value = false;
  detailVisible.value = true;
  detailLoading.value = true;
  try {
    applyDetail(await warehouseApi.getStockCheck(id));
  } catch (error) {
    EMessage.error(error, '盘点单详情加载失败');
  } finally {
    detailLoading.value = false;
  }
}
function applyDetail(value: StockCheckOrderItem) {
  detail.value = value;
  countRows.value = value.details.map((row) => ({
    ...row,
    actualQuantity: row.actualQuantity === null ? null : Number(row.actualQuantity),
  }));
  detailDirty.value = false;
}
async function saveCounts() {
  if (!detail.value) return;
  const entered = countRows.value.filter((row) => row.actualQuantity !== null);
  if (!entered.length) return EMessage.warning('请至少录入一项实盘数量');
  saving.value = true;
  try {
    applyDetail(
      await warehouseApi.saveStockCheckCounts(detail.value.id, {
        version: detail.value.version,
        details: entered.map((row) => ({
          detailId: row.id,
          actualQuantity: row.actualQuantity!,
          remark: row.remark?.trim() || null,
        })),
      }),
    );
    EMessage.success('实盘数量已保存');
    await loadRows();
  } catch (error) {
    EMessage.error(error, '实盘数量保存失败');
  } finally {
    saving.value = false;
  }
}
async function completeOrder() {
  if (!detail.value || !allCounted.value || detailDirty.value) return;
  try {
    await RouteMessageBox.confirm(
      `确认完成盘点单 ${detail.value.checkNo}？系统将重新核对库存快照，并立即生成 ${differenceCount()} 项差异调整流水。`,
      '完成库存盘点',
      { type: 'warning', confirmButtonText: '完成并调整库存' },
    );
    completing.value = true;
    applyDetail(await warehouseApi.completeStockCheck(detail.value.id, detail.value.version));
    EMessage.success('盘点已完成，库存差异已同步调整');
    await loadRows();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') EMessage.error(error, '完成盘点失败');
  } finally {
    completing.value = false;
  }
}
async function cancelOrder(row: StockCheckOrderItem) {
  try {
    await RouteMessageBox.confirm(
      `确认取消盘点单 ${row.checkNo}？已录入的实盘数量将不再生效。`,
      '取消盘点单',
      { type: 'warning', confirmButtonText: '确认取消' },
    );
    pendingAction.value = `cancel:${row.id}`;
    await warehouseApi.cancelStockCheck(row.id, row.version);
    EMessage.success('盘点单已取消');
    await loadRows();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') EMessage.error(error, '取消盘点单失败');
  } finally {
    pendingAction.value = '';
  }
}
function localResult(row: CountRow): StockCheckResult | null {
  if (row.actualQuantity === null) return null;
  const difference = row.actualQuantity - Number(row.systemQuantity);
  return Math.abs(difference) < 0.00001 ? 'matched' : difference > 0 ? 'surplus' : 'shortage';
}
function differenceText(row: CountRow) {
  if (row.actualQuantity === null) return '-';
  const value = row.actualQuantity - Number(row.systemQuantity);
  return `${value > 0 ? '+' : ''}${quantity(value)}`;
}
function differenceClass(row: CountRow) {
  return localResult(row) && localResult(row) !== 'matched' ? 'difference-text' : '';
}
function differenceCount() {
  return countRows.value.filter(
    (row) => localResult(row) !== null && localResult(row) !== 'matched',
  ).length;
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
const quantity = (value: string | number) =>
  Number(value)
    .toFixed(4)
    .replace(/\.?0+$/, '');
const statusTag = (status: StockCheckStatus) =>
  status === 'completed'
    ? 'success'
    : status === 'cancelled'
      ? 'info'
      : status === 'counting'
        ? 'primary'
        : 'warning';
function createHasDraft() {
  return Boolean(
    createForm.checkNo.trim() || createForm.remark.trim() || selectedTargets.value.size,
  );
}
async function beforeCreateClose(done: () => void) {
  if (!createHasDraft()) return done();
  try {
    await RouteMessageBox.confirm('当前盘点单尚未创建，确认放弃？', '放弃修改', {
      type: 'warning',
      confirmButtonText: '放弃修改',
    });
    done();
  } catch {
    /* Keep editing. */
  }
}
function closeCreate() {
  void beforeCreateClose(() => (createVisible.value = false));
}
async function beforeDetailClose(done: () => void) {
  if (!detailDirty.value) return done();
  try {
    await RouteMessageBox.confirm('实盘数量尚未保存，确认放弃修改？', '放弃修改', {
      type: 'warning',
      confirmButtonText: '放弃修改',
    });
    done();
  } catch {
    /* Keep editing. */
  }
}
function closeDetail() {
  void beforeDetailClose(() => (detailVisible.value = false));
}

onMounted(loadRows);
onActivated(loadRows);
</script>

<style scoped>
.stock-checks-page {
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
.difference-text {
  color: #ef4444;
  font-weight: 600;
}
.dialog-body {
  max-height: 70vh;
  overflow-y: auto;
}
.create-form {
  margin-top: 18px;
}
.create-form :deep(.el-row) {
  margin-right: 0 !important;
  margin-left: 0 !important;
}
.create-form :deep(.el-col:first-child) {
  padding-left: 0 !important;
}
.create-form :deep(.el-col:last-child) {
  padding-right: 0 !important;
}
.candidate-filter {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 180px auto auto;
  gap: 8px;
  align-items: center;
  margin: 4px 0 12px;
}
.selected-count {
  color: #306188;
  font-weight: 500;
  text-align: right;
}
.candidate-footer {
  margin-top: 12px;
  padding: 0;
}
.detail-descriptions {
  margin-top: 16px;
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
  .candidate-filter {
    grid-template-columns: 1fr;
  }
  .selected-count {
    text-align: left;
  }
}
</style>
