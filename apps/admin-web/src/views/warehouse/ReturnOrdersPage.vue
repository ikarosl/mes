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
            placeholder="退料单号"
          />
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
            /><el-option
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
          ><el-button @click="resetQuery">重置</el-button>
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
            >新增退料单</el-button
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
          prop="returnNo"
          label="退料单号"
          width="180"
        />
        <el-table-column
          prop="productionBatchId"
          label="生产批次ID"
          width="120"
        />
        <el-table-column
          label="状态"
          width="100"
        >
          <template #default="{ row }"
            ><el-tag
              :type="
                row.status === 'returned'
                  ? 'success'
                  : row.status === 'scrapped'
                    ? 'danger'
                    : row.status === 'cancelled'
                      ? 'info'
                      : 'warning'
              "
              effect="light"
              >{{ returnOrderStatusLabel(row.status) }}</el-tag
            ></template
          >
        </el-table-column>
        <el-table-column
          label="退料数量"
          width="130"
          align="right"
          ><template #default="{ row }">{{
            formatQuantity(row.totalReturnNumber)
          }}</template></el-table-column
        >
        <el-table-column
          label="退料时间"
          width="170"
          ><template #default="{ row }">{{
            row.returnAt ? formatTime(row.returnAt) : '-'
          }}</template></el-table-column
        >
        <el-table-column
          prop="remark"
          label="备注"
          min-width="140"
          show-overflow-tooltip
        />
        <el-table-column
          label="操作"
          width="300"
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
              @click="handleConfirmInbound(row)"
              >退料入库</el-button
            >
            <el-button
              v-if="row.status === 'pending'"
              link
              type="danger"
              @click="handleConfirmScrap(row)"
              >退料报废</el-button
            >
            <el-button
              v-if="row.status === 'pending'"
              link
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
      title="新增退料单"
      :width="DialogWidth.md"
    >
      <el-form
        class="dialog-form"
        label-width="120px"
        :model="createForm"
      >
        <el-form-item
          label="生产批次ID"
          required
          ><el-input v-model="createForm.productionBatchId"
        /></el-form-item>
        <el-form-item label="备注"
          ><el-input
            v-model="createForm.remark"
            type="textarea"
            :rows="2"
        /></el-form-item>
        <el-divider>退料明细</el-divider>
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
                v-model="d.allocationId"
                placeholder="分配ID"
                size="small"
            /></el-col>
            <el-col :span="6"
              ><el-input
                v-model="d.itemId"
                placeholder="对象ID"
                size="small"
            /></el-col>
            <el-col :span="6"
              ><el-input-number
                v-model="d.returnNumber"
                :min="0.0001"
                :precision="4"
                size="small"
                style="width: 100%"
            /></el-col>
            <el-col :span="4"
              ><el-checkbox v-model="d.releaseAfterReturn">释放</el-checkbox></el-col
            >
            <el-col :span="2"
              ><el-button
                link
                type="danger"
                :icon="Delete"
                size="small"
                @click="removeDetail(i)"
            /></el-col>
          </el-row>
        </div>
        <el-button
          size="small"
          @click="addDetail"
          >+ 添加行</el-button
        >
      </el-form>
      <template #footer
        ><el-button @click="createVisible = false">取消</el-button
        ><el-button
          type="primary"
          :loading="submitting"
          @click="submitCreate"
          >保存</el-button
        ></template
      >
    </el-dialog>

    <el-dialog
      v-model="detailVisible"
      title="退料单详情"
      :width="DialogWidth.md"
    >
      <el-descriptions
        v-if="detailRow"
        :column="2"
        border
      >
        <el-descriptions-item label="退料单号">{{ detailRow.returnNo }}</el-descriptions-item>
        <el-descriptions-item label="生产批次ID">{{
          detailRow.productionBatchId
        }}</el-descriptions-item>
        <el-descriptions-item label="状态"
          ><el-tag :type="detailRow.status === 'returned' ? 'success' : 'info'">{{
            returnOrderStatusLabels[detailRow.status]
          }}</el-tag></el-descriptions-item
        >
        <el-descriptions-item label="退料时间">{{
          detailRow.returnAt ? formatTime(detailRow.returnAt) : '-'
        }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessageBox } from 'element-plus';
import { Delete, Plus, Refresh } from '@element-plus/icons-vue';
import type { ReturnOrderStatus } from '@company/contracts';
import TableToolbar from '../../components/TableToolbar.vue';
import { DialogWidth } from '../../utils/dialog';
import { EMessage } from '../../utils/message';
import { returnOrderStatusLabel, returnOrderStatusLabels } from '../../constants/business-status';

defineOptions({ name: 'ReturnOrdersPage' });

interface ReturnOrderItem {
  id: string;
  returnNo: string;
  productionBatchId: string;
  status: ReturnOrderStatus;
  totalReturnNumber: string;
  returnAt: string;
  remark: string;
}

type CreateDetailRow = {
  allocationId: string;
  itemId: string;
  batchId: string;
  returnNumber: number;
  releaseAfterReturn: boolean;
};

const demoRows: ReturnOrderItem[] = [
  {
    id: '1',
    returnNo: 'TL-20260721-001',
    productionBatchId: 'SC-202607-001',
    status: 'returned',
    totalReturnNumber: '30.0000',
    returnAt: '2026-07-21T11:00:00',
    remark: '多余材料退回',
  },
  {
    id: '2',
    returnNo: 'TL-20260721-002',
    productionBatchId: 'SC-202607-002',
    status: 'pending',
    totalReturnNumber: '15.0000',
    returnAt: '',
    remark: '',
  },
  {
    id: '3',
    returnNo: 'TL-20260720-003',
    productionBatchId: 'SC-202607-001',
    status: 'scrapped',
    totalReturnNumber: '5.0000',
    returnAt: '2026-07-20T16:30:00',
    remark: '不良品报废',
  },
  {
    id: '4',
    returnNo: 'TL-20260719-004',
    productionBatchId: 'SC-202607-003',
    status: 'pending',
    totalReturnNumber: '20.0000',
    returnAt: '',
    remark: '生产余料',
  },
  {
    id: '5',
    returnNo: 'TL-20260718-005',
    productionBatchId: 'SC-202607-004',
    status: 'cancelled',
    totalReturnNumber: '0.0000',
    returnAt: '',
    remark: '取消',
  },
];

const rows = ref<ReturnOrderItem[]>([...demoRows]);
const detailRow = ref<ReturnOrderItem | null>(null);
const loading = ref(false);
const submitting = ref(false);
const total = ref(5);
const currentPage = ref(1);
const pageSize = ref(10);
const createVisible = ref(false);
const detailVisible = ref(false);
const query = reactive({ keyword: '', status: '' });
const createForm = reactive({
  productionBatchId: '',
  remark: '',
  details: [] as CreateDetailRow[],
});

const addDetail = () =>
  createForm.details.push({
    allocationId: '',
    itemId: '',
    batchId: '',
    returnNumber: 0,
    releaseAfterReturn: false,
  });
const removeDetail = (i: number) => createForm.details.splice(i, 1);

const loadRows = async () => {
  loading.value = true;
  setTimeout(() => {
    const kw = query.keyword.trim().toLowerCase();
    const ss = query.status;
    let filtered = [...demoRows];
    if (kw) filtered = filtered.filter((r) => r.returnNo.toLowerCase().includes(kw));
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
  query.status = '';
  currentPage.value = 1;
  await loadRows();
};
const handlePageSizeChange = async () => {
  currentPage.value = 1;
  await loadRows();
};

const openCreate = () => {
  createForm.productionBatchId = '';
  createForm.remark = '';
  createForm.details = [];
  createVisible.value = true;
};

const submitCreate = async () => {
  if (!createForm.productionBatchId || createForm.details.length === 0) {
    EMessage.warning('请填写生产批次和明细');
    return;
  }
  submitting.value = true;
  setTimeout(() => {
    EMessage.success('退料单已创建');
    createVisible.value = false;
    submitting.value = false;
    loadRows();
  }, 500);
};

const openDetail = (row: ReturnOrderItem) => {
  detailRow.value = row;
  detailVisible.value = true;
};

const handleConfirmInbound = async (_row?: any) => {
  try {
    await ElMessageBox.confirm('确认退料入库后生成库存流水，是否继续？', '确认退料入库', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      type: 'warning',
    });
  } catch {
    return;
  }
  EMessage.success('退料已入库');
  await loadRows();
};

const handleConfirmScrap = async (_row?: any) => {
  try {
    await ElMessageBox.confirm('确认退料报废后创建报废记录，是否继续？', '确认退料报废', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      type: 'warning',
    });
  } catch {
    return;
  }
  EMessage.success('退料已报废');
  await loadRows();
};

const handleCancel = async (_row?: any) => {
  try {
    await ElMessageBox.confirm('确认取消该退料单？', '取消退料', {
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
