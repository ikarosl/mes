<template>
  <div>
    <div class="query-panel">
      <el-form
        class="query-form"
        :inline="true"
        :model="query"
      >
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="单号或供应商"
          />
        </el-form-item>
        <el-form-item label="来源">
          <el-select
            v-model="query.sourceType"
            placeholder="全部"
            clearable
          >
            <el-option
              label="全部"
              value=""
            />
            <el-option
              v-for="(label, value) in inventorySourceTypeLabels"
              :key="value"
              :label="label"
              :value="value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="query.status"
            placeholder="全部"
            clearable
          >
            <el-option
              label="全部"
              value=""
            />
            <el-option
              v-for="(label, value) in inboundOrderStatusLabels"
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
    </div>

    <div class="table-panel">
      <TableToolbar>
        <template #actions>
          <el-button
            type="primary"
            :icon="Plus"
            @click="openCreate"
            >新增入库单</el-button
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
              :loading="loading"
              @click="loadRows"
            />
          </el-tooltip>
        </template>
      </TableToolbar>

      <el-table
        v-loading="loading"
        :data="rows"
        class="data-table"
      >
        <el-table-column
          prop="inboundNo"
          label="入库单号"
          width="180"
        />
        <el-table-column
          label="来源"
          width="100"
        >
          <template #default="{ row }">{{ inventorySourceTypeLabel(row.sourceType) }}</template>
        </el-table-column>
        <el-table-column
          prop="provider"
          label="供应商"
          width="150"
        >
          <template #default="{ row }">{{ row.provider || '-' }}</template>
        </el-table-column>
        <el-table-column
          label="状态"
          width="100"
        >
          <template #default="{ row }">
            <el-tag
              :type="
                row.status === 'completed'
                  ? 'success'
                  : row.status === 'cancelled'
                    ? 'info'
                    : 'warning'
              "
              effect="light"
              >{{ inboundOrderStatusLabel(row.status) }}</el-tag
            >
          </template>
        </el-table-column>
        <el-table-column
          label="明细数"
          width="80"
          align="center"
        >
          <template #default="{ row }">{{ row.detailCount }}</template>
        </el-table-column>
        <el-table-column
          label="入库数量"
          width="130"
          align="right"
        >
          <template #default="{ row }">{{ formatQuantity(row.totalInboundNumber) }}</template>
        </el-table-column>
        <el-table-column
          label="入库时间"
          width="170"
        >
          <template #default="{ row }">{{
            row.inboundAt ? formatTime(row.inboundAt) : '-'
          }}</template>
        </el-table-column>
        <el-table-column
          prop="remark"
          label="备注"
          min-width="140"
          show-overflow-tooltip
        />
        <el-table-column
          label="操作"
          width="240"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              @click="openDetail(row)"
              >详情</el-button
            >
            <el-button
              v-if="row.status === 'pending'"
              link
              type="success"
              @click="handleConfirm(row)"
              >确认</el-button
            >
            <el-button
              v-if="row.status === 'pending'"
              link
              type="danger"
              @click="handleCancel(row)"
              >取消</el-button
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
          /><el-option
            label="20条/页"
            :value="20"
          /><el-option
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
      v-model="createVisible"
      title="新增入库单"
      :width="DialogWidth.lg"
    >
      <el-form
        class="dialog-form"
        label-width="100px"
        :model="createForm"
      >
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="入库单号"
              ><el-input
                v-model="createForm.inboundNo"
                placeholder="留空自动生成"
            /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item
              label="来源类型"
              required
            >
              <el-select
                v-model="createForm.sourceType"
                placeholder="请选择"
                style="width: 100%"
              >
                <el-option
                  v-for="(label, value) in inventorySourceTypeLabels"
                  :key="value"
                  :label="label"
                  :value="value"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12"
            ><el-form-item label="供应商"><el-input v-model="createForm.provider" /></el-form-item
          ></el-col>
        </el-row>
        <el-form-item label="备注"
          ><el-input
            v-model="createForm.remark"
            type="textarea"
            :rows="2"
        /></el-form-item>
        <el-divider>入库明细</el-divider>
        <div
          v-for="(d, i) in createForm.details"
          :key="i"
          class="detail-row"
        >
          <el-row
            :gutter="8"
            align="middle"
          >
            <el-col :span="6"
              ><el-input
                v-model="d.itemId"
                placeholder="库存对象ID"
                size="small"
            /></el-col>
            <el-col :span="5"
              ><el-input
                v-model="d.batchCode"
                placeholder="批次号"
                size="small"
            /></el-col>
            <el-col :span="5"
              ><el-input-number
                v-model="d.inboundNumber"
                :min="0.0001"
                :precision="4"
                size="small"
                style="width: 100%"
            /></el-col>
            <el-col :span="5">
              <el-select
                v-model="d.stockStatus"
                placeholder="状态"
                size="small"
                style="width: 100%"
              >
                <el-option
                  v-for="(label, value) in stockStatusLabels"
                  :key="value"
                  :label="label"
                  :value="value"
                />
              </el-select>
            </el-col>
            <el-col :span="2">
              <el-button
                link
                type="danger"
                :icon="Delete"
                size="small"
                @click="removeDetail(i)"
              />
            </el-col>
          </el-row>
        </div>
        <el-button
          size="small"
          @click="addDetail"
          >+ 添加行</el-button
        >
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          @click="submitCreate"
          >保存</el-button
        >
      </template>
    </el-dialog>

    <el-dialog
      v-model="detailVisible"
      title="入库单详情"
      :width="DialogWidth.lg"
    >
      <el-descriptions
        v-if="detailRow"
        :column="2"
        border
      >
        <el-descriptions-item label="单号">{{ detailRow.inboundNo }}</el-descriptions-item>
        <el-descriptions-item label="来源">{{
          inventorySourceTypeLabels[detailRow.sourceType]
        }}</el-descriptions-item>
        <el-descriptions-item label="供应商">{{ detailRow.provider || '-' }}</el-descriptions-item>
        <el-descriptions-item label="状态"
          ><el-tag :type="detailRow.status === 'completed' ? 'success' : 'info'">{{
            inboundOrderStatusLabels[detailRow.status]
          }}</el-tag></el-descriptions-item
        >
        <el-descriptions-item label="入库时间">{{
          detailRow.inboundAt ? formatTime(detailRow.inboundAt) : '-'
        }}</el-descriptions-item>
        <el-descriptions-item label="备注">{{ detailRow.remark || '-' }}</el-descriptions-item>
      </el-descriptions>
      <el-table
        v-if="detailDetails.length"
        :data="detailDetails"
        style="margin-top: 16px"
        class="data-table"
      >
        <el-table-column
          prop="itemCode"
          label="对象编码"
          width="140"
        />
        <el-table-column
          prop="itemName"
          label="名称"
          width="160"
        />
        <el-table-column
          prop="batchCode"
          label="批次号"
          width="140"
        />
        <el-table-column
          prop="inboundNumber"
          label="数量"
          width="120"
          align="right"
        />
        <el-table-column
          label="库存状态"
          width="100"
        >
          <template #default="{ row }">{{ stockStatusLabel(row.stockStatus) }}</template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessageBox } from 'element-plus';
import { Delete, Plus, Refresh } from '@element-plus/icons-vue';
import type { InboundOrderStatus, InventorySourceType, StockStatus } from '@company/contracts';
import TableToolbar from '../../components/TableToolbar.vue';
import { DialogWidth } from '../../utils/dialog';
import { EMessage } from '../../utils/message';
import {
  inboundOrderStatusLabels,
  inboundOrderStatusLabel,
  inventorySourceTypeLabels,
  inventorySourceTypeLabel,
  stockStatusLabels,
  stockStatusLabel,
} from '../../constants/business-status';

defineOptions({ name: 'InboundOrdersPage' });

interface InboundOrderItem {
  id: string;
  inboundNo: string;
  sourceType: InventorySourceType;
  provider: string;
  status: InboundOrderStatus;
  detailCount: number;
  totalInboundNumber: string;
  inboundAt: string;
  remark: string;
}

interface InboundDetailItem {
  itemCode: string;
  itemName: string;
  batchCode: string;
  inboundNumber: string;
  stockStatus: StockStatus;
}

type CreateDetailRow = {
  itemId: string;
  batchCode: string;
  inboundNumber: number;
  stockStatus: StockStatus;
  batchId?: string;
};

const demoRows: InboundOrderItem[] = [
  {
    id: '1',
    inboundNo: 'RK-20260721-001',
    sourceType: 'purchased',
    provider: '供应商A',
    status: 'completed',
    detailCount: 3,
    totalInboundNumber: '150.0000',
    inboundAt: '2026-07-21T09:30:00',
    remark: '正常采购入库',
  },
  {
    id: '2',
    inboundNo: 'RK-20260721-002',
    sourceType: 'self_made',
    provider: '',
    status: 'pending',
    detailCount: 2,
    totalInboundNumber: '50.0000',
    inboundAt: '',
    remark: '生产完工入库',
  },
  {
    id: '3',
    inboundNo: 'RK-20260720-003',
    sourceType: 'return_inbound',
    provider: '供应商B',
    status: 'pending',
    detailCount: 1,
    totalInboundNumber: '20.0000',
    inboundAt: '',
    remark: '质量退货',
  },
  {
    id: '4',
    inboundNo: 'RK-20260719-004',
    sourceType: 'outsourced',
    provider: '委外加工厂',
    status: 'completed',
    detailCount: 4,
    totalInboundNumber: '200.0000',
    inboundAt: '2026-07-19T16:00:00',
    remark: '',
  },
  {
    id: '5',
    inboundNo: 'RK-20260718-005',
    sourceType: 'other',
    provider: '',
    status: 'cancelled',
    detailCount: 0,
    totalInboundNumber: '0.0000',
    inboundAt: '',
    remark: '作废',
  },
];

const rows = ref<InboundOrderItem[]>([...demoRows]);
const detailRow = ref<InboundOrderItem | null>(null);
const detailDetails = ref<InboundDetailItem[]>([]);
const loading = ref(false);
const submitting = ref(false);
const total = ref(5);
const currentPage = ref(1);
const pageSize = ref(10);
const createVisible = ref(false);
const detailVisible = ref(false);
const query = reactive({ keyword: '', sourceType: '', status: '' });
const createForm = reactive({
  inboundNo: '',
  sourceType: 'purchased' as InventorySourceType,
  provider: '',
  remark: '',
  details: [] as CreateDetailRow[],
});

const addDetail = () =>
  createForm.details.push({
    itemId: '',
    batchCode: '',
    inboundNumber: 0,
    stockStatus: 'available',
  });
const removeDetail = (i: number) => createForm.details.splice(i, 1);

const loadRows = async () => {
  loading.value = true;
  setTimeout(() => {
    const kw = query.keyword.trim().toLowerCase();
    const st = query.sourceType;
    const ss = query.status;
    let filtered = [...demoRows];
    if (kw)
      filtered = filtered.filter(
        (r) =>
          r.inboundNo.toLowerCase().includes(kw) || (r.provider || '').toLowerCase().includes(kw),
      );
    if (st) filtered = filtered.filter((r) => r.sourceType === st);
    if (ss) filtered = filtered.filter((r) => r.status === ss);
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
  query.sourceType = '';
  query.status = '';
  currentPage.value = 1;
  await loadRows();
};
const handlePageSizeChange = async () => {
  currentPage.value = 1;
  await loadRows();
};

const openCreate = () => {
  createForm.inboundNo = '';
  createForm.sourceType = 'purchased';
  createForm.provider = '';
  createForm.remark = '';
  createForm.details = [];
  createVisible.value = true;
};

const submitCreate = async () => {
  if (!createForm.sourceType || createForm.details.length === 0) {
    EMessage.warning('请选择来源并填写明细');
    return;
  }
  submitting.value = true;
  setTimeout(() => {
    EMessage.success('入库单已创建');
    createVisible.value = false;
    submitting.value = false;
    loadRows();
  }, 500);
};

const openDetail = (row: InboundOrderItem) => {
  detailRow.value = row;
  detailDetails.value = [
    {
      itemCode: 'ITEM-001',
      itemName: '物料A',
      batchCode: 'BATCH-001',
      inboundNumber: '80.0000',
      stockStatus: 'available',
    },
    {
      itemCode: 'ITEM-002',
      itemName: '物料B',
      batchCode: 'BATCH-002',
      inboundNumber: '70.0000',
      stockStatus: 'pending_inspection',
    },
  ];
  detailVisible.value = true;
};

const handleConfirm = async (row: InboundOrderItem) => {
  try {
    await ElMessageBox.confirm('确认入库后将生成库存流水，是否继续？', '确认入库', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      type: 'warning',
    });
  } catch {
    return;
  }
  EMessage.success('已确认入库');
  await loadRows();
};

const handleCancel = async (row: InboundOrderItem) => {
  try {
    await ElMessageBox.confirm('确认取消该入库单？', '取消入库', {
      confirmButtonText: '确认取消',
      cancelButtonText: '不取消',
      type: 'warning',
    });
  } catch {
    return;
  }
  EMessage.success('已取消');
  await loadRows();
};

const formatQuantity = (v: string | number | null) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n.toLocaleString('zh-CN', { maximumFractionDigits: 4 }) : '-';
};
const formatTime = (v: string) => v.replace('T', ' ').slice(0, 19);

onMounted(loadRows);
</script>

<style scoped>
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
  justify-content: space-between;
  height: 56px;
  padding: 0 16px;
  border-bottom: 1px solid #e5e7eb;
}
.batch-actions {
  display: flex;
  gap: 8px;
}
.batch-actions :deep(.el-button) {
  height: 34px;
  border-radius: 6px;
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
.detail-row {
  margin-bottom: 8px;
}
</style>
