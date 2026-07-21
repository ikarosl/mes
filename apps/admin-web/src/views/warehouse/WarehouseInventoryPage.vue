<template>
  <div>
    <div class="page-title">
      <div>
        <h2>库存查询</h2>
        <p>按物料、批次、库存状态查询实时库存</p>
      </div>
    </div>

    <div class="query-panel">
      <el-form
        class="query-form"
        :inline="true"
        :model="query"
      >
        <el-form-item label="物料">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="名称或编码"
          />
        </el-form-item>
        <el-form-item label="批次号">
          <el-input
            v-model="query.batchCode"
            clearable
            placeholder="库存批次号"
          />
        </el-form-item>
        <el-form-item label="批次状态">
          <el-select
            v-model="query.batchStatus"
            placeholder="全部"
            clearable
          >
            <el-option
              label="全部"
              value=""
            />
            <el-option
              label="可用"
              value="可用"
            />
            <el-option
              label="冻结"
              value="冻结"
            />
            <el-option
              label="停用"
              value="停用"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="库存状态">
          <el-select
            v-model="query.stockStatus"
            placeholder="全部"
            clearable
          >
            <el-option
              label="全部"
              value=""
            />
            <el-option
              label="可用"
              value="可用"
            />
            <el-option
              label="待检"
              value="待检"
            />
            <el-option
              label="冻结"
              value="冻结"
            />
            <el-option
              label="不良"
              value="不良"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="对象大类">
          <el-select
            v-model="query.itemKind"
            placeholder="全部"
            clearable
          >
            <el-option
              label="全部"
              value=""
            />
            <el-option
              label="物料"
              value="material"
            />
            <el-option
              label="半成品"
              value="semi_finished"
            />
            <el-option
              label="成品"
              value="finished_product"
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
    </div>

    <div class="table-panel">
      <div class="table-toolbar">
        <div class="table-tools">
          <el-tooltip
            content="刷新"
            placement="top"
          >
            <el-button
              :icon="Refresh"
              text
              circle
              :loading="loading"
              @click="loadRows"
            />
          </el-tooltip>
        </div>
      </div>

      <el-table
        v-loading="loading"
        :data="rows"
        class="data-table"
      >
        <el-table-column
          label="库存对象"
          min-width="180"
        >
          <template #default="{ row }">
            <div class="item-name">{{ row.itemName }}</div>
            <div class="sub-text">{{ row.itemCode }}</div>
          </template>
        </el-table-column>
        <el-table-column
          label="类型"
          width="120"
        >
          <template #default="{ row }">
            <el-tag
              size="small"
              effect="plain"
              >{{ kindLabel(row.itemKind) }}</el-tag
            >
          </template>
        </el-table-column>
        <el-table-column
          prop="batchCode"
          label="批次号"
          min-width="170"
        />
        <el-table-column
          label="来源"
          width="140"
        >
          <template #default="{ row }">{{ row.sourceType || '-' }}</template>
        </el-table-column>
        <el-table-column
          label="供应商"
          min-width="140"
        >
          <template #default="{ row }">{{ row.provider || '-' }}</template>
        </el-table-column>
        <el-table-column
          label="可用数量"
          width="120"
          align="right"
        >
          <template #default="{ row }">
            <span :class="{ 'danger-text': Number(row.availableQuantity) < 0 }">
              {{ formatQuantity(row.availableQuantity) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column
          label="待检数量"
          width="110"
          align="right"
        >
          <template #default="{ row }">{{ formatQuantity(row.pendingQuantity) }}</template>
        </el-table-column>
        <el-table-column
          label="冻结数量"
          width="110"
          align="right"
        >
          <template #default="{ row }">{{ formatQuantity(row.frozenQuantity) }}</template>
        </el-table-column>
        <el-table-column
          label="不良数量"
          width="110"
          align="right"
        >
          <template #default="{ row }">{{ formatQuantity(row.defectiveQuantity) }}</template>
        </el-table-column>
        <el-table-column
          label="合计"
          width="110"
          align="right"
        >
          <template #default="{ row }">{{ formatQuantity(row.totalQuantity) }}</template>
        </el-table-column>
        <el-table-column
          label="批次状态"
          width="112"
        >
          <template #default="{ row }">
            <el-tag
              :type="
                row.batchStatus === '可用'
                  ? 'success'
                  : row.batchStatus === '冻结'
                    ? 'warning'
                    : 'info'
              "
              effect="light"
            >
              {{ row.batchStatus }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="140"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              @click="openDetail(row)"
              >查看</el-button
            >
          </template>
        </el-table-column>
      </el-table>

      <div class="table-footer">
        <span class="total-text">共 {{ total }} 条</span>
        <el-select
          v-model="pageSize"
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
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="total"
          layout="prev, pager, next, jumper"
          @current-change="loadRows"
        />
      </div>
    </div>

    <el-dialog
      v-model="detailVisible"
      title="批次详情"
      :width="DialogWidth.lg"
    >
      <el-descriptions
        v-if="detailRow"
        :column="2"
        border
      >
        <el-descriptions-item label="对象名称">{{ detailRow.itemName }}</el-descriptions-item>
        <el-descriptions-item label="对象编码">{{ detailRow.itemCode }}</el-descriptions-item>
        <el-descriptions-item label="对象大类">{{
          kindLabel(detailRow.itemKind)
        }}</el-descriptions-item>
        <el-descriptions-item label="批次号">{{ detailRow.batchCode }}</el-descriptions-item>
        <el-descriptions-item label="来源类型">{{ detailRow.sourceType }}</el-descriptions-item>
        <el-descriptions-item label="供应商">{{ detailRow.provider || '-' }}</el-descriptions-item>
        <el-descriptions-item label="可用数量">{{
          formatQuantity(detailRow.availableQuantity)
        }}</el-descriptions-item>
        <el-descriptions-item label="待检数量">{{
          formatQuantity(detailRow.pendingQuantity)
        }}</el-descriptions-item>
        <el-descriptions-item label="冻结数量">{{
          formatQuantity(detailRow.frozenQuantity)
        }}</el-descriptions-item>
        <el-descriptions-item label="不良数量">{{
          formatQuantity(detailRow.defectiveQuantity)
        }}</el-descriptions-item>
        <el-descriptions-item label="合计数量">{{
          formatQuantity(detailRow.totalQuantity)
        }}</el-descriptions-item>
        <el-descriptions-item label="批次状态">
          <el-tag
            :type="detailRow.batchStatus === '可用' ? 'success' : 'info'"
            effect="light"
          >
            {{ detailRow.batchStatus }}
          </el-tag>
        </el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import { DialogWidth } from '../../utils/dialog';
// TODO(api-integration): 待接入操作类接口后启用 EMessage 提示
import { EMessage } from '../../utils/message';

defineOptions({ name: 'WarehouseInventoryPage' });

interface InventoryItem {
  id: string;
  itemCode: string;
  itemName: string;
  itemKind: string;
  batchCode: string;
  sourceType: string;
  provider: string;
  availableQuantity: string;
  pendingQuantity: string;
  frozenQuantity: string;
  defectiveQuantity: string;
  totalQuantity: string;
  batchStatus: string;
}

const demoRows: InventoryItem[] = [
  {
    id: '1',
    itemCode: 'MAT-001',
    itemName: '原材料A',
    itemKind: 'material',
    batchCode: 'BATCH-A1',
    sourceType: '外购',
    provider: '供应商A',
    availableQuantity: '500.0000',
    pendingQuantity: '100.0000',
    frozenQuantity: '0.0000',
    defectiveQuantity: '0.0000',
    totalQuantity: '600.0000',
    batchStatus: '可用',
  },
  {
    id: '2',
    itemCode: 'MAT-002',
    itemName: '原材料B',
    itemKind: 'material',
    batchCode: 'BATCH-B1',
    sourceType: '外购',
    provider: '供应商B',
    availableQuantity: '300.0000',
    pendingQuantity: '0.0000',
    frozenQuantity: '50.0000',
    defectiveQuantity: '10.0000',
    totalQuantity: '360.0000',
    batchStatus: '可用',
  },
  {
    id: '3',
    itemCode: 'SEMI-001',
    itemName: '半成品X',
    itemKind: 'semi_finished',
    batchCode: 'BATCH-S1',
    sourceType: '自产',
    provider: '',
    availableQuantity: '200.0000',
    pendingQuantity: '50.0000',
    frozenQuantity: '0.0000',
    defectiveQuantity: '0.0000',
    totalQuantity: '250.0000',
    batchStatus: '可用',
  },
  {
    id: '4',
    itemCode: 'FP-001',
    itemName: '成品Z',
    itemKind: 'finished_product',
    batchCode: 'BATCH-F1',
    sourceType: '自产',
    provider: '',
    availableQuantity: '150.0000',
    pendingQuantity: '0.0000',
    frozenQuantity: '0.0000',
    defectiveQuantity: '0.0000',
    totalQuantity: '150.0000',
    batchStatus: '冻结',
  },
  {
    id: '5',
    itemCode: 'MAT-003',
    itemName: '化学品C',
    itemKind: 'material',
    batchCode: 'BATCH-C1',
    sourceType: '外购',
    provider: '供应商C',
    availableQuantity: '0.0000',
    pendingQuantity: '0.0000',
    frozenQuantity: '80.0000',
    defectiveQuantity: '20.0000',
    totalQuantity: '100.0000',
    batchStatus: '停用',
  },
];

const rows = ref<InventoryItem[]>([...demoRows]);
const detailRow = ref<InventoryItem | null>(null);
const loading = ref(false);
const total = ref(5);
const currentPage = ref(1);
const pageSize = ref(10);
const detailVisible = ref(false);

const query = reactive({
  keyword: '',
  batchCode: '',
  batchStatus: '',
  stockStatus: '',
  itemKind: '',
});

const kindLabel = (kind: string) => {
  const map: Record<string, string> = {
    material: '物料',
    semi_finished: '半成品',
    finished_product: '成品',
  };
  return map[kind] ?? kind;
};

const loadRows = async () => {
  loading.value = true;
  setTimeout(() => {
    const kw = query.keyword.trim().toLowerCase();
    const bc = query.batchCode.trim().toLowerCase();
    const bs = query.batchStatus;
    const ss = query.stockStatus;
    const ik = query.itemKind;
    let filtered = [...demoRows];
    if (kw)
      filtered = filtered.filter(
        (r) => r.itemName.toLowerCase().includes(kw) || r.itemCode.toLowerCase().includes(kw),
      );
    if (bc) filtered = filtered.filter((r) => r.batchCode.toLowerCase().includes(bc));
    if (bs) filtered = filtered.filter((r) => r.batchStatus === bs);
    if (ss) filtered = filtered.filter((r) => r.availableQuantity !== undefined); // simulates stockStatus filter
    if (ik) filtered = filtered.filter((r) => r.itemKind === ik);
    rows.value = filtered;
    total.value = filtered.length;
    loading.value = false;
  }, 300);
};

const search = async () => {
  currentPage.value = 1;
  await loadRows();
};

const resetQuery = async () => {
  query.keyword = '';
  query.batchCode = '';
  query.batchStatus = '';
  query.stockStatus = '';
  query.itemKind = '';
  currentPage.value = 1;
  await loadRows();
};

const handlePageSizeChange = async () => {
  currentPage.value = 1;
  await loadRows();
};

const openDetail = (row: InventoryItem) => {
  detailRow.value = row;
  detailVisible.value = true;
};

const formatQuantity = (value: string | number | null) => {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return '-';
  return amount.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
};

onMounted(loadRows);
</script>

<style scoped>
.page-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.page-title h2 {
  margin: 0;
  color: #283a50;
  font-size: 20px;
  font-weight: 600;
}
.page-title p {
  margin: 4px 0 0;
  color: #6b7280;
  font-size: 14px;
}

.query-panel,
.table-panel {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
}
.query-panel {
  padding: 20px 20px 8px;
  margin-bottom: 16px;
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
  width: 142px;
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
.table-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  height: 56px;
  padding: 0 16px;
  border-bottom: 1px solid #e5e7eb;
}
.table-tools {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #6b7280;
}
.table-tools :deep(.el-button) {
  width: 20px;
  height: 20px;
  color: #6b7280;
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
.item-name {
  color: #1f2937;
  font-weight: 600;
}
.sub-text {
  margin-top: 2px;
  color: #6b7280;
  font-size: 12px;
}
.danger-text {
  color: #ef4444;
  font-weight: 600;
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
.data-table :deep(.el-tag--danger) {
  background: #fce8e8;
  color: #ef4444;
}
.data-table :deep(.el-button.is-link) {
  padding: 0;
  font-weight: 500;
}

.table-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  height: 56px;
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

.dialog-form :deep(.el-select),
.dialog-form :deep(.el-input) {
  width: 100%;
}
</style>
